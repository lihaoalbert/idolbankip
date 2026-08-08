import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KycService } from './kyc.service';
import { KycController, AdminKycController } from './kyc.controller';
import { KYC_CLIENT, OCR_CLIENT, MockKycClient } from '@ibi-ren/shared-contracts';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadModule } from '../upload/upload.module';
import { AliyunKycClient } from './aliyun-kyc.client';
import { AliyunOcrClient } from './aliyun-ocr.client';
import { NoOpOcrClient } from './noop-ocr.client';

/**
 * KYC 模块 — driver 切换
 *
 * KYC_DRIVER=mock (默认 dev):用 MockKycClient,提交即 APPROVED
 * KYC_DRIVER=aliyun (生产):用 AliyunKycClient 走阿里云实人认证
 *
 * OCR_DRIVER=mock (默认 dev):用 NoOpOcrClient,任何调用都抛错
 * OCR_DRIVER=aliyun (生产):用 AliyunOcrClient 识别营业执照
 *
 * 切换依据:ConfigService.get('KYC_DRIVER') / 'OCR_DRIVER' — 在 ECS /opt/ibiren/.env 里设置
 */
@Module({
  imports: [ConfigModule, NotificationsModule, UploadModule],
  providers: [
    KycService,
    AliyunKycClient,
    AliyunOcrClient,
    NoOpOcrClient,
    MockKycClient,
    {
      provide: KYC_CLIENT,
      useFactory: (config: ConfigService, mock: MockKycClient, aliyun: AliyunKycClient) => {
        const driver = (config.get<string>('KYC_DRIVER') || 'mock').toLowerCase();
        if (driver === 'aliyun') return aliyun;
        if (driver === 'mock') return mock;
        throw new Error(`未知 KYC_DRIVER: ${driver} (支持: mock | aliyun)`);
      },
      inject: [ConfigService, MockKycClient, AliyunKycClient],
    },
    {
      provide: OCR_CLIENT,
      useFactory: (config: ConfigService, aliyun: AliyunOcrClient, noop: NoOpOcrClient) => {
        const driver = (config.get<string>('OCR_DRIVER') || 'mock').toLowerCase();
        if (driver === 'aliyun') return aliyun;
        if (driver === 'mock') return noop;
        throw new Error(`未知 OCR_DRIVER: ${driver} (支持: mock | aliyun)`);
      },
      inject: [ConfigService, AliyunOcrClient, NoOpOcrClient],
    },
  ],
  controllers: [KycController, AdminKycController],
  exports: [KycService],
})
export class KycModule {}