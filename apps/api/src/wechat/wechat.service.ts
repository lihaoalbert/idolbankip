import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WechatTemplateInput {
  /** 用户绑定的 wechatOpenId;为 null/empty 时直接跳过 */
  openId: string | null;
  templateId: string;
  /** 一级行业前缀 (颜色) — 可选 */
  topColor?: string;
  /** data 节点 (key 为 template 占位变量名,value 为 {value, color?}) */
  data: Record<string, { value: string; color?: string }>;
  /** 跳转 URL — 可选 */
  url?: string;
  /** 小程序 — 可选;若填了 url 必须为空(模板消息 url/miniprogram 二选一) */
  miniprogram?: { appid: string; pagepath: string };
}

export interface WechatAccessTokenCache {
  token: string;
  expiresAt: number;
}

/**
 * WeChat 模板消息 (公众号 / 开放平台) — W2 #29 推送通知
 *
 * API: https://api.weixin.qq.com/cgi-bin/message/template/send
 *      https://api.weixin.qq.com/cgi-bin/token (grants_type=client_credential)
 *
 * 驱动切换:
 *   - WECHAT_APP_ID / WECHAT_APP_SECRET 任一缺失 → mock 模式,只打日志
 *   - access_token 内存缓存(带 expires_in),每个进程独立
 *
 * 注意:本服务发的是"服务号 / 订阅号模板消息",需要用户在公众号内绑定 openId 才能触达。
 * openId 来源 — User.wechatOpenId 字段 (schema 在 W2 #29 已加)。
 */
@Injectable()
export class WechatService implements OnModuleInit {
  private readonly logger = new Logger(WechatService.name);
  private appId = '';
  private appSecret = '';
  private initialized = false;
  private accessTokenCache: WechatAccessTokenCache | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.appId = this.config.get<string>('WECHAT_APP_ID') || '';
    this.appSecret = this.config.get<string>('WECHAT_APP_SECRET') || '';

    if (!this.appId || !this.appSecret) {
      this.logger.warn(
        'WECHAT_APP_ID / WECHAT_APP_SECRET 未配齐,WechatService 进入 mock 模式',
      );
      return;
    }

    this.initialized = true;
    this.logger.log(`WechatService ready (appId=${this.appId})`);
  }

  private async fetchAccessToken(): Promise<string> {
    const cached = this.accessTokenCache;
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.token;
    }
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', this.appId);
    url.searchParams.set('secret', this.appSecret);
    const resp = await fetch(url.toString());
    const data: any = await resp.json();
    if (data.errcode) {
      throw new Error(`wechat token errcode=${data.errcode} errmsg=${data.errmsg}`);
    }
    this.accessTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
    };
    return this.accessTokenCache.token;
  }

  /**
   * 发模板消息
   *
   * @returns ok=true 表示接口调成功(true 也不代表用户真的会收到 — 微信决定)
   */
  async sendTemplate(input: WechatTemplateInput): Promise<{ ok: boolean; msgId?: number; reason?: string }> {
    const { openId, templateId, data, url, miniprogram, topColor } = input;
    if (!openId) {
      return { ok: false, reason: 'no_openid' };
    }

    if (!this.initialized) {
      this.logger.log(
        `[wechat-mock] → openId=${openId} | template=${templateId} | data=${JSON.stringify(data)}`,
      );
      return { ok: true, msgId: 0 };
    }

    try {
      const token = await this.fetchAccessToken();
      const endpoint = new URL('https://api.weixin.qq.com/cgi-bin/message/template/send');
      endpoint.searchParams.set('access_token', token);
      const body: any = {
        touser: openId,
        template_id: templateId,
        data,
      };
      if (topColor) body.topcolor = topColor;
      if (url) body.url = url;
      if (miniprogram) body.miniprogram = miniprogram;

      const resp = await fetch(endpoint.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: any = await resp.json();
      if (json.errcode && json.errcode !== 0) {
        this.logger.error(
          `[wechat] send failed: errcode=${json.errcode} errmsg=${json.errmsg} openId=${openId}`,
        );
        return { ok: false, reason: `errcode=${json.errcode}` };
      }
      this.logger.log(`[wechat] → openId=${openId} | msgId=${json.msgid}`);
      return { ok: true, msgId: json.msgid };
    } catch (e: any) {
      this.logger.error(`[wechat] send exception: ${e?.message ?? e}`);
      return { ok: false, reason: e?.message ?? 'send_exception' };
    }
  }

  /**
   * 取模板 ID — WECHAT_TEMPLATE_ID_* env 没有时返回空,call-site 应 fallback
   */
  pickTemplateId(kind: 'BRIEF_PUBLISHED' | 'BRIEF_BUMPED'): string {
    const envKey = `WECHAT_TEMPLATE_ID_${kind}`;
    return this.config.get<string>(envKey) || '';
  }
}
