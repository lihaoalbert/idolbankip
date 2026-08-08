/**
 * AliyunGreenProvider — 阿里云内容安全增强版 Provider
 *
 * 关联: docs/research/quality-eval-benchmark-2026.md §5
 * SDK: @alicloud/green20220302 (已装)
 *
 * 实现 5 类检测 (W2.5 决策 §9):
 *   1. scanText          → TextScan enhanced (广告法 + 涉政 + 涉敏 + 辱骂)
 *   2. scanAigcCheck     → AigcCheck (AI 生成风险)
 *   3. scanImage         → ImageScan enhanced
 *   4. scanAdCompliance  → AdComplianceDetection (广告法专业版)
 *   5. faceSimilarity    → ImageSyncScan (名人脸相似度)
 *
 * 状态: Provider stub — D1 用户配置 AccessKey 后, 跑通真实调用补全 endpoint + service code
 *       当前: 类型签名完整, 运行时清晰报错, 不阻塞 D2-D14 其他模块
 *
 * 配置 (.env):
 *   ALIYUN_GREEN_ACCESS_KEY_ID=...
 *   ALIYUN_GREEN_ACCESS_KEY_SECRET=...
 *   ALIYUN_GREEN_REGION=cn-shanghai
 *
 * 踩坑 (来自 §5.3):
 *   - 必须用增强版 baselineCheck, 不要用老版 porn/terrorism (双阶计费坑)
 *   - 不要开 aigcDetector (虚拟人脸是 AI 生成, 主要判"是否 AI", 对合规审核冗余)
 *   - QPS 默认 500 不够, 1000 brief 集中提交触发限流, 需预购 QPS 预留包
 */
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ModerationClient,
  ModerationResult,
  FaceSimilarityInput,
  FaceSimilarityResult,
  ScanTextInput,
  ScanAigcInput,
  ScanAdComplianceInput,
  AigcComplianceResult,
} from '@ibi-ren/shared-contracts';

@Injectable()
export class AliyunGreenProvider implements ModerationClient {
  private readonly logger = new Logger(AliyunGreenProvider.name);
  private readonly accessKeyId: string | undefined;
  private readonly accessKeySecret: string | undefined;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    this.accessKeyId = this.config.get<string>('ALIYUN_GREEN_ACCESS_KEY_ID');
    this.accessKeySecret = this.config.get<string>('ALIYUN_GREEN_ACCESS_KEY_SECRET');
    this.region = this.config.get<string>('ALIYUN_GREEN_REGION', 'cn-shanghai');
    if (!this.accessKeyId || !this.accessKeySecret) {
      this.logger.warn(
        'ALIYUN_GREEN_ACCESS_KEY_ID/SECRET 未配置, AliyunGreenProvider 运行时将抛 ServiceUnavailableException。' +
          '详见 docs/USER-ACTION-CHECKLIST.md #13',
      );
    } else {
      this.logger.log(`AliyunGreenProvider 已配置, region=${this.region}`);
    }
  }

  private ensureConfigured(): void {
    if (!this.accessKeyId || !this.accessKeySecret) {
      throw new ServiceUnavailableException(
        '阿里云内容安全未配置: 请设置 ALIYUN_GREEN_ACCESS_KEY_ID/SECRET (.env)。' +
          '详见 docs/USER-ACTION-CHECKLIST.md #13',
      );
    }
  }

  async scanImage(ossKey: string): Promise<ModerationResult> {
    this.ensureConfigured();
    // TODO D1 用户配置 AccessKey 后填真实 SDK 调用
    // 1) new Green20220302({ accessKeyId, accessKeySecret, endpoint: `green-cip.${region}.aliyuncs.com` })
    // 2) client.imageScanEnhanced({ ServiceModule: 'baselineCheck', ServiceCode: 'baselineCheck_pro', urls: [ossKey] })
    // 3) 解析 Data → decision/labels
    throw new ServiceUnavailableException('AliyunGreenProvider.scanImage 待 D1 配置 AccessKey 后实装');
  }

  async faceSimilarity(input: FaceSimilarityInput): Promise<FaceSimilarityResult> {
    this.ensureConfigured();
    // TODO D1 实装 — imageSyncScan with celebrity dataset
    throw new ServiceUnavailableException('AliyunGreenProvider.faceSimilarity 待 D1 实装');
  }

  async scanText(input: ScanTextInput): Promise<ModerationResult> {
    this.ensureConfigured();
    // TODO D1 实装 — textScan with ServiceModule='enhanced'
    throw new ServiceUnavailableException('AliyunGreenProvider.scanText 待 D1 实装');
  }

  async scanAigcCheck(input: ScanAigcInput): Promise<AigcComplianceResult> {
    this.ensureConfigured();
    // TODO D1 实装 — AigcCheck + AigcViolationDetection (开 aigcCheck + aigcViolationDetection, 不开 aigcDetector)
    throw new ServiceUnavailableException('AliyunGreenProvider.scanAigcCheck 待 D1 实装');
  }

  async scanAdCompliance(input: ScanAdComplianceInput): Promise<AigcComplianceResult> {
    this.ensureConfigured();
    // TODO D1 实装 — adComplianceDetection (国内最全广告法)
    throw new ServiceUnavailableException('AliyunGreenProvider.scanAdCompliance 待 D1 实装');
  }
}