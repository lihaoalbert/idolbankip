import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { MockSmsDriver } from './sms.mock.driver';
import { AliyunDysmsDriver } from './sms.aliyun-dysms.driver';
import { SMS_DRIVER } from './sms-driver.token';

/**
 * SmsModule — W3 W1 D4
 * 按 SMS_DRIVER env 注入 driver: mock | aliyun
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
          log.log('SMS_DRIVER=mock (开发模式, 日志输出 code)');
          return new MockSmsDriver(config);
        }
        if (driver === 'aliyun') {
          log.log('SMS_DRIVER=aliyun (真驱动)');
          return new AliyunDysmsDriver(config);
        }
        throw new Error(`SMS_DRIVER=${driver} 未知, 期望 mock|aliyun`);
      },
    },
    SmsService,
  ],
  exports: [SmsService],
})
export class SmsModule {}
