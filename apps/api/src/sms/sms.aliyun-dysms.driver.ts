import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Dysmsapi20170525 from '@alicloud/dysmsapi-2017-05-25';
import type { SmsDriver, SmsSendParams, SmsSendResult } from './sms-driver.token';

/**
 * 阿里云短信 driver — W3 W1 D4
 * 用 @alicloud/dysmsapi-2017-05-25 SDK, 调 SendSms API
 * 真凭据到位前 SMS_DRIVER 仍为 mock, 这个 driver 不会实例化
 */
@Injectable()
export class AliyunDysmsDriver implements SmsDriver {
  private readonly logger = new Logger('SmsAliyun');
  private readonly client: Dysmsapi20170525;
  private readonly signName: string;
  private readonly loginTemplateCode: string;

  constructor(config: ConfigService) {
    const accessKeyId = config.get<string>('ALIYUN_SMS_ACCESS_KEY_ID') || '';
    const accessKeySecret = config.get<string>('ALIYUN_SMS_ACCESS_KEY_SECRET') || '';
    this.signName = config.get<string>('ALIYUN_SMS_SIGN_NAME', 'ibi.ren');
    this.loginTemplateCode = config.get<string>('ALIYUN_SMS_TEMPLATE_CODE_LOGIN', '');

    if (!accessKeyId || !accessKeySecret) {
      throw new Error(
        'SMS_DRIVER=aliyun 但 ALIYUN_SMS_ACCESS_KEY_ID/SECRET 未配置, 检查 .env',
      );
    }
    if (!this.loginTemplateCode) {
      throw new Error('SMS_DRIVER=aliyun 但 ALIYUN_SMS_TEMPLATE_CODE_LOGIN 未配置');
    }

    this.client = new Dysmsapi20170525({
      accessKeyId,
      accessKeySecret,
      endpoint: 'https://dysmsapi.aliyuncs.com',
    });
    this.logger.log(`Aliyun dysms client init, signName=${this.signName}`);
  }

  async send(params: SmsSendParams): Promise<SmsSendResult> {
    const templateCode = params.template === 'LOGIN_CODE' || params.template === 'BIND_CODE'
      ? this.loginTemplateCode
      : this.loginTemplateCode;

    try {
      const resp: any = await this.client.sendSms({
        PhoneNumbers: params.phone,
        SignName: this.signName,
        TemplateCode: templateCode,
        TemplateParam: JSON.stringify({ code: params.code }),
      });
      if (resp?.Code !== 'OK') {
        this.logger.warn(`aliyun sendSms fail: phone=${params.phone} code=${resp?.Code} msg=${resp?.Message}`);
        return { ok: false, requestId: resp?.RequestId, message: resp?.Message };
      }
      this.logger.log(`aliyun sendSms ok: phone=${params.phone} bizId=${resp?.BizId}`);
      return { ok: true, requestId: resp?.RequestId };
    } catch (e: any) {
      this.logger.error(`aliyun sendSms error: phone=${params.phone} ${e?.message ?? e}`);
      return { ok: false, message: e?.message };
    }
  }
}
