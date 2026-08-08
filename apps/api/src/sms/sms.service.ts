import { Inject, Injectable } from '@nestjs/common';
import { SMS_DRIVER, type SmsDriver, type SmsSendParams, type SmsSendResult } from './sms-driver.token';

/**
 * SMS 服务门面 — 调用方只跟 SmsService 打交道
 * 实际 driver (mock / aliyun) 在 Module 注入时切换
 */
@Injectable()
export class SmsService {
  constructor(@Inject(SMS_DRIVER) private readonly driver: SmsDriver) {}

  sendLoginCode(phone: string, code: string): Promise<SmsSendResult> {
    return this.driver.send({ phone, template: 'LOGIN_CODE', code });
  }

  sendBindCode(phone: string, code: string): Promise<SmsSendResult> {
    return this.driver.send({ phone, template: 'BIND_CODE', code });
  }

  /** 给测试 / 校准脚本直接发 (D5 用得到) */
  sendRaw(params: SmsSendParams): Promise<SmsSendResult> {
    return this.driver.send(params);
  }
}
