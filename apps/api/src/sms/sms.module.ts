import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { MockSmsDriver } from './sms.mock.driver';
import { SMS_DRIVER } from './sms-driver.token';

/**
 * SmsModule — W3 W1 D3 骨架
 * 真阿里云 driver (sms.aliyun-dysms.driver.ts) 留到 D4 后切真 driver 时补
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SMS_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('SMS_DRIVER', 'mock');
        const log = new Logger('SmsModule');
        if (driver === 'mock') {
          log.log('SMS_DRIVER=mock (开发模式)');
          return new MockSmsDriver(config);
        }
        // aliyun driver 留到 D4 后再写 — 现在 hard fail 而不是 silently mock
        throw new Error(
          `SMS_DRIVER=${driver} 暂未实现, D4 后会接入 (@alicloud/dysmsapi-20170525)`,
        );
      },
    },
    SmsService,
  ],
  exports: [SmsService],
})
export class SmsModule {}
