/**
 * Quality-eval 公共类型 — W2.5 (4 层 AI 自动评分)
 *
 * 不依赖 NestJS / Prisma — 纯类型声明,服务间共享。
 * 关联: docs/research/quality-eval-benchmark-2026.md §1 / §8.2
 *
 * 4 层评分范围: 0-1 (float)
 * 评分公式: L1×0.15 + L2×0.30 + L3×0.25 + L4×0.30
 * 分级: S ≥0.85 / A 0.70-0.85 / B 0.60-0.70 / C <0.60
 * 闸门: L3 = 0 → 总分 = 0 (一票否决)
 */

export type SabcGrade = 'S' | 'A' | 'B' | 'C';

export type LayerDecision = 'PASS' | 'REVIEW' | 'FAIL';

export interface EvidenceClip {
  /** 时间码或帧号,字符串便于横纵 (例 "00:01:23.456" 或 "frame_07") */
  timecode?: string;
  /** OSS / 缩略图 URL,可被前端直接显示 */
  url?: string;
  /** 文字描述或 OCR 文本 */
  text?: string;
  /** 边界框 (像素, 仅图像类证据) */
  bbox?: { x: number; y: number; w: number; h: number };
  /** 备注 */
  note?: string;
}

export interface L1TechnicalResult {
  layer: 'L1';
  score: number;
  decision: LayerDecision;
  metrics: {
    durationSec?: number;
    width?: number;
    height?: number;
    fps?: number;
    videoCodec?: string;
    audioCodec?: string;
    videoBitrateKbps?: number;
    audioBitrateKbps?: number;
    colorSpace?: string;
    /** 黑帧占比 (0-1) — ffmpeg blackdetect 估算 */
    blackFrameRatio?: number;
    /** 音频平均电平 dBFS (audiodetect) */
    avgAudioLevelDb?: number;
    /** 总噪音/异常帧数 */
    anomalyFrames?: number;
  };
  evidence: EvidenceClip[];
  /** 子项加权扣分明细,用于 evidence 必现 */
  deductions: Array<{ rule: string; reason: string; penalty: number }>;
}

export interface L2AestheticResult {
  layer: 'L2';
  score: number;
  decision: LayerDecision;
  /**
   * 美学子维度 (VideoAesBench 风格三件套):
   * - visualForm     视觉形式 (构图/帧稳定性/景深)
   * - visualStyle    视觉风格 (色调/光感/风格一致性)
   * - visualAffect   视觉感染力 (情感共鸣/记忆点)
   * - lipsync        口型同步 (MuseTalk 时代后续接, W2.5 默认 N/A)
   *
   * 每个 0-1。lipsync=undefined 时不计入 score 平均
   */
  subScores: {
    visualForm: number;
    visualStyle: number;
    visualAffect: number;
    lipsync?: number;
  };
  /** 抽帧样本,前 N 张缩略图 URL,供前端展示 */
  sampleFrameUrls: string[];
  modelVersion: string;
  evidence: EvidenceClip[];
  /** 主问题清单:美学习惯用语,例 "画面偏暗,缺乏视觉冲击" */
  critique: string;
}

export interface L3ComplianceResult {
  layer: 'L3';
  score: number;
  decision: 'PASS' | 'FAIL' | 'REVIEW';
  /** L3 一票否决闸门 */
  gated: boolean;
  /** 各 provider 各检测项结果 */
  breakdown: {
    textScan: { decision: LayerDecision; labels: string[] };
    imageScan: { decision: LayerDecision; labels: string[] };
    aigcCheck: { decision: LayerDecision; isAiGenerated: boolean; hasInfringementRisk: boolean };
    adCompliance: { decision: LayerDecision; hasAdViolation: boolean };
  };
  provider: 'aliyun-green' | 'mock';
  auditId?: string;
  evidence: EvidenceClip[];
}

export interface L4CommercialResult {
  layer: 'L4';
  score: number;
  decision: LayerDecision;
  /** 商业价值子维度 */
  subScores: {
    /** Hook 强度 — 前 3 秒抓人 */
    hookStrength: number;
    /** 信息传递完整性 */
    messageCompleteness: number;
    /** 目标人群匹配 */
    audienceMatch: number;
    /** CTA 清晰度 */
    ctaClarity: number;
    /** 情感共鸣度 */
    emotionalResonance: number;
    /** 品牌调性契合 */
    brandFit: number;
  };
  modelVersion: string;
  evidence: EvidenceClip[];
  /** LLM 输出的商务评估短评 */
  critique: string;
}

/** 输入 — 4 层评分统一入参 */
export interface QualityEvalInput {
  /** 唯一 ID 用于关联 deliverable / brief */
  briefId: string;
  deliverableId: string;
  /** brief 描述 (用于 L4 比对) */
  briefDescription: string;
  /** 交付物描述 (创作者填的) */
  deliverableDescription?: string;
  /** 交付物文件 OSS URL 列表 */
  deliverableUrls: string[];
  /** 已抽帧的缩略图 (调用方先抽,这里直接用),最多 8 张,L2/VLM 主用 */
  thumbnailUrls: string[];
  creatorNote?: string;
  /** 触发评审的用户 (admin / system / creator) */
  triggeredBy: string;
}

export interface QualityEvalResult {
  briefId: string;
  deliverableId: string;
  l1: L1TechnicalResult;
  l2: L2AestheticResult;
  l3: L3ComplianceResult;
  l4: L4CommercialResult;
  /** 综合分 (应用闸门后) */
  compositeScore: number;
  /** S/A/B/C 分级 */
  grade: SabcGrade;
  /** 综合决策: 闸门触发 → FAIL,否则 PASS/REVIEW */
  decision: 'PASS' | 'FAIL' | 'REVIEW';
  /** 模型版本快照 (跨评审可比) */
  modelVersions: Record<'L1' | 'L2' | 'L3' | 'L4', string>;
  evaluatedAt: string;
}
