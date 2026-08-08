/**
 * L8 Mock 评估器 — Phase 1 占位
 *
 * 真实评估(Phase 3)需接入:
 *   - FLAME / 3DMM 反推 → 真实解剖学参数
 *   - CLIP / DINOv2 embedding → 训练集相似度查撞
 *   - 美学打分 (LAION-Aesthetic predictor) → 主观质量
 *
 * Phase 1 用"参数指纹哈希 + 8 维 sub-score + 矛盾组合加分"做稳定可测的 mock:
 *   - 同输入同输出(用 JSON.stringify 做指纹,确定性)
 *   - score 范围 [0, 10]
 *   - 矛盾组合触发 originality bonus(故意反向激励"另类脸")
 *
 * 公式(每项 0~1,最终映射到 0~10):
 *   L1_complexity         = σ(L1 数值参数到中位数的距离之和)   (4 个滑块 + 1 个脸型指数)
 *   L2_expressiveness     = σ(L2 数值参数的标准差)             (6 个滑块)
 *   L3_distinctiveness    = σ(L3 数值+枚举)                     (12 项)
 *   L4_skin_realism       = 4 滑块的熵 + skinTone/skinTexture 组合数
 *   L5_hair_coverage      = 发型枚举 + 发色枚举 + 6 数值参数
 *   L6_decoration_completeness = 化妆/唇色/配饰 + 3 滑块
 *   L7_prompt_quality     = promptZh/promptEn 长度
 *   L8_contradiction_bonus     = 矛盾组合数 × 0.5 (max 2.0)
 *
 * 三大主分:
 *   originality    = (L1 + L2 + L3 + L6) / 4 × 10 + bonus
 *   consistency    = 10 - contradictions.length × 1.5 (夹到 0~10)
 *   aesthetics     = 三庭比例误差 + 脸型指数接近黄金 + L4 滑块熵
 */

import { detectContradictions, type Contradiction } from '../contradictions';
import type { L1SkeletonDto, L2SoftTissueDto, L3FeaturesDto, L4SkinDto, L5HairDto, L6DecorationDto } from '../dto/blueprint.dto';

export interface EvaluationSubScores {
  L1_complexity: number;
  L2_expressiveness: number;
  L3_distinctiveness: number;
  L4_skin_realism: number;
  L5_hair_coverage: number;
  L6_decoration_completeness: number;
  L7_prompt_quality: number;
  L8_contradiction_bonus: number;
}

export interface EvaluationScores {
  originality: number;
  consistency: number;
  aesthetics: number;
}

export interface EvaluationResult {
  scores: EvaluationScores;
  subScores: EvaluationSubScores;
  contradictions: Contradiction[];
  evaluatedAt: string;
}

export interface BlueprintLayersLike {
  L1_skeleton: L1SkeletonDto | null;
  L2_softTissue: L2SoftTissueDto | null;
  L3_features: L3FeaturesDto | null;
  L4_skin: L4SkinDto | null;
  L5_hair: L5HairDto | null;
  L6_decoration: L6DecorationDto | null;
  L7_render: { promptZh?: string; promptEn?: string } | null;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// L1 复杂度:5 数值参数到"典型值"的距离,归一化到 0~1
// 典型值:faceIndex=1.35, cheekboneWidth=0.55, cheekboneProminence=0.4, jawWidth=0.5, upperThirdRatio=0.33
const L1_TYPICAL = { faceIndex: 1.35, cheekboneWidth: 0.55, cheekboneProminence: 0.4, jawWidth: 0.5, upperThirdRatio: 0.33 } as const;

function l1Complexity(l1: L1SkeletonDto | null): number {
  if (!l1) return 0.5;
  const dFace = Math.abs(l1.faceIndex - L1_TYPICAL.faceIndex) / 0.3; // 0.6 是 1.0~1.6 范围
  const dCheekW = Math.abs(l1.cheekboneWidth - L1_TYPICAL.cheekboneWidth);
  const dCheekP = Math.abs(l1.cheekboneProminence - L1_TYPICAL.cheekboneProminence);
  const dJaw = Math.abs(l1.jawWidth - L1_TYPICAL.jawWidth);
  const dUpper = Math.abs(l1.upperThirdRatio - L1_TYPICAL.upperThirdRatio);
  const avg = (dFace + dCheekW + dCheekP + dJaw + dUpper) / 5;
  return clamp01(avg * 2); // 放大,典型脸 → 0,极端脸 → ~1
}

// L2 表现力:6 数值参数的标准差(归一化,标准差大 = 极端)
function l2Expressiveness(l2: L2SoftTissueDto | null): number {
  if (!l2) return 0.5;
  const vals = [l2.subcutaneousFat, l2.masseter, l2.buccalFat, l2.eyeSocketDepth, l2.browRidge, l2.nasolabialFold];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return clamp01(Math.sqrt(variance) * 2.5);
}

// L3 独特性:12 数值 + 枚举组合
// 数值:10 个滑块到中位数 0.5 的距离之和
// 枚举:眼型(6 选 1 = 0.83) + 鼻梁(3 选 1 = 0.67)
const EYE_SHAPE_BONUS: Record<string, number> = { single: 0.9, inner: 0.8, double: 0.3, phoenix: 0.85, round: 0.7, narrow: 0.85 };
const NOSE_BRIDGE_BONUS: Record<string, number> = { high: 0.85, medium: 0.4, low: 0.75 };

function l3Distinctiveness(l3: L3FeaturesDto | null): number {
  if (!l3) return 0.5;
  const numeric = [l3.eyeDistance, l3.eyeApertureHeight, l3.noseLength, l3.noseWidth, l3.lipWidth, l3.lipThickness, l3.earPosition, l3.earSize, l3.philtrumLength, l3.chinProtrusion];
  const distSum = numeric.reduce((a, b) => a + Math.abs(b - 0.5), 0) / numeric.length;
  const eyeBonus = EYE_SHAPE_BONUS[l3.eyeShape] ?? 0.5;
  const noseBonus = NOSE_BRIDGE_BONUS[l3.noseBridge] ?? 0.5;
  return clamp01(distSum * 2 * 0.5 + eyeBonus * 0.3 + noseBonus * 0.2);
}

// L4 皮肤真实感:4 滑块熵(0~0.5=无特征, 0.5~1=有雀斑痣皱纹)
function l4SkinRealism(l4: L4SkinDto | null): number {
  if (!l4) return 0.4;
  const features = l4.freckles + l4.moles + l4.wrinkles + l4.pores;
  const presence = clamp01(features / 2); // 总和 2 = 满脸特征
  // 极端 skinTone + 极端 skinTexture 加分
  const toneExtreme = l4.skinTone === 'fair' || l4.skinTone === 'dark' ? 0.2 : 0;
  const texExtreme = l4.skinTexture === 'rough' || l4.skinTexture === 'oily' ? 0.1 : 0;
  return clamp01(presence * 0.7 + toneExtreme + texExtreme);
}

// L5 毛发覆盖:发型枚举 + 发色枚举 + 数值参数
const HAIR_STYLE_BONUS: Record<string, number> = { straight_long: 0.3, straight_short: 0.5, wavy: 0.7, curly: 0.85, ponytail: 0.8, bob: 0.6, bald: 1.0 };
const HAIR_COLOR_BONUS: Record<string, number> = { black: 0.3, brown: 0.5, blonde: 0.8, red: 0.85, silver: 0.9, gray: 0.7, highlight: 0.9 };

function l5HairCoverage(l5: L5HairDto | null): number {
  if (!l5) return 0.4;
  const styleBonus = HAIR_STYLE_BONUS[l5.hairStyle] ?? 0.5;
  const colorBonus = HAIR_COLOR_BONUS[l5.hairColor] ?? 0.5;
  const browDensity = l5.browDensity;
  const sideburns = l5.sideburns;
  return clamp01(styleBonus * 0.3 + colorBonus * 0.3 + browDensity * 0.2 + sideburns * 0.2);
}

// L6 修饰完整度:化妆 + 唇色 + 配饰 + 3 滑块
const MAKEUP_BONUS: Record<string, number> = { none: 0.2, natural: 0.4, light: 0.6, heavy: 0.85, costume: 1.0 };
const LIP_COLOR_BONUS: Record<string, number> = { natural: 0.3, red: 0.7, pink: 0.5, orange: 0.7, nude: 0.4, dark: 0.85 };
const ACCESSORY_BONUS: Record<string, number> = { none: 0, earrings: 0.6, necklace: 0.5, headband: 0.4, mask: 0.9, glasses: 0.7 };

function l6DecorationCompleteness(l6: L6DecorationDto | null): number {
  if (!l6) return 0.3;
  const makeupBonus = MAKEUP_BONUS[l6.makeup] ?? 0.5;
  const lipBonus = LIP_COLOR_BONUS[l6.lipColor] ?? 0.5;
  const accBonus = ACCESSORY_BONUS[l6.accessory] ?? 0;
  const sliders = (l6.blush + l6.eyeshadow + l6.facePaint) / 3;
  return clamp01(makeupBonus * 0.3 + lipBonus * 0.2 + accBonus * 0.2 + sliders * 0.3);
}

// L7 prompt 质量:中英 prompt 长度
function l7PromptQuality(l7: BlueprintLayersLike['L7_render']): number {
  if (!l7) return 0;
  const zh = l7.promptZh?.length ?? 0;
  const en = l7.promptEn?.length ?? 0;
  // 100 字满分(中), 200 字符满分(英)
  return clamp01(zh / 100 * 0.5 + en / 200 * 0.5);
}

// L8 矛盾组合 bonus
function l8ContradictionBonus(contradictions: Contradiction[]): number {
  return clamp01(contradictions.length * 0.5);
}

/**
 * 算 8 维 sub-score(全部 0~1)
 */
export function computeSubScores(layers: BlueprintLayersLike, contradictions: Contradiction[]): EvaluationSubScores {
  return {
    L1_complexity: l1Complexity(layers.L1_skeleton as L1SkeletonDto | null),
    L2_expressiveness: l2Expressiveness(layers.L2_softTissue as L2SoftTissueDto | null),
    L3_distinctiveness: l3Distinctiveness(layers.L3_features as L3FeaturesDto | null),
    L4_skin_realism: l4SkinRealism(layers.L4_skin as L4SkinDto | null),
    L5_hair_coverage: l5HairCoverage(layers.L5_hair as L5HairDto | null),
    L6_decoration_completeness: l6DecorationCompleteness(layers.L6_decoration as L6DecorationDto | null),
    L7_prompt_quality: l7PromptQuality(layers.L7_render),
    L8_contradiction_bonus: l8ContradictionBonus(contradictions),
  };
}

/**
 * 算 3 维主分(0~10,带 1 位小数)
 *
 * originality  = (L1 + L2 + L3 + L6) / 4 × 10 + bonus × 2 (max 1.5 加分)
 * consistency  = 10 - contradictions.length × 1.5 (夹 0~10)
 * aesthetics   = (1 - 三庭比例误差) × 5 + faceIndex 黄金度 × 3 + L4 滑块熵 × 2
 */
export function computeMainScores(sub: EvaluationSubScores, layers: BlueprintLayersLike, contradictions: Contradiction[]): EvaluationScores {
  // originality
  const origRaw = (sub.L1_complexity + sub.L2_expressiveness + sub.L3_distinctiveness + sub.L6_decoration_completeness) / 4;
  const origBonus = sub.L8_contradiction_bonus * 1.5; // max +1.5
  const originality = round1(clamp01(origRaw + origBonus / 10) * 10);

  // consistency
  const consistency = round1(Math.max(0, Math.min(10, 10 - contradictions.length * 1.5)));

  // aesthetics
  const l1 = layers.L1_skeleton as L1SkeletonDto | null;
  let threeCourtScore = 0.5; // 默认中等
  let faceIndexGolden = 0.5;
  if (l1) {
    // 三庭比例误差:上停 0.33, 中停 0.34, 下停 = 1 - 上 - 中
    const lowerThird = 1 - l1.upperThirdRatio - l1.midThirdRatio;
    const ideal = { upper: 0.33, mid: 0.34, lower: 0.33 };
    const err = (Math.abs(l1.upperThirdRatio - ideal.upper) + Math.abs(l1.midThirdRatio - ideal.mid) + Math.abs(lowerThird - ideal.lower)) / 3;
    threeCourtScore = clamp01(1 - err * 3); // 误差越大分越低
    // 脸型指数黄金度:1.0~1.6 范围,1.3 附近最佳
    faceIndexGolden = clamp01(1 - Math.abs(l1.faceIndex - 1.3) / 0.3);
  }
  const aestheticsRaw = threeCourtScore * 5 + faceIndexGolden * 3 + sub.L4_skin_realism * 2;
  const aesthetics = round1(Math.max(0, Math.min(10, aestheticsRaw)));

  return { originality, consistency, aesthetics };
}

/**
 * 主入口:接收 layers → 跑全部评分
 */
export function evaluate(layers: BlueprintLayersLike): EvaluationResult {
  const contradictions = detectContradictions(layers as any);
  const subScores = computeSubScores(layers, contradictions);
  const scores = computeMainScores(subScores, layers, contradictions);
  return {
    scores,
    subScores,
    contradictions,
    evaluatedAt: new Date().toISOString(),
  };
}
