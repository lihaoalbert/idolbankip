import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateLeadParams {
  name: string;
  company?: string;
  phone?: string;
  wechat?: string;
  email?: string;
  message: string;
  source?: string;
}

const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 分钟内同联系方式不重复建行

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);
  private wecomWarned = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(params: CreateLeadParams) {
    if (!params.phone && !params.wechat && !params.email) {
      throw new BadRequestException('请至少填写一种联系方式：手机号、微信号或邮箱');
    }

    // 防重复: 同 phone 或 wechat 10 分钟内已有 NEW 线索则直接返回, 不新建
    const contactOr = [
      ...(params.phone ? [{ phone: params.phone }] : []),
      ...(params.wechat ? [{ wechat: params.wechat }] : []),
    ];
    if (contactOr.length > 0) {
      const existing = await this.prisma.contactLead.findFirst({
        where: {
          status: 'NEW',
          createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
          OR: contactOr,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return { lead: existing, duplicated: true };
      }
    }

    const lead = await this.prisma.contactLead.create({
      data: {
        name: params.name,
        company: params.company || null,
        phone: params.phone || null,
        wechat: params.wechat || null,
        email: params.email || null,
        message: params.message,
        source: params.source || null,
        status: 'NEW',
      },
    });

    await this.notifyWecom(lead);
    return { lead, duplicated: false };
  }

  /**
   * 企业微信群机器人通知。失败只记日志, 绝不影响留资主流程。
   */
  private async notifyWecom(lead: {
    name: string;
    phone: string | null;
    wechat: string | null;
    email: string | null;
    message: string;
    source: string | null;
    createdAt: Date;
  }) {
    const webhook = this.config.get<string>('LEADS_WECOM_WEBHOOK');
    if (!webhook) {
      if (!this.wecomWarned) {
        this.wecomWarned = true;
        this.logger.warn('LEADS_WECOM_WEBHOOK 未配置, 跳过新线索企微通知');
      }
      return;
    }
    const contact = [
      lead.phone ? `手机 ${lead.phone}` : '',
      lead.wechat ? `微信 ${lead.wechat}` : '',
      lead.email ? `邮箱 ${lead.email}` : '',
    ]
      .filter(Boolean)
      .join(' / ');
    const time = lead.createdAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const content = [
      '📩 新留资线索',
      `姓名: ${lead.name}`,
      `联系方式: ${contact}`,
      `留言: ${lead.message.slice(0, 100)}`,
      `来源: ${lead.source || '未知'}`,
      `时间: ${time}`,
    ].join('\n');
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'text', text: { content } }),
      });
      if (!res.ok) {
        this.logger.error(`企微 webhook 返回 ${res.status}`);
      }
    } catch (err) {
      this.logger.error(`企微 webhook 调用失败: ${(err as Error).message}`);
    }
  }

  list(status?: string) {
    return this.prisma.contactLead.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  update(id: string, data: { status?: 'NEW' | 'CONTACTED' | 'CLOSED'; notes?: string }) {
    return this.prisma.contactLead.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
  }
}
