import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type NotificationType =
  | 'KYC_APPROVED'
  | 'KYC_REJECTED'
  | 'IP_APPROVED'
  | 'IP_REJECTED'
  | 'IP_PUBLIC'
  | 'IP_REGISTERED'
  // #30.6.22 公示中 admin 回退补料 (PUBLIC_INTENT → PENDING_REVIEW)
  | 'IP_DEMOTED'
  | 'CERT_APPROVED'
  | 'CERT_REJECTED'
  // #30.6.26 著作权代申请 — 创作者接收的状态变更通知
  | 'COPYRIGHT_REG_DRAFT'
  | 'COPYRIGHT_REG_SUBMITTED'
  | 'COPYRIGHT_REG_ACCEPTED'
  | 'COPYRIGHT_REG_CERTIFIED'
  | 'COPYRIGHT_REG_REJECTED'
  // #30.7.1 W2 #29 推送通知 — 买家发包 / 加价触达创作者
  | 'BRIEF_PUBLISHED'
  | 'BRIEF_BUMPED'
  // #30.7.1 W2 #31 过期自动 close — 通知买家
  | 'BRIEF_EXPIRED'
  // #30.7.1 W2 #31 买家手动关闭后通知(便于买家误关时定位)
  | 'BRIEF_CLOSED'
  // R11.1 P0-1: brief 中标订单支付完成 — 推送给中标的创作者
  | 'ORDER_DEPOSIT_PAID'
  // R11.2 P1-4: 核心业务事件通知补全
  | 'BID_RECEIVED'         // 创作者投标 → 通知买家
  | 'BID_ACCEPTED'         // 买家中标 → 通知创作者
  | 'WORKSPACE_SUBMITTED'  // 创作者提交工作区 → 通知买家
  | 'WORKSPACE_APPROVED'   // 买家通过工作区 → 通知创作者
  | 'WORKSPACE_REVISION'   // 买家打回 → 通知创作者
  | 'DELIVERABLE_UPLOADED'; // 创作者上传交付物 → 通知买家

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(p: CreateNotificationParams) {
    return this.prisma.notification.create({
      data: {
        userId: p.userId,
        type: p.type,
        title: p.title,
        body: p.body,
        link: p.link,
      },
    });
  }

  async listForUser(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const limit = Math.min(100, opts.limit ?? 30);
    const where: any = { userId };
    if (opts.unreadOnly) where.readAt = null;
    const items = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const unreadCount = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { items, unreadCount };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(userId: string, id: string) {
    // 仅能标记自己的通知;防御性 where 加 userId
    const r = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: r.count };
  }

  async markAllRead(userId: string) {
    const r = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: r.count };
  }
}