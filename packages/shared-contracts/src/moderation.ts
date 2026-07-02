export type ModerationDecision = 'PASS' | 'FAIL' | 'REVIEW';

export interface ModerationLabel {
  label: string; // porn / politics / violence / ad / etc.
  confidence: number; // 0-1
  description?: string;
}

export interface ModerationResult {
  decision: ModerationDecision;
  labels: ModerationLabel[];
  rawResponse?: unknown;
  scannedAt: Date;
}

export interface FaceSimilarityInput {
  ossKey: string;
  // 高风险名人样本库: 平台后台维护
  celebrityDatasetKey?: string;
}

export interface FaceSimilarityResult {
  maxSimilarity: number; // 0-1
  matchedCelebrity?: string;
  passed: boolean; // maxSimilarity < 0.6 (阈值)
}

// ===================== W2.5 新增: 阿里云增强版 5 类合规检测 =====================
// 关联: docs/research/quality-eval-benchmark-2026.md §5 阿里云内容安全增强版
// 服务清单:
//   - scanText: 文本审核 (广告法 / 涉政 / 涉敏 / 辱骂)
//   - scanAigcCheck: AI 生成风险检测
//   - scanAigcViolation: AIGC 侵权检测
//   - scanAdCompliance: 广告法专业版 (国内最全)
//   - aigcDetector: AI 生成判断 (主要用于元数据, 不进 L3 评分)

export interface ScanTextInput {
  text: string;
  // 业务上下文, 帮助 API 调权重
  context?: 'brief_description' | 'creator_note' | 'caption' | 'other';
}

export interface ScanAigcInput {
  imageUrls: string[]; // OSS URL
}

export interface ScanAdComplianceInput {
  text: string;
  imageUrls?: string[];
}

export interface AigcComplianceResult {
  // 阿里云 AIGC 检测综合结果
  decision: ModerationDecision;
  // 是否 AI 生成
  isAiGenerated: boolean;
  // 是否有侵权风险
  hasInfringementRisk: boolean;
  // 是否违反广告法
  hasAdViolation: boolean;
  // 详细标签 (各 provider 不同, 留 rawResponse 给 audit)
  labels: ModerationLabel[];
  rawResponse?: unknown;
  scannedAt: Date;
}

export interface ModerationClient {
  scanImage(ossKey: string): Promise<ModerationResult>;
  faceSimilarity(input: FaceSimilarityInput): Promise<FaceSimilarityResult>;
  // W2.5 新增
  scanText(input: ScanTextInput): Promise<ModerationResult>;
  scanAigcCheck(input: ScanAigcInput): Promise<AigcComplianceResult>;
  scanAdCompliance(input: ScanAdComplianceInput): Promise<AigcComplianceResult>;
}

export const MODERATION_CLIENT = Symbol('MODERATION_CLIENT');