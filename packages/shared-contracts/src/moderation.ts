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

export interface ModerationClient {
  scanImage(ossKey: string): Promise<ModerationResult>;
  faceSimilarity(input: FaceSimilarityInput): Promise<FaceSimilarityResult>;
}

export const MODERATION_CLIENT = Symbol('MODERATION_CLIENT');