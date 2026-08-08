import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Ocr20191230, * as $Ocr from '@alicloud/ocr20191230';
import { $OpenApiUtil } from '@alicloud/openapi-core';
import {
  OcrBusinessLicenseInput,
  OcrBusinessLicenseResult,
  OcrClient,
} from '@ibi-ren/shared-contracts';

/**
 * 阿里云 OCR 营业执照识别客户端 — RecognizeBusinessLicense API
 *   输入:imageURL (HTTP/HTTPS 公网可访问的营业执照图片)
 *   输出:公司名 / 法人 / 注册号 / 经营范围 等结构化字段
 *
 * 上游流程:前端上传营业执照到 OSS (private bucket,签名 URL 5 分钟有效),
 *   然后把签名 URL 喂给本接口。5 分钟内 OCR 调用完没问题。
 *
 * 与 AliyunKycClient 不同,OCR 客户端用独立的 RAM AK (可能给到其他同事/服务使用),
 *   所以配置分两套:ALIYUN_OCR_* 和 ALIYUN_KYC_*。
 */
@Injectable()
export class AliyunOcrClient implements OcrClient, OnModuleInit {
  private readonly logger = new Logger(AliyunOcrClient.name);
  private client: Ocr20191230 | null = null;
  private region: string = 'cn-hanghai';
  private initialized = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const akId = this.config.get<string>('ALIYUN_OCR_ACCESS_KEY_ID');
    const akSecret = this.config.get<string>('ALIYUN_OCR_ACCESS_KEY_SECRET');
    this.region = this.config.get<string>('ALIYUN_OCR_REGION') || 'cn-hangzhou';

    if (!akId || !akSecret) {
      this.logger.warn('ALIYUN_OCR_* 未配置,AliyunOcrClient 不会真正调用阿里云');
      return;
    }

    try {
      const conf = new $OpenApiUtil.Config({
        accessKeyId: akId,
        accessKeySecret: akSecret,
        regionId: this.region,
        endpoint: `ocr.${this.region}.aliyuncs.com`,
      });
      this.client = new Ocr20191230(conf);
      this.initialized = true;
      this.logger.log(`AliyunOcrClient ready (region=${this.region})`);
    } catch (e: any) {
      this.logger.error(`AliyunOcrClient init FAILED: ${e?.message}`);
    }
  }

  async recognizeBusinessLicense(input: OcrBusinessLicenseInput): Promise<OcrBusinessLicenseResult> {
    if (!this.initialized || !this.client) {
      throw new Error('OCR 服务未配置 (缺少 ALIYUN_OCR_ACCESS_KEY_ID/SECRET)');
    }

    try {
      const request = new $Ocr.RecognizeBusinessLicenseRequest({
        imageURL: input.imageUrl,
      });
      const response = await this.client.recognizeBusinessLicense(request);
      const data = response.body?.data;
      if (!data) {
        throw new Error('阿里云 OCR 返回 data 为空');
      }

      this.logger.log(
        `RecognizeBusinessLicense name=${data.name} regNo=${data.registerNumber} legalPerson=${data.legalPerson} reqId=${response.body?.requestId}`,
      );

      return {
        enterpriseName: data.name || '',
        licenseNo: data.registerNumber || '',
        legalPerson: data.legalPerson || '',
        companyType: data.type,
        registeredCapital: data.capital,
        establishedDate: data.establishDate,
        businessTerm: data.validPeriod,
        businessScope: data.business,
        address: data.address,
      };
    } catch (e: any) {
      this.logger.error(`RecognizeBusinessLicense exception: ${e?.message} (code=${e?.code || e?.name})`);
      throw new Error(`营业执照识别失败: ${e?.message || '未知错误'}`);
    }
  }
}