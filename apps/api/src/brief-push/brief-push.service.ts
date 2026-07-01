import { Injectable, Logger } from '@nestjs/common';
import { Brief, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { WechatService } from '../wechat/wechat.service';

/**
 * BriefPushService — W2 #29 推送通知 fan-out
 *
 * 触发点:
 *   - brief.publish() 发包 → BRIEF_PUBLISHED
 *   - brief.bumpPrice() 加价 → BRIEF_BUMPED
 *
 * 触达渠道(三选三):
 *   - in-site: Notification 表 (永远写)
 *   - email:   DirectMail (mock 模式只 log)
 *   - wechat:  模板消息 (mock 模式只 log)
 *
 * 匹配创作者: 简化为两步
 *   1. 优先:CreatorSkill.skill.category == CATEGORY_MAP[brief.category]
 *   2. fallback: 所有 isCreatorVerified=true 且 KYC_APPROVED 的创作者
 *
 * fire-and-forget:fan-out 不阻塞 publish/bump 的 HTTP 响应;
 * 单个创作者通知失败被 try/catch 吞掉,不影响其他人。
 */

const CATEGORY_MAP: Record<string, string> = {
  shortvideo: 'video',
  livestream_clip: 'video',
  ad: 'video',
  poster: 'image',
  '3d': '3d',
};

const CATEGORY_LABEL: Record<string, string> = {
  shortvideo: '短视频',
  livestream_clip: '直播切片',
  ad: '数字人广告',
  poster: '营销海报',
  '3d': '3D 数字人',
};

@Injectable()
export class BriefPushService {
  private readonly logger = new Logger(BriefPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationsService,
    private readonly email: EmailService,
    private readonly wechat: WechatService,
  ) {}

  /** 在 publish() 内推 bidder 池 */
  async onPublish(brief: Brief) {
    const recipients = await this.matchCreators(brief);
    await this.fanOut(brief, recipients, 'BRIEF_PUBLISHED');
  }

  /** 在 bumpPrice() 内推(只推加价后 + bumpCount>0 的阶段) */
  async onBump(brief: Brief) {
    const recipients = await this.matchCreators(brief);
    await this.fanOut(brief, recipients, 'BRIEF_BUMPED');
  }

  /**
   * 匹配潜在创作者 — 先按 SkillTag.category,fallback 到所有 verified 创作者
   */
  private async matchCreators(brief: Brief): Promise<User[]> {
    const tagCategory = CATEGORY_MAP[brief.category];

    // 1) 精确匹配 — 有对应技能标签的 KYC 通过创作者
    if (tagCategory) {
      const skilled = await this.prisma.user.findMany({
        where: {
          kycStatus: 'APPROVED',
          creatorSkills: {
            some: {
              skill: { category: tagCategory },
              // certified: true 暂时不卡 — 避免冷启动没人能接
            },
          },
        },
        select: { id: true, email: true, wechatOpenId: true, displayName: true },
        take: 200,
      });
      if (skilled.length > 0) return skilled as User[];
    }

    // 2) fallback — 所有 KYC 通过创作者(isCreatorVerified 不卡 —
    //    早期 cold-start 时 verified 集合是空的)
    const fallback = await this.prisma.user.findMany({
      where: {
        kycStatus: 'APPROVED',
      },
      select: { id: true, email: true, wechatOpenId: true, displayName: true },
      take: 200,
    });
    return fallback as User[];
  }

  /** 对每个收件人:in-site + 邮件 + 微信;任一失败不阻塞其它 */
  private async fanOut(brief: Brief, recipients: User[], kind: 'BRIEF_PUBLISHED' | 'BRIEF_BUMPED') {
    if (recipients.length === 0) {
      this.logger.log(`[push:${kind}] brief=${brief.id} 无匹配创作者,跳过 fan-out`);
      return;
    }

    const isPublish = kind === 'BRIEF_PUBLISHED';
    const catLabel = CATEGORY_LABEL[brief.category] ?? brief.category;
    const price = brief.currentPrice ? Number(brief.currentPrice) : 0;
    const briefUrl = `https://ibi.ren/creator/brief/${brief.id}`;
    const title = isPublish
      ? `📦 新 ${catLabel} 任务包,¥${price}`
      : `💰 任务包加价,现 ¥${price}`;
    const body = isPublish
      ? `${brief.title} (${catLabel} · ¥${price})`
      : `买家加价后总价 ¥${price},点击查看`;
    const link = `/creator/brief/${brief.id}`;

    const wechatTemplateId = this.wechat.pickTemplateId(kind);

    this.logger.log(
      `[push:${kind}] brief=${brief.id} buyer=${brief.buyerId} recipients=${recipients.length}`,
    );

    // 异步 fan-out — 不阻塞 publish/bump HTTP 响应
    setImmediate(async () => {
      let siteOk = 0;
      let mailOk = 0;
      let wxOk = 0;
      for (const u of recipients) {
        // 1) in-site (永远)
        try {
          await this.notif.create({
            userId: u.id,
            type: kind,
            title,
            body,
            link,
          });
          siteOk++;
        } catch (e: any) {
          this.logger.warn(`[push] notif fail user=${u.id}: ${e?.message}`);
        }

        // 2) email
        if (u.email) {
          const html = `
            <div style="font-family: -apple-system, 'PingFang SC', sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color:#1a1a1a;">${title}</h2>
              <p>买家:${brief.buyerId.slice(0, 8)}… 发了一单${catLabel}</p>
              <p>${body}</p>
              <p style="margin: 24px 0;">
                <a href="${briefUrl}" style="background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">
                  立即查看 →
                </a>
              </p>
              <hr style="border:none;border-top:1px solid #eee;" />
              <p style="color:#888;font-size:12px;">ibi.ren · 平台推送(开发期可关 directmail 凭据走 mock 日志)</p>
            </div>
          `;
          const r = await this.email.send({
            to: u.email,
            subject: title,
            html,
            text: `${title}\n${body}\n查看:${briefUrl}`,
          });
          if (r.ok) mailOk++;
        }

        // 3) wechat
        if (u.wechatOpenId && wechatTemplateId) {
          const r = await this.wechat.sendTemplate({
            openId: u.wechatOpenId,
            templateId: wechatTemplateId,
            data: {
              first: { value: title },
              keyword1: { value: catLabel },
              keyword2: { value: `¥${price}` },
              remark: { value: '点击查看详情' },
            },
            url: briefUrl,
          });
          if (r.ok) wxOk++;
        }
      }
      this.logger.log(
        `[push:${kind} done] brief=${brief.id} site=${siteOk}/${recipients.length} mail=${mailOk} wx=${wxOk}`,
      );
    });
  }
}
