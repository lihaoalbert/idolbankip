/**
 * WechatOAuthService — W3 W1 D5
 * Driver facade: 按 WECHAT_OAUTH_DRIVER env 注入 driver (mock/real)
 */
import { Inject, Injectable } from '@nestjs/common';
import { WECHAT_OAUTH_DRIVER, type WechatOAuthDriver, type WechatQrUrlResult, type WechatExchangeResult } from './wechat-oauth.token';

@Injectable()
export class WechatOAuthService {
  constructor(
    @Inject(WECHAT_OAUTH_DRIVER) private readonly driver: WechatOAuthDriver,
  ) {}

  getQrUrl(state: string, redirectUri: string): WechatQrUrlResult {
    return this.driver.getQrUrl(state, redirectUri);
  }

  exchangeCode(code: string, redirectUri: string): Promise<WechatExchangeResult> {
    return this.driver.exchangeCode(code, redirectUri);
  }
}