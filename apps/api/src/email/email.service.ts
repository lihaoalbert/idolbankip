import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Dm20151123, * as $Dm from '@alicloud/dm20151123';
import { $OpenApiUtil } from '@alicloud/openapi-core';

export interface SendMailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  /** 钉钉投递,可选 — 主要用于测试时验真 */
  replyTo?: string;
}

/**
 * EmailService — 站内发邮件 (W2 #29 推送通知)
 *
 * 驱动切换:
 *   - DIRECTMAIL_* 环境变量未配齐 → mock 模式,只 logger.log 邮件内容
 *   - 配齐 → 走阿里云 DirectMail (dm.aliyuncs.com)
 *
 * 为什么 mock fallback:开发环境 / ECS 第一次起动时 DirectMail 账号还没申请下来,
 * 但是 brief 推送业务不应该被邮件 block — in-site 通知先行,邮件占位。
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private client: Dm20151123 | null = null;
  private fromAlias = 'ibi.ren 平台';
  private initialized = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const akId = this.config.get<string>('ALIYUN_ACCESS_KEY_ID');
    const akSecret = this.config.get<string>('ALIYUN_ACCESS_KEY_SECRET');
    const accountName = this.config.get<string>('DIRECTMAIL_ACCOUNT');
    const password = this.config.get<string>('DIRECTMAIL_PASSWORD');
    const fromAliasCfg = this.config.get<string>('DIRECTMAIL_FROM_ALIAS');
    if (fromAliasCfg) this.fromAlias = fromAliasCfg;
    const region = this.config.get<string>('DIRECTMAIL_REGION') || 'cn-shanghai';

    if (!akId || !akSecret || !accountName || !password) {
      this.logger.warn(
        'DirectMail 凭据未配齐 (DIRECTMAIL_ACCOUNT / DIRECTMAIL_PASSWORD / ALIYUN_ACCESS_KEY_ID/SECRET),EmailService 进入 mock 模式 — 邮件只会打到日志',
      );
      return;
    }

    try {
      const conf = new $OpenApiUtil.Config({
        accessKeyId: akId,
        accessKeySecret: akSecret,
        regionId: region,
        endpoint: `dm.${region}.aliyuncs.com`,
      });
      this.client = new Dm20151123(conf);
      this.initialized = true;
      this.logger.log(
        `EmailService ready (region=${region}, from=${accountName}, alias="${this.fromAlias}")`,
      );
    } catch (e: any) {
      this.logger.error(`EmailService init FAILED: ${e?.message}`);
    }
  }

  /**
   * 发邮件。mock 模式只打日志;真实模式走 DirectMail SingleSendMail API。
   * 单封失败不应阻塞其它收件人 — call-site 应该 try/catch。
   */
  async send(input: SendMailInput): Promise<{ ok: boolean; envId?: string; reason?: string }> {
    const { to, subject, html, text, replyTo } = input;

    if (!to || !to.includes('@')) {
      return { ok: false, reason: 'invalid_to' };
    }
    if (!subject) {
      return { ok: false, reason: 'missing_subject' };
    }
    if (!html && !text) {
      return { ok: false, reason: 'missing_body' };
    }

    if (!this.initialized || !this.client) {
      this.logger.log(
        `[email-mock] → ${to} | subject="${subject}" | textLen=${text?.length ?? 0} htmlLen=${html?.length ?? 0}`,
      );
      if (text) this.logger.debug(`[email-mock] body(text): ${text}`);
      return { ok: true, envId: 'mock-' + Date.now() };
    }

    try {
      const request = new $Dm.SingleSendMailRequest({
        accountName: this.config.get<string>('DIRECTMAIL_ACCOUNT')!,
        addressType: 1,
        toAddress: to,
        fromAlias: this.fromAlias,
        subject,
        htmlBody: html,
        textBody: text,
        replyToAddress: replyTo || false,
      });
      const resp = await this.client.singleSendMail(request);
      const envId = resp?.body?.envId;
      this.logger.log(`[email] → ${to} | envId=${envId}`);
      return { ok: true, envId };
    } catch (e: any) {
      this.logger.error(`[email] → ${to} FAILED: ${e?.message ?? e}`);
      return { ok: false, reason: e?.message ?? 'send_failed' };
    }
  }
}
