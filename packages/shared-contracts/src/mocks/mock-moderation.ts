import type {
  ModerationClient,
  ModerationResult,
  FaceSimilarityInput,
  FaceSimilarityResult,
} from '../moderation';

/**
 * Mock 内容审核: 全部 PASS,face similarity = 0.2 (远低于阈值 0.6)。
 * 真实接入时替换为阿里云内容安全 Green SDK。
 */
export class MockModerationClient implements ModerationClient {
  async scanImage(_ossKey: string): Promise<ModerationResult> {
    return {
      decision: 'PASS',
      labels: [],
      scannedAt: new Date(),
    };
  }

  async faceSimilarity(_input: FaceSimilarityInput): Promise<FaceSimilarityResult> {
    return {
      maxSimilarity: 0.18,
      passed: true,
    };
  }
}