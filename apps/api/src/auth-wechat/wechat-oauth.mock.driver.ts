/**
 * WechatOAuth Mock Driver — W3 W1 D5
 *
 * 跑通端到端流程用, 不调真实微信 API。
 *
 * 行为:
 *   - getQrUrl: 返 `https://open.weixin.qq.com/connect/qrconnect?appid=mock&...` 这种 mock URL
 *   - exchangeCode('mock', ...): 返固定 mock openid `mock_openid_001`, state 写入后立即可见
 *
 * 凭据到位切真: WECHAT_OAUTH_DRIVER=real + 填 WECHAT_OAUTH_APP_ID/SECRET/REDIRECT_URI
 */
import { Injectable, Logger } from '@nestjs/common';
import type { WechatOAuthDriver, WechatQrUrlResult, WechatExchangeResult } from './wechat-oauth.token';

@Injectable()
export class WechatOAuthMockDriver implements WechatOAuthDriver {
  private readonly logger = new Logger(WechatOAuthMockDriver.name);

  getQrUrl(state: string, redirectUri: string): WechatQrUrlResult {
    const url = `https://open.weixin.qq.com/connect/qrconnect?appid=mock&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`;
    this.logger.log(`[wechat-oauth-mock] qr url state=${state.slice(0, 8)}...`);
    return { url };
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<WechatExchangeResult> {
    // mock 模式: code='mock' 返固定 openid (这样前端反复扫码测试, 都能命中同一 user)
    if (code !== 'mock') {
      this.logger.warn(`[wechat-oauth-mock] unexpected code=${code}, treating as mock anyway`);
    }
    return {
      openid: 'mock_openid_001',
      unionid: undefined,
      nickname: '微信用户(mock)',
      headimgurl: undefined,
    };
  }
}