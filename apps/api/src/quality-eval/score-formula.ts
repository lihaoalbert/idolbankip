/**
 * Score formula + SABC grading — W2.5 评分公式 (纯函数)
 *
 * 公式: composite = L1×0.15 + L2×0.30 + L3×0.25 + L4×0.30
 * 闸门: L3 = 0 → composite = 0 (一票否决)
 *       L1 < 0.60 → composite < 0.50 (技术质量不达标,直接打回)
 *       L4 < 0.40 → 触发"商业价值不达标"标记 (但不重算分数)
 *
 * 分级: ≥0.85=S / 0.70-0.85=A / 0.60-0.70=B / <0.60=C
 *
 * 用户拍板 (2026-07-02): 权重平台固定,跨 brief 可比,不可调整。
 * 关联: docs/research/quality-eval-benchmark-2026.md §1 / §8.2 / §9.1
 */

import type {
  L1TechnicalResult,
  L2AestheticResult,
  L3ComplianceResult,
  L4CommercialResult,
  QualityEvalResult,
  SabcGrade,
} from './types';

const WEIGHT_L1 = 0.15;
const WEIGHT_L2 = 0.30;
const WEIGHT_L3 = 0.25;
const WEIGHT_L4 = 0.30;

export const SAB_THRESHOLDS: ReadonlyArray<{ min: number; grade: SabcGrade }> = [
  { min: 0.85, grade: 'S' },
  { min: 0.7, grade: 'A' },
  { min: 0.6, grade: 'B' },
];

export function gradeFromScore(score: number): SabcGrade {
  for (const t of SAB_THRESHOLDS) {
    if (score >= t.min) return t.grade;
  }
  return 'C';
}

/** clamp 0-1,保留 4 位小数,避免浮点尾巴 */
export function clamp(n: number, lo = 0, hi = 1): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.round(Math.min(hi, Math.max(lo, n)) * 10_000) / 10_000;
}

export interface CompositeInput {
  l1: L1TechnicalResult;
  l2: L2AestheticResult;
  l3: L3ComplianceResult;
  l4: L4CommercialResult;
}

export interface CompositeOutput {
  compositeScore: number;
  grade: SabcGrade;
  decision: 'PASS' | 'FAIL' | 'REVIEW';
  /** 闸门触发原因 (前端展示用) */
  gateReason: 'none' | 'compliance_fatal' | 'technical_below_threshold';
  /** 商业价值不达标提示 */
  commercialWarning: boolean;
}

export function calcComposite(input: CompositeInput): CompositeOutput {
  const { l1, l2, l3, l4 } = input;

  // 闸门 1: L3 一票否决 (合规致命)
  if (l3.decision === 'FAIL' || l3.score === 0) {
    return {
      compositeScore: 0,
      grade: 'C',
      decision: 'FAIL',
      gateReason: 'compliance_fatal',
      commercialWarning: false,
    };
  }

  // 闸门 2: L1 < 0.60 → composite < 0.50 (技术不达标,直接打回)
  const technicalBelowThreshold = l1.score < 0.6;
  if (technicalBelowThreshold) {
    const composite = clamp(l1.score * 0.6 + l2.score * 0.1 + l3.score * 0.15 + l4.score * 0.15);
    return {
      compositeScore: clamp(Math.min(composite, 0.4999)),
      grade: 'C',
      decision: 'REVIEW',
      gateReason: 'technical_below_threshold',
      commercialWarning: l4.score < 0.4,
    };
  }

  // 正常加权
  const composite = clamp(
    l1.score * WEIGHT_L1 +
      l2.score * WEIGHT_L2 +
      l3.score * WEIGHT_L3 +
      l4.score * WEIGHT_L4,
  );
  const grade = gradeFromScore(composite);
  const decision: 'PASS' | 'REVIEW' | 'FAIL' = composite >= 0.7 ? 'PASS' : composite >= 0.5 ? 'REVIEW' : 'FAIL';

  return {
    compositeScore: composite,
    grade,
    decision,
    gateReason: 'none',
    commercialWarning: l4.score < 0.4,
  };
}

/**
 * 完整封装: 把 4 个 layer result + composite 装成最终 QualityEvalResult
 */
export function buildEvalResult(
  briefId: string,
  deliverableId: string,
  l1: L1TechnicalResult,
  l2: L2AestheticResult,
  l3: L3ComplianceResult,
  l4: L4CommercialResult,
  modelVersions: { L2: string; L3: string; L4: string },
): QualityEvalResult {
  const composite = calcComposite({ l1, l2, l3, l4 });
  return {
    briefId,
    deliverableId,
    l1,
    l2,
    l3,
    l4,
    compositeScore: composite.compositeScore,
    grade: composite.grade,
    decision: composite.decision,
    modelVersions: {
      L1: 'ffprobe+ffmpeg@2026-07',
      L2: modelVersions.L2,
      L3: modelVersions.L3,
      L4: modelVersions.L4,
    },
    evaluatedAt: new Date().toISOString(),
  };
}
