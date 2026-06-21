import { Injectable } from '@nestjs/common';
import { OcrBusinessLicenseInput, OcrBusinessLicenseResult, OcrClient } from '@ibi-ren/shared-contracts';

/**
 * NoOp OCR 客户端 — OCR_DRIVER=mock 或未配置 aliyun 时使用
 * 任何调用都抛错 — controller 已经检查 OCR_CLIENT 是否为 NoOpOcrClient 并返回 503
 */
@Injectable()
export class NoOpOcrClient implements OcrClient {
  async recognizeBusinessLicense(_input: OcrBusinessLicenseInput): Promise<OcrBusinessLicenseResult> {
    throw new Error('OCR 服务未配置 (OCR_DRIVER=mock 或 ALIYUN_OCR_* 缺失)');
  }
}