import type {
  ModerationClient,
  ModerationResult,
  FaceSimilarityInput,
  FaceSimilarityResult,
  ScanTextInput,
  ScanAigcInput,
  ScanAdComplianceInput,
  AigcComplianceResult,
} from '../moderation';

/**
 * Mock 内容审核: 全部 PASS,face similarity = 0.18 (远低于阈值 0.6)。
 * 真实接入时 (AliyunGreenProvider) 替换 — 见 apps/api/src/moderation/aliyun-green.provider.ts
 *
 * W2.5 扩展: scanText / scanAigcCheck / scanAdCompliance 都默认 PASS,
 *          用于本地开发 + ECS 未配 AccessKey 时降级。
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

  // W2.5 新增 — 默认 PASS, 不做真实检测
  async scanText(_input: ScanTextInput): Promise<ModerationResult> {
    return {
      decision: 'PASS',
      labels: [],
      scannedAt: new Date(),
    };
  }

  async scanAigcCheck(_input: ScanAigcInput): Promise<AigcComplianceResult> {
    return {
      decision: 'PASS',
      isAiGenerated: false,
      hasInfringementRisk: false,
      hasAdViolation: false,
      labels: [],
      scannedAt: new Date(),
    };
  }

  async scanAdCompliance(_input: ScanAdComplianceInput): Promise<AigcComplianceResult> {
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