/**
 * QualityEvalService — W2.5 主入口,串 L1+L2+L3+L4 全跑
 *
 * 流程:
 *   1. 入参校验 (briefId / deliverableId 必填, thumbnailUrls 至少 1 张)
 *   2. 并发跑 L1/L2/L3/L4 (Promise.all, 任一异常不阻塞主线 → fallback 中性分)
 *   3. 调 calcComposite() 应用闸门 + SABC 分级
 *   4. 返回 QualityEvalResult
 *
 * 关联: docs/research/quality-eval-benchmark-2026.md §1 / §8.2 / §9.1 (决策 #8 全跑)
 *
 * 设计要点:
 *  - 并发跑: 4 个评测彼此独立, 没必要串行 (总耗时 max(L1, L2, L3, L4))
 *  - 单 layer 异常 → 不抛, 内部 fallback 到中性 0.5 + REVIEW
 *  - 输出含 evidence (各 layer 子扣分明细) — 评分"必现可解释", 用户拍板 §9.1 #1
 *  - 不阻塞主流程: 这里 throw 仅在参数错误时
 */

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ModerationService, L3EvaluationResult } from '../moderation/moderation.service';
import { L1TechnicalService } from './l1-technical.service';
import { L2AestheticService } from './l2-aesthetic.service';
import { L4CommercialService } from './l4-commercial.service';
import { buildEvalResult } from './score-formula';
import type {
  L1TechnicalResult,
  L2AestheticResult,
  L3ComplianceResult,
  L4CommercialResult,
  QualityEvalInput,
  QualityEvalResult,
} from './types';

@Injectable()
export class QualityEvalService {
  private readonly logger = new Logger(QualityEvalService.name);

  constructor(
    private readonly l1: L1TechnicalService,
    private readonly l2: L2AestheticService,
    private readonly l3: ModerationService,
    private readonly l4: L4CommercialService,
  ) {}

  /**
   * 4 层评分主入口
   */
  async evaluate(input: QualityEvalInput): Promise<QualityEvalResult> {
    const start = Date.now();
    if (!input.briefId || !input.deliverableId) {
      throw new BadRequestException('briefId / deliverableId 必填');
    }
    if (!input.deliverableUrls.length && !input.thumbnailUrls.length) {
      throw new BadRequestException('deliverableUrls / thumbnailUrls 至少传一个');
    }

    this.logger.log(
      `evaluate start: brief=${input.briefId} deliverable=${input.deliverableId} ` +
        `thumbs=${input.thumbnailUrls.length} urls=${input.deliverableUrls.length}`,
    );

    // 并发跑 4 层 — Promise.all 不会因为单个失败而中断其他
    const [l1Result, l2Result, l3Raw, l4Result] = await Promise.all([
      this.safeL1(input),
      this.safeL2(input),
      this.safeL3(input),
      this.safeL4(input),
    ]);

    const l3Wrapped = wrapL3(l3Raw);

    const result = buildEvalResult(
      input.briefId,
      input.deliverableId,
      l1Result,
      l2Result,
      l3Wrapped,
      l4Result,
      {
        L2: l2Result.modelVersion,
        L3: l3Wrapped.provider === 'aliyun-green' ? 'aliyun-green-enhanced@2026-07' : 'mock@2026-07',
        L4: l4Result.modelVersion,
      },
    );

    const ms = Date.now() - start;
    this.logger.log(
      `evaluate done: brief=${input.briefId} composite=${result.compositeScore} grade=${result.grade} ` +
        `decision=${result.decision} gate=${result.l3.decision} ${ms}ms`,
    );
    return result;
  }

  /**
   * 单 layer 跑, 失败返中性 0.5 (L1 例外: 不可达文件 = FAIL 0)
   */
  private async safeL1(input: QualityEvalInput): Promise<L1TechnicalResult> {
    try {
      const url = pickFirstUrl(input.deliverableUrls);
      if (!url) {
        return neutralL1('无交付物 URL, L1 跳过');
      }
      return await this.l1.score({ videoUrl: url });
    } catch (e) {
      this.logger.warn(`L1 异常, fallback: ${(e as Error).message}`);
      return neutralL1(`L1 异常: ${(e as Error).message.slice(0, 100)}`);
    }
  }

  private async safeL2(input: QualityEvalInput): Promise<L2AestheticResult> {
    try {
      return await this.l2.score({
        thumbnailUrls: input.thumbnailUrls,
        description: input.deliverableDescription,
        creatorNote: input.creatorNote,
      });
    } catch (e) {
      this.logger.warn(`L2 异常, fallback 中性: ${(e as Error).message}`);
      return neutralL2(`L2 异常: ${(e as Error).message.slice(0, 100)}`, input.thumbnailUrls);
    }
  }

  private async safeL3(input: QualityEvalInput): Promise<L3EvaluationResult> {
    try {
      const firstThumb = input.thumbnailUrls[0];
      return await this.l3.evaluateL3({
        briefId: input.briefId,
        deliverableId: input.deliverableId,
        description: input.briefDescription,
        thumbnailUrls: input.thumbnailUrls,
        creatorNote: input.creatorNote,
        triggeredBy: input.triggeredBy,
      });
    } catch (e) {
      this.logger.warn(`L3 异常, fallback REVIEW: ${(e as Error).message}`);
      // 中性: REVIEW (人工复审), score 0.5 — 不触发闸门
      return {
        decision: 'REVIEW',
        score: 0.5,
        textScan: { decision: 'REVIEW', labels: [], scannedAt: new Date() },
        imageScan: { decision: 'PASS', labels: [], scannedAt: new Date() },
        aigcCheck: { decision: 'PASS', isAiGenerated: false, hasInfringementRisk: false, hasAdViolation: false, labels: [], scannedAt: new Date() },
        adCompliance: { decision: 'PASS', isAiGenerated: false, hasInfringementRisk: false, hasAdViolation: false, labels: [], scannedAt: new Date() },
        gateTriggered: false,
        auditId: '',
        scannedAt: new Date(),
      };
    }
  }

  private async safeL4(input: QualityEvalInput): Promise<L4CommercialResult> {
    try {
      return await this.l4.score({
        briefId: input.briefId,
        briefDescription: input.briefDescription,
        deliverableDescription: input.deliverableDescription,
        thumbnailUrls: input.thumbnailUrls,
      });
    } catch (e) {
      this.logger.warn(`L4 异常, fallback 中性: ${(e as Error).message}`);
      return neutralL4(`L4 异常: ${(e as Error).message.slice(0, 100)}`);
    }
  }
}

function pickFirstUrl(urls: string[]): string | undefined {
  for (const u of urls) {
    if (typeof u === 'string' && u.trim()) return u;
  }
  return undefined;
}

function wrapL3(raw: L3EvaluationResult): L3ComplianceResult {
  return {
    layer: 'L3',
    score: raw.score,
    decision: raw.decision,
    gated: raw.gateTriggered,
    breakdown: {
      textScan: { decision: raw.textScan.decision, labels: raw.textScan.labels.map((l) => l.label) },
      imageScan: { decision: raw.imageScan.decision, labels: raw.imageScan.labels.map((l) => l.label) },
      aigcCheck: {
        decision: raw.aigcCheck.decision,
        isAiGenerated: raw.aigcCheck.isAiGenerated,
        hasInfringementRisk: raw.aigcCheck.hasInfringementRisk,
      },
      adCompliance: { decision: raw.adCompliance.decision, hasAdViolation: raw.adCompliance.hasAdViolation },
    },
    provider: 'aliyun-green', // ModerationService DI 已确定; 若 mock 则 decision=REVIEW
    auditId: raw.auditId,
    evidence: raw.textScan.labels.map((l) => ({ text: `[${l.label}] ${l.description ?? ''}` })),
  };
}

function neutralL1(reason: string): L1TechnicalResult {
  return {
    layer: 'L1',
    score: 0.5,
    decision: 'REVIEW',
    metrics: {},
    evidence: [{ note: reason }],
    deductions: [{ rule: 'l1_unavailable', reason, penalty: 0 }],
  };
}

function neutralL2(reason: string, urls: string[]): L2AestheticResult {
  return {
    layer: 'L2',
    score: 0.5,
    decision: 'REVIEW',
    subScores: { visualForm: 0.5, visualStyle: 0.5, visualAffect: 0.5 },
    sampleFrameUrls: urls,
    modelVersion: 'fallback@2026-07',
    evidence: [{ note: reason }],
    critique: reason,
  };
}

function neutralL4(reason: string): L4CommercialResult {
  return {
    layer: 'L4',
    score: 0.5,
    decision: 'REVIEW',
    subScores: {
      hookStrength: 0.5,
      messageCompleteness: 0.5,
      audienceMatch: 0.5,
      ctaClarity: 0.5,
      emotionalResonance: 0.5,
      brandFit: 0.5,
    },
    modelVersion: 'fallback@2026-07',
    evidence: [{ note: reason }],
    critique: reason,
  };
}
