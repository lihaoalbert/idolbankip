/**
 * QualityEvalService — W2.5 主入口,串 L1+L2+L3+L4 全跑,落库 + 申诉
 *
 * 流程:
 *   1. 入参校验 (briefId / deliverableId 必填, thumbnailUrls 至少 1 张)
 *   2. 并发跑 L1/L2/L3/L4 (Promise.all, 任一异常不阻塞主线 → fallback 中性分)
 *   3. 调 calcComposite() 应用闸门 + SABC 分级
 *   4. persist() 写 QualityEval 表 + audit log (§D6)
 *   5. appeal() 入口 48h 1 次 SLA (§D7)
 *
 * 关联: docs/research/quality-eval-benchmark-2026.md §1 / §8.2 / §9.1 / §9.6
 */

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModerationService, L3EvaluationResult } from '../moderation/moderation.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { L1TechnicalService } from './l1-technical.service';
import { L2AestheticService } from './l2-aesthetic.service';
import { L4CommercialService } from './l4-commercial.service';
import { buildEvalResult, calcComposite } from './score-formula';
import type {
  L1TechnicalResult,
  L2AestheticResult,
  L3ComplianceResult,
  L4CommercialResult,
  QualityEvalInput,
  QualityEvalResult,
} from './types';

const DISCLAIMER_VERSION = 'v0.1-2026-07';
const APPEAL_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Prisma 行 + JSON 字段 (用于服务间传递) */
export interface QualityEvalRow {
  id: string;
  briefId: string;
  deliverableId: string | null;
  trigger: string;
  triggeredBy: string;
  l1Score: number;
  l2Score: number;
  l3Score: number;
  l4Score: number;
  compositeScore: number;
  grade: string;
  decision: string;
  gateReason: string;
  commercialWarning: boolean;
  l1Detail: unknown;
  l2Detail: unknown;
  l3Detail: unknown;
  l4Detail: unknown;
  modelVersions: unknown;
  disclaimerVersion: string;
  appealedAt: Date | null;
  appealReason: string | null;
  appealDecision: string | null;
  appealResponderId: string | null;
  appealSummary: string | null;
  createdAt: Date;
}

@Injectable()
export class QualityEvalService {
  private readonly logger = new Logger(QualityEvalService.name);

  constructor(
    private readonly l1: L1TechnicalService,
    private readonly l2: L2AestheticService,
    private readonly l3: ModerationService,
    private readonly l4: L4CommercialService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 内存评分,不落库 */
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

    this.logger.log(
      `evaluate done: brief=${input.briefId} composite=${result.compositeScore} grade=${result.grade} ` +
        `decision=${result.decision} gate=${result.l3.decision} ${Date.now() - start}ms`,
    );
    return result;
  }

  /**
   * 评分 + 持久化 — D6 主入口
   * 写 QualityEval 表 + audit log
   */
  async persist(
    input: QualityEvalInput,
    opts: { triggeredBy?: string; trigger?: string } = {},
  ): Promise<QualityEvalRow> {
    const start = Date.now();
    const result = await this.evaluate(input);
    const c = calcComposite({ l1: result.l1, l2: result.l2, l3: result.l3, l4: result.l4 });
    const trigger = opts.trigger || 'manual';
    const triggeredBy = opts.triggeredBy || input.triggeredBy || 'system';

    const row = await this.prisma.qualityEval.create({
      data: {
        briefId: input.briefId,
        deliverableId: input.deliverableId || null,
        trigger,
        triggeredBy,
        l1Score: result.l1.score,
        l2Score: result.l2.score,
        l3Score: result.l3.score,
        l4Score: result.l4.score,
        compositeScore: result.compositeScore,
        grade: result.grade,
        decision: result.decision,
        gateReason: c.gateReason,
        commercialWarning: c.commercialWarning,
        l1Detail: result.l1 as any,
        l2Detail: result.l2 as any,
        l3Detail: result.l3 as any,
        l4Detail: result.l4 as any,
        modelVersions: result.modelVersions as any,
        disclaimerVersion: DISCLAIMER_VERSION,
      },
    });
    await this.audit.log({
      actorId: triggeredBy,
      action: 'quality_eval.persisted',
      targetType: 'QualityEval',
      targetId: row.id,
      payload: {
        briefId: input.briefId,
        deliverableId: input.deliverableId,
        compositeScore: result.compositeScore,
        grade: result.grade,
        decision: result.decision,
        gateReason: c.gateReason,
      },
    });
    this.logger.log(`quality_eval persisted: id=${row.id} grade=${row.grade} ms=${Date.now() - start}`);
    return row as QualityEvalRow;
  }

  /**
   * 系统触发 — A/B 切流入口 (W2.5 D13-D14)
   *
   * 检查 rollout config, 按概率决定是否跑评分。
   * 用法: 未来 deliverable 上传 hook 里调用此方法, 而不是直接 persist().
   *
   * @returns QualityEvalRow if 跑了; null if 跳过 (mode=off 或不在桶内)
   */
  async systemTrigger(
    input: QualityEvalInput,
    rollout: { shouldEvaluate(deliverableId: string | null): Promise<{ run: boolean; mode: 'off' | 'shadow' | 'active' }> },
  ): Promise<{ row: QualityEvalRow | null; mode: 'off' | 'shadow' | 'active'; run: boolean }> {
    const decision = await rollout.shouldEvaluate(input.deliverableId || null);
    if (!decision.run) {
      this.logger.log(
        `systemTrigger skip: deliverableId=${input.deliverableId} mode=${decision.mode} (rollout 决策)`,
      );
      return { row: null, mode: decision.mode, run: false };
    }
    const row = await this.persist(input, { triggeredBy: 'system', trigger: 'deliverable' });
    return { row, mode: decision.mode, run: true };
  }

  /** 取某 deliverable 最新一条 */
  async getLatestByDeliverable(deliverableId: string): Promise<QualityEvalRow | null> {
    return (await this.prisma.qualityEval.findFirst({
      where: { deliverableId },
      orderBy: { createdAt: 'desc' },
    })) as QualityEvalRow | null;
  }

  /**
   * Admin 全量查询 — 评分队列
   * 支持 grade / decision / briefId / trigger 过滤 + 分页
   */
  async listAll(filter: {
    grade?: string;
    decision?: string;
    briefId?: string;
    trigger?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: QualityEvalRow[]; total: number; page: number; pageSize: number }> {
    const page = filter.page ?? 1;
    const pageSize = Math.min(filter.pageSize ?? 20, 100);
    const where: any = {};
    if (filter.grade) where.grade = filter.grade;
    if (filter.decision) where.decision = filter.decision;
    if (filter.briefId) where.briefId = filter.briefId;
    if (filter.trigger) where.trigger = filter.trigger;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.qualityEval.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.qualityEval.count({ where }),
    ]);
    return { items: items as QualityEvalRow[], total, page, pageSize };
  }

  /** Admin dashboard 统计 — 28 天分布 */
  async dashboardStats(): Promise<{
    totalCount: number;
    last7dCount: number;
    byGrade: Record<string, number>;
    byDecision: Record<string, number>;
    appealPending: number;
  }> {
    const [totalCount, last7dCount, byGrade, byDecision, appealPending] = await Promise.all([
      this.prisma.qualityEval.count(),
      this.prisma.qualityEval.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      }),
      this.prisma.qualityEval.groupBy({ by: ['grade'], _count: { _all: true } }),
      this.prisma.qualityEval.groupBy({ by: ['decision'], _count: { _all: true } }),
      this.prisma.qualityEval.count({ where: { appealedAt: { not: null }, appealDecision: null } }),
    ]);
    return {
      totalCount,
      last7dCount,
      byGrade: Object.fromEntries(byGrade.map((g) => [g.grade, g._count._all])),
      byDecision: Object.fromEntries(byDecision.map((d) => [d.decision, d._count._all])),
      appealPending,
    };
  }

  /** 取某 brief 全部 */
  async listByBrief(briefId: string, limit = 20): Promise<QualityEvalRow[]> {
    const items = await this.prisma.qualityEval.findMany({
      where: { briefId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return items as QualityEvalRow[];
  }

  async getById(id: string): Promise<QualityEvalRow> {
    const row = await this.prisma.qualityEval.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`QualityEval ${id} 不存在`);
    return row as QualityEvalRow;
  }

  /** 申诉 — 每条 1 次,SLA 48h (§9.1 #6) */
  async appeal(evalId: string, appealReason: string, actorId: string): Promise<QualityEvalRow> {
    if (!appealReason || appealReason.trim().length < 10) {
      throw new BadRequestException('申诉理由至少 10 字');
    }
    const cur = await this.prisma.qualityEval.findUnique({ where: { id: evalId } });
    if (!cur) throw new NotFoundException(`QualityEval ${evalId} 不存在`);
    if (cur.appealedAt) {
      throw new BadRequestException('已经申诉过 1 次, 平台人工复审结论为最终结论');
    }
    const ageMs = Date.now() - cur.createdAt.getTime();
    if (ageMs > APPEAL_WINDOW_MS) {
      throw new BadRequestException('已超过 48h 申诉窗口期');
    }
    const row = await this.prisma.qualityEval.update({
      where: { id: evalId },
      data: {
        appealedAt: new Date(),
        appealReason: appealReason.trim(),
      },
    });
    await this.audit.log({
      actorId,
      action: 'quality_eval.appeal_submitted',
      targetType: 'QualityEval',
      targetId: evalId,
      payload: { briefId: cur.briefId, reason: appealReason.slice(0, 200) },
    });
    return row as QualityEvalRow;
  }

  // ============ private ============

  private async safeL1(input: QualityEvalInput): Promise<L1TechnicalResult> {
    try {
      const url = pickFirstUrl(input.deliverableUrls);
      if (!url) {
        return neutralL1('无交付物 URL, L1 跳过');
      }
      return await this.l1.score({ videoUrl: url });
    } catch (e: any) {
      this.logger.warn(`L1 异常, fallback: ${e?.message ?? e}`);
      return neutralL1(`L1 异常: ${(e?.message ?? String(e)).slice(0, 100)}`);
    }
  }

  private async safeL2(input: QualityEvalInput): Promise<L2AestheticResult> {
    try {
      return await this.l2.score({
        thumbnailUrls: input.thumbnailUrls,
        description: input.deliverableDescription,
        creatorNote: input.creatorNote,
      });
    } catch (e: any) {
      this.logger.warn(`L2 异常, fallback 中性: ${e?.message ?? e}`);
      return neutralL2(`L2 异常: ${(e?.message ?? String(e)).slice(0, 100)}`, input.thumbnailUrls);
    }
  }

  private async safeL3(input: QualityEvalInput): Promise<L3EvaluationResult> {
    try {
      return await this.l3.evaluateL3({
        briefId: input.briefId,
        deliverableId: input.deliverableId,
        description: input.briefDescription,
        thumbnailUrls: input.thumbnailUrls,
        creatorNote: input.creatorNote,
        triggeredBy: input.triggeredBy,
      });
    } catch (e: any) {
      this.logger.warn(`L3 异常, fallback REVIEW: ${e?.message ?? e}`);
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
    } catch (e: any) {
      this.logger.warn(`L4 异常, fallback 中性: ${e?.message ?? e}`);
      return neutralL4(`L4 异常: ${(e?.message ?? String(e)).slice(0, 100)}`);
    }
  }
}

// ============ 顶层 helpers (模块内) ============

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
    provider: 'aliyun-green',
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
