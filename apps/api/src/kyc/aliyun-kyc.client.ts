import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Cloudauth20190307, * as $Cloudauth from '@alicloud/cloudauth20190307';
import { $OpenApiUtil } from '@alicloud/openapi-core';
import { v4 as uuidv4 } from 'uuid';
import { KycClient, KycVerifyInput, KycVerifyResult } from '@ibi-ren/shared-contracts';

/**
 * 阿里云实人认证 (Cloudauth) 客户端 — 走 VerifyMaterial API
 *   - 个人 KYC:姓名+身份证号二要素 (bizType 控制是否需要人脸照片,这里走"纯二要素"配置)
 *   - 企业 KYC:法人姓名+身份证号 (营业执照信息在调用前由 OCR 客户端解析,这里只做法人二要素)
 *
 * 为什么 VerifyMaterial 而不是 CompareFaceVerify / 纯 2-factor API:
 *   - VerifyMaterial 是最通用的服务端认证接口,bizType 决定是否需要人脸/身份证照片
 *   - 用户在阿里云控制台创建"实名核身"场景时,bizType 名称可配"纯姓名+身份证号二要素"
 *   - 这样既支持个人 KYC,法人二要素走同一个 API
 *
 * SCENE_ID (数字 1000019263) 是用户从旧 id_verify 控制台拿到的场景 ID。
 * Cloudauth (新版) 用 bizType 字符串,不是数字 SCENE_ID。这里 bizType 由环境变量配置。
 */
@Injectable()
export class AliyunKycClient implements KycClient, OnModuleInit {
  private readonly logger = new Logger(AliyunKycClient.name);
  private client: Cloudauth20190307 | null = null;
  private bizType: string = '';
  private region: string = 'cn-shanghai';
  private initialized = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const akId = this.config.get<string>('ALIYUN_KYC_ACCESS_KEY_ID');
    const akSecret = this.config.get<string>('ALIYUN_KYC_ACCESS_KEY_SECRET');
    this.bizType = this.config.get<string>('ALIYUN_KYC_BIZTYPE') || 'RPBasicTest';
    this.region = this.config.get<string>('ALIYUN_KYC_REGION') || 'cn-shanghai';

    if (!akId || !akSecret) {
      this.logger.warn('ALIYUN_KYC_* 未配置,AliyunKycClient 不会真正调用阿里云');
      return;
    }

    try {
      const conf = new $OpenApiUtil.Config({
        accessKeyId: akId,
        accessKeySecret: akSecret,
        regionId: this.region,
        endpoint: `cloudauth.${this.region}.aliyuncs.com`,
      });
      this.client = new Cloudauth20190307(conf);
      this.initialized = true;
      this.logger.log(`AliyunKycClient ready (region=${this.region}, bizType=${this.bizType})`);
    } catch (e: any) {
      this.logger.error(`AliyunKycClient init FAILED: ${e?.message}`);
    }
  }

  async verifyIdentity(input: KycVerifyInput): Promise<KycVerifyResult> {
    if (!this.initialized || !this.client) {
      // 没配齐时:fallback 到 mock 行为 (dev 用,不阻塞流程)
      this.logger.warn(`KYC not initialized, returning REJECTED for ${input.realName}`);
      return { status: 'REJECTED', reason: 'KYC 服务未配置' };
    }

    const bizId = input.bizId || uuidv4();

    try {
      const request = new $Cloudauth.VerifyMaterialRequest({
        bizId,
        bizType: this.bizType,
        name: input.realName,
        idCardNumber: input.idNumber,
        // 注: faceImageUrl / idCardFrontImageUrl 不传 — bizType 配置为"纯二要素"即可
        // 如果 bizType 需要人脸/身份证照片,这里会返回 VerifyMaterialResponseCode=非法参数
      });

      const response = await this.client.verifyMaterial(request);
      const body = response.body;
      const verifyStatus = body?.verifyStatus; // 1=认证一致 0=认证不一致
      const verifyToken = body?.verifyToken;
      const requestId = body?.requestId;

      this.logger.log(
        `VerifyMaterial bizId=${bizId} name=${input.realName} status=${verifyStatus} token=${verifyToken} reqId=${requestId}`,
      );

      if (verifyStatus === 1) {
        return {
          status: 'APPROVED',
          refId: verifyToken || requestId,
          verifyScore: verifyStatus,
        };
      }
      // 0 = 不一致 / 其他 = 异常 — 一律 REJECTED
      return {
        status: 'REJECTED',
        reason: `阿里云实人认证不一致 (verifyStatus=${verifyStatus})`,
        refId: verifyToken || requestId,
        verifyScore: verifyStatus,
      };
    } catch (e: any) {
      this.logger.error(`VerifyMaterial exception: ${e?.message} (code=${e?.code || e?.name})`);
      // 网络/认证错误:保守起见返回 PENDING,让用户走人工审核 (比 REJECTED 安全)
      return {
        status: 'PENDING',
        reason: `阿里云调用异常: ${e?.message || '未知错误'},转人工审核`,
        refId: bizId,
      };
    }
  }
}