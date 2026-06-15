import { Inject, Injectable, Logger } from '@nestjs/common';
import { MODERATION_CLIENT, ModerationClient, ModerationResult, FaceSimilarityResult } from '@ibi-ren/shared-contracts';

/**
 * MVP: 全部走 Mock。生产: 切换到真实 Aliyun Green SDK
 * 集成位置: 在 IP 提交审核时,异步扫描 THREE_VIEW / EXPRESSION_GRID / TRANSPARENT_RENDER / THUMBNAIL
 *          一旦 FAIL,直接 REJECTED + 通知创作者
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    @Inject(MODERATION_CLIENT) private readonly client: ModerationClient,
  ) {}

  scanImage(ossKey: string): Promise<ModerationResult> {
    return this.client.scanImage(ossKey);
  }

  faceSimilarity(ossKey: string): Promise<FaceSimilarityResult> {
    return this.client.faceSimilarity({ ossKey });
  }
}