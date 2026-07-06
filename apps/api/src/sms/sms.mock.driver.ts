import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SmsDriver, SmsSendParams, SmsSendResult } from './sms-driver.token';

/**
 * Mock SMS driver — 后端日志输出 code (SMS_LOG_CODE=true 时)
 * 开发与凭据未到位期间用。生产 SMS_DRIVER=aliyun 切真。
 */
@Injectable()
export class MockSmsDriver implements SmsDriver {
  private readonly logger = new Logger('SmsMock');
  private readonly logCode: boolean;

  constructor(config: ConfigService) {
    this.logCode = config.get<boolean>('SMS_LOG_CODE', false);
  }

  async send(params: SmsSendParams): Promise<SmsSendResult> {
    const requestId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (this.logCode) {
      this.logger.warn(
        `[sms-mock] → phone=${params.phone} template=${params.template} code=${params.code} reqId=${requestId}`,
      );
    } else {
      this.logger.log(
        `[sms-mock] → phone=${params.phone} template=${params.template} reqId=${requestId} (code 不打日志, SMS_LOG_CODE=true 开启)`,
      );
    }
    return { ok: true, requestId };
  }
}
