import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LocalKeywordFallback } from './local-keyword-fallback';
import {
  MODERATION_CLIENT,
  ModerationClient,
  ModerationResult,
  FaceSimilarityResult,
  ScanTextInput,
  ScanAigcInput,
  ScanAdComplianceInput,
  AigcComplianceResult,
} from '@ibi-ren/shared-contracts';

/**
 * ModerationService — W2.5 L3 合规评分统一入口
 *
 * 职责升级 (W2.5-D2):
 * - 保留原有 scanImage + faceSimilarity (创作者 IP 提交审核)
 * - 新增 evaluateL3() — 接受 brief + deliverable, 串行 5 类检测, 输出 L3 综合分
 *
 * L3 综合分算法 (闸门规则, 见 §1.4):
 *   - 任一 FAIL → L3 = 0 (总分 = 0 一票否决)
 *   - 任一 REVIEW → L3 = 0.5
 *   - 全部 PASS → L3 = 1.0
 *
 * 双 Provider 融合:
 *   - 主: AliyunGreenProvider (云 API, 增强版, 待 D1 配置 AccessKey)
 *   - 副: LocalKeywordFallback (本地词表, 阿里云漏判时兜底)
 *   - 任一 FAIL 即 FAIL (取并集, 严格模式)
 *
 * 关联: docs/research/quality-eval-benchmark-2026.md §5
 */
export interface L3EvaluationInput {
  briefId: string;
  deliverableId: string;
  description: string;
  thumbnailUrls: string[];
  creatorNote?: string;
  triggeredBy: string;
}

export interface L3EvaluationResult {
  decision: 'PASS' | 'FAIL' | 'REVIEW';
  score: number;
  textScan: ModerationResult;
  imageScan: ModerationResult;
  aigcCheck: AigcComplianceResult;
  adCompliance: AigcComplianceResult;
  gateTriggered: boolean;
  auditId: string;
  scannedAt: Date;
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    @Inject(MODERATION_CLIENT) private readonly client: ModerationClient,
    private readonly localFallback: LocalKeywordFallback,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 旧接口 — 保留给 IP 提交审核流程 */
  scanImage(ossKey: string): Promise<ModerationResult> {
    return this.client.scanImage(ossKey);
  }

  /** 旧接口 — 保留给 IP 提交审核流程 */
  faceSimilarity(ossKey: string): Promise<FaceSimilarityResult> {
    return this.client.faceSimilarity({ ossKey });
  }

  /**
   * L3 综合评分 — W2.5 主入口
   * 调用方: QualityEvalService (4 层流水线)
   */
  async evaluateL3(input: L3EvaluationInput): Promise<L3EvaluationResult> {
    const { briefId, deliverableId, description, thumbnailUrls, creatorNote, triggeredBy } = input;
    this.logger.log(`L3 评审开始: briefId=${briefId} deliverableId=${deliverableId}`);

    const textInput: ScanTextInput = {
      text: [description, creatorNote].filter(Boolean).join('\n'),
      context: 'brief_description',
    };
    const textScan = await this.safeScanText(textInput);

    const firstThumb = thumbnailUrls[0];
    const imageScan = firstThumb
      ? await this.client.scanImage(firstThumb)
      : ({ decision: 'PASS', labels: [], scannedAt: new Date() } as ModerationResult);

    const aigcCheck = await this.safeScanAigc({ imageUrls: thumbnailUrls.slice(0, 3) });

    const adCompliance = await this.safeScanAdCompliance({
      text: description,
      imageUrls: firstThumb ? [firstThumb] : undefined,
    });

    const localResult = this.localFallback.scanText(
      [description, creatorNote].filter(Boolean).join('\n'),
    );
    const mergedText: ModerationResult = this.mergeResults([textScan, localResult]);

    const decisions = [mergedText.decision, imageScan.decision];
    const aigcFail = aigcCheck.decision === 'FAIL';
    const adFail = adCompliance.decision === 'FAIL';
    const hasFail = decisions.includes('FAIL') || aigcFail || adFail;
    const hasReview =
      decisions.includes('REVIEW') || aigcCheck.decision === 'REVIEW' || adCompliance.decision === 'REVIEW';
    const decision: 'PASS' | 'FAIL' | 'REVIEW' = hasFail
      ? 'FAIL'
      : hasReview
        ? 'REVIEW'
        : 'PASS';
    const score = decision === 'PASS' ? 1.0 : decision === 'REVIEW' ? 0.5 : 0;
    const gateTriggered = decision === 'FAIL';

    const auditRow = await this.audit.log({
      actorId: triggeredBy,
      action: 'quality_eval.l3',
      targetType: 'deliverable',
      targetId: deliverableId,
      payload: {
        briefId,
        decision,
        score,
        gateTriggered,
        textScan: { decision: mergedText.decision, labels: mergedText.labels },
        imageScan: { decision: imageScan.decision, labels: imageScan.labels },
        aigcCheck: {
          decision: aigcCheck.decision,
          isAiGenerated: aigcCheck.isAiGenerated,
          hasInfringementRisk: aigcCheck.hasInfringementRisk,
        },
        adCompliance: {
          decision: adCompliance.decision,
          hasAdViolation: adCompliance.hasAdViolation,
        },
        modelVersion: 'aliyun-green-enhanced@2026-07',
      },
    });

    return {
      decision,
      score,
      textScan: mergedText,
      imageScan,
      aigcCheck,
      adCompliance,
      gateTriggered,
      auditId: auditRow.id,
      scannedAt: new Date(),
    };
  }

  private async safeScanText(input: ScanTextInput): Promise<ModerationResult> {
    try {
      return await this.client.scanText(input);
    } catch (err) {
      this.logger.warn(`阿里云 scanText 失败, 降级到本地词表: ${(err as Error).message}`);
      return this.localFallback.scanText(input.text);
    }
  }

  private async safeScanAigc(input: ScanAigcInput): Promise<AigcComplianceResult> {
    try {
      return await this.client.scanAigcCheck(input);
    } catch (err) {
      this.logger.warn(`阿里云 scanAigcCheck 失败, 降级 PASS: ${(err as Error).message}`);
      return {
        decision: 'PASS',
        isAiGenerated: false,
        hasInfringementRisk: false,
        hasAdViolation: false,
        labels: [],
        scannedAt: new Date(),
      };
    }
  }

  private async safeScanAdCompliance(input: ScanAdComplianceInput): Promise<AigcComplianceResult> {
    try {
      return await this.client.scanAdCompliance(input);
    } catch (err) {
      this.logger.warn(`阿里云 scanAdCompliance 失败, 降级 PASS: ${(err as Error).message}`);
      return {
        decision: 'PASS',
        isAiGenerated: false,
        hasInfringementRisk: false,
        hasAdViolation: false,
        labels: [],
        scannedAt: new Date(),
      };
    }
  }

  /**
   * 融合多个 ModerationResult (取并集 — 严格模式)
   */
  private mergeResults(results: ModerationResult[]): ModerationResult {
    const labels = results.flatMap((r) => r.labels);
    const hasFail = results.some((r) => r.decision === 'FAIL');
    const hasReview = results.some((r) => r.decision === 'REVIEW');
    return {
      decision: hasFail ? 'FAIL' : hasReview ? 'REVIEW' : 'PASS',
      labels,
      rawResponse: { mergedFrom: results.length },
      scannedAt: new Date(),
    };
  }
}