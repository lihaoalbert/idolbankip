import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ModerationService } from './moderation.service';
import { AliyunGreenProvider } from './aliyun-green.provider';
import { LocalKeywordFallback } from './local-keyword-fallback';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import {
  MODERATION_CLIENT,
  ModerationClient,
  MockModerationClient,
} from '@ibi-ren/shared-contracts';

/**
 * ModerationModule — W2.5 升级
 *
 * DI 策略 (W2.5-D2):
 *   - 默认: AliyunGreenProvider (云 API, 增强版)
 *   - Fallback: MockModerationClient (开发态 + AccessKey 未配置时)
 *   - 切换条件: ALIYUN_GREEN_ACCESS_KEY_ID + SECRET 都存在 → AliyunGreen
 *              任一缺失 → Mock + Logger.warn
 *
 * 关联: docs/research/quality-eval-benchmark-2026.md §5.3
 */
const logger = new Logger('ModerationModule');

@Module({
  imports: [ConfigModule, PrismaModule, AuditModule],
  providers: [
    ModerationService,
    AliyunGreenProvider,
    LocalKeywordFallback,
    {
      provide: MODERATION_CLIENT,
      inject: [ConfigService, AliyunGreenProvider],
      useFactory: (config: ConfigService, aliyun: AliyunGreenProvider): ModerationClient => {
        const keyId = config.get<string>('ALIYUN_GREEN_ACCESS_KEY_ID');
        const keySecret = config.get<string>('ALIYUN_GREEN_ACCESS_KEY_SECRET');
        if (keyId && keySecret) {
          logger.log('AliyunGreenProvider 已配置, 使用真实阿里云内容安全增强版');
          return aliyun;
        }
        logger.warn(
          'ALIYUN_GREEN_ACCESS_KEY_ID/SECRET 未配置, 降级到 MockModerationClient (L3 评审不可信)。' +
            '详见 docs/USER-ACTION-CHECKLIST.md #13',
        );
        return new MockModerationClient();
      },
    },
  ],
  exports: [ModerationService, LocalKeywordFallback],
})
export class ModerationModule {}