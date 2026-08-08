/**
 * WeChat OAuth driver 抽象 — W3 W1 D5
 * AuthWechatModule 按 WECHAT_OAUTH_DRIVER env 注入 driver, 调用方只依赖 WechatOAuthService
 */
export const WECHAT_OAUTH_DRIVER = Symbol('WechatOAuthDriver');

export interface WechatQrUrlResult {
  /** 开放平台扫码页 URL (前端用 qrcode 库渲染) */
  url: string;
}

export interface WechatExchangeResult {
  /** 用户 openid, 同 appid 下唯一 */
  openid: string;
  /** 用户 unionid (跨 appid 唯一, mock 模式无) */
  unionid?: string;
  /** 微信昵称 */
  nickname?: string;
  /** 微信头像 URL */
  headimgurl?: string;
}

export interface WechatOAuthDriver {
  /** 拿扫码 URL, state 由调用方生成并落 WechatOAuthState */
  getQrUrl(state: string, redirectUri: string): WechatQrUrlResult;
  /** code 换 openid (调 https://api.weixin.qq.com/sns/oauth2/access_token) */
  exchangeCode(code: string, redirectUri: string): Promise<WechatExchangeResult>;
}