/**
 * WechatOAuth Real Driver — W3 W1 D5
 *
 * 微信开放平台 OAuth (snsapi_login) 真实 driver.
 *
 * 凭据: WECHAT_OAUTH_APP_ID + WECHAT_OAUTH_APP_SECRET + WECHAT_OAUTH_REDIRECT_URI
 * 流程:
 *   1. getQrUrl → https://open.weixin.qq.com/connect/qrconnect?appid=...&redirect_uri=...&state=...#wechat_redirect
 *   2. 用户扫码 → 微信 302 → redirect_uri?code=...&state=...
 *   3. exchangeCode → GET https://api.weixin.qq.com/sns/oauth2/access_token?appid=...&secret=...&code=...&grant_type=authorization_code
 *      返 { access_token, openid, unionid, ... }
 *
 * 启用: WECHAT_OAUTH_DRIVER=real + .env 填凭据
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WechatOAuthDriver, WechatQrUrlResult, WechatExchangeResult } from './wechat-oauth.token';

@Injectable()
export class WechatOAuthRealDriver implements WechatOAuthDriver {
  private readonly logger = new Logger(WechatOAuthRealDriver.name);

  constructor(private readonly config: ConfigService) {}

  getQrUrl(state: string, redirectUri: string): WechatQrUrlResult {
    const appId = this.config.get<string>('WECHAT_OAUTH_APP_ID');
    if (!appId) {
      throw new Error('WECHAT_OAUTH_APP_ID not configured');
    }
    const url = `https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`;
    return { url };
  }

  async exchangeCode(code: string, redirectUri: string): Promise<WechatExchangeResult> {
    const appId = this.config.get<string>('WECHAT_OAUTH_APP_ID');
    const appSecret = this.config.get<string>('WECHAT_OAUTH_APP_SECRET');
    if (!appId || !appSecret) {
      throw new Error('WECHAT_OAUTH_APP_ID/SECRET not configured');
    }
    const apiUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const resp = await fetch(apiUrl);
    const data = await resp.json() as {
      access_token?: string;
      openid?: string;
      unionid?: string;
      errcode?: number;
      errmsg?: string;
    };
    if (data.errcode || !data.openid) {
      this.logger.error(`wechat exchange failed: errcode=${data.errcode} errmsg=${data.errmsg}`);
      throw new Error(`微信授权失败: ${data.errmsg || data.errcode}`);
    }
    return {
      openid: data.openid,
      unionid: data.unionid,
    };
  }
}