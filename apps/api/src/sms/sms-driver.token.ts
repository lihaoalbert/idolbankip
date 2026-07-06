/**
 * SMS driver 抽象 — W3 W1 D3
 * SmsModule 按 SMS_DRIVER env 注入 driver, 调用方只依赖 SmsService
 */
export const SMS_DRIVER = Symbol('SmsDriver');

export interface SmsSendParams {
  phone: string;
  template: 'LOGIN_CODE' | 'BIND_CODE';
  code: string;
}

export interface SmsSendResult {
  ok: boolean;
  requestId?: string;
  message?: string;
}

export interface SmsDriver {
  send(params: SmsSendParams): Promise<SmsSendResult>;
}
