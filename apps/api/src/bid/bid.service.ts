import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Bid, Brief } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BidService {
  private readonly logger = new Logger(BidService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * 创作者对 brief 报价
   * 校验:
   *   1. brief 状态是 bidding
   *   2. brief 不是自己发的
   *   3. 没有重复 bid(unique constraint 兜底)
   */
  async create(
    creatorId: string,
    briefId: string,
    params: { price: number; deliveryDays: number; proposal: string },
  ): Promise<Bid> {
    const brief = await this.prisma.brief.findUnique({ where: { id: briefId } });
    if (!brief) throw new NotFoundException('brief 不存在');
    if (brief.status !== 'bidding') {
      throw new BadRequestException('该 brief 不可报价');
    }
    if (brief.buyerId === creatorId) {
      throw new BadRequestException('不能给自己的 brief 报价');
    }
    if (params.price < Number(brief.budgetMin) || params.price > Number(brief.budgetMax)) {
      throw new BadRequestException(
        `报价必须在预算区间 ¥${brief.budgetMin} - ¥${brief.budgetMax}`,
      );
    }

    // R10.2 P1-4: 撤回/拒绝后可重新报价 — DB 唯一约束 @@unique([briefId, creatorId]),
    //   撤回后 status='withdrawn' 的旧记录仍占位;若已存在且可覆盖的状态
    //   (withdrawn/rejected),直接 update 覆盖价格/天数/提案 + 回到 pending。
    const existing = await this.prisma.bid.findUnique({
      where: { briefId_creatorId: { briefId, creatorId } },
    });
    if (existing) {
      if (existing.status === 'pending' || existing.status === 'accepted') {
        throw new ConflictException('你已经报过价了');
      }
      // withdrawn/rejected → 重新激活,刷新价格/天数/提案
      return this.prisma.bid.update({
        where: { id: existing.id },
        data: {
          price: params.price,
          deliveryDays: params.deliveryDays,
          proposal: params.proposal,
          status: 'pending',
          acceptedAt: null,
        },
      });
    }

    try {
      const bid = await this.prisma.bid.create({
        data: {
          briefId,
          creatorId,
          price: params.price,
          deliveryDays: params.deliveryDays,
          proposal: params.proposal,
          status: 'pending',
        },
      });
      // R11.2 P1-4: 投标到达 → 通知买家
      this.notifications.create({
        userId: brief.buyerId,
        type: 'BID_RECEIVED',
        title: '收到新报价',
        body: `${brief.title} — 创作者报价 ¥${params.price} (${params.deliveryDays} 天交付)`,
        link: `/buyer/briefs/${briefId}`,
      }).catch((e) => this.logger.warn(`notify buyer (BID_RECEIVED) failed: ${e?.message ?? e}`));
      return bid;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('你已经报过价了');
      }
      throw e;
    }
  }

  /**
   * 买家接受 bid(中标) — 事务:
   *   1. 校验 brief 所有权
   *   2. brief → in_progress
   *   3. bid → accepted
   *   4. 其他 bid → rejected
   *   5. 创建 Workspace(创作者工作台)
   *   6. R10 P0-3: 同步创建 Order 记录(brief 中标 → /orders 列表出现「中标待付」订单)
   */
  async accept(bidId: string, buyerId: string, briefId: string) {
    const bid = await this.prisma.bid.findUnique({ where: { id: bidId } });
    if (!bid) throw new NotFoundException('bid 不存在');
    if (bid.briefId !== briefId) {
      throw new BadRequestException('bid 与 brief 不匹配');
    }

    const brief = await this.prisma.brief.findUnique({ where: { id: briefId } });
    if (!brief || brief.buyerId !== buyerId) {
      throw new ForbiddenException('无权操作');
    }
    if (brief.status !== 'bidding') {
      throw new BadRequestException(`当前状态 ${brief.status} 不可接单`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. 中标 bid → accepted
      const accepted = await tx.bid.update({
        where: { id: bidId },
        data: { status: 'accepted', acceptedAt: new Date() },
      });

      // 2. 同一 brief 的其他 pending bid → rejected
      await tx.bid.updateMany({
        where: {
          briefId,
          id: { not: bidId },
          status: 'pending',
        },
        data: { status: 'rejected' },
      });

      // 3. brief → in_progress
      const updatedBrief = await tx.brief.update({
        where: { id: briefId },
        data: { status: 'in_progress' },
      });

      // 4. 创建 Workspace(创作者工作台)
      const workspace = await this.workspaces.createForAcceptedBid(
        tx,
        briefId,
        bid.creatorId,
      );

      // 5. R10 P0-3: 同步创建 Order 记录(brief 中标链路打通 /orders)
      //   - ipId = null: brief 中标非 IP 直购
      //   - orderType = DEPOSIT_INTENT: 暂复用,后续补 BRIEF_DEPOSIT 枚举
      //   - amountFen: bid.amount 是元(Double),转分需 Math.round(amount * 100)
      //   - status = CREATED: 待支付;买家在工作台走付款流后 → PAID
      const order = await tx.order.create({
        data: {
          buyerId,
          briefId,
          ipId: null,
          orderType: 'DEPOSIT_INTENT',
          amountFen: Math.round(Number(accepted.price) * 100),
          platformFeeFen: 0,
          status: 'CREATED',
        },
      });

      return { bid: accepted, brief: updatedBrief, workspaceId: workspace.id, orderId: order.id };
    });

    // R11.2 P1-4: 中标 → 通知创作者(在事务提交后发,避免回滚后误通知)
    this.notifications
      .create({
        userId: bid.creatorId,
        type: 'BID_ACCEPTED',
        title: '中标通知',
        body: `${brief.title} — 你的报价已被买家接受,请进入工作区开始创作`,
        link: `/workspaces/${result.workspaceId}`,
      })
      .catch((e) => this.logger.warn(`notify creator (BID_ACCEPTED) failed: ${e?.message ?? e}`));

    return result;
  }

  /**
   * 买家拒绝 bid
   */
  async reject(bidId: string, buyerId: string, briefId: string): Promise<Bid> {
    const bid = await this.prisma.bid.findUnique({ where: { id: bidId } });
    if (!bid || bid.briefId !== briefId) {
      throw new NotFoundException('bid 不存在');
    }
    const brief = await this.prisma.brief.findUnique({ where: { id: briefId } });
    if (!brief || brief.buyerId !== buyerId) {
      throw new ForbiddenException('无权操作');
    }
    if (bid.status !== 'pending') {
      throw new BadRequestException(`bid 状态 ${bid.status} 不可 reject`);
    }
    return this.prisma.bid.update({
      where: { id: bidId },
      data: { status: 'rejected' },
    });
  }

  /**
   * 创作者撤回自己的 bid
   */
  async withdraw(bidId: string, creatorId: string, briefId: string): Promise<Bid> {
    const bid = await this.prisma.bid.findUnique({ where: { id: bidId } });
    if (!bid || bid.briefId !== briefId) {
      throw new NotFoundException('bid 不存在');
    }
    if (bid.creatorId !== creatorId) {
      throw new ForbiddenException('无权操作');
    }
    if (bid.status !== 'pending') {
      throw new BadRequestException(`bid 状态 ${bid.status} 不可 withdraw`);
    }
    return this.prisma.bid.update({
      where: { id: bidId },
      data: { status: 'withdrawn' },
    });
  }

  /**
   * 买家查 brief 的所有 bid(按价格升序)
   */
  async listForBuyer(
    buyerId: string,
    briefId: string,
    q: { page?: number; size?: number },
  ): Promise<{ items: Bid[]; total: number }> {
    const brief = await this.prisma.brief.findUnique({ where: { id: briefId } });
    if (!brief || brief.buyerId !== buyerId) {
      throw new ForbiddenException('无权查看');
    }
    const page = q.page ?? 1;
    const size = q.size ?? 50;
    const [items, total] = await Promise.all([
      this.prisma.bid.findMany({
        where: { briefId },
        orderBy: { price: 'asc' },
        skip: (page - 1) * size,
        take: size,
        include: {
          creator: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              creatorProfile: {
                select: {
                  level: true,
                  ratingAvg: true,
                  completedOrders: true,
                  responseRate: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.bid.count({ where: { briefId } }),
    ]);
    return { items, total };
  }

  /**
   * 创作者查自己报过的 bid
   */
  async listByCreator(
    creatorId: string,
    q: { page?: number; size?: number },
  ): Promise<{ items: Bid[]; total: number }> {
    const page = q.page ?? 1;
    const size = q.size ?? 20;
    const [items, total] = await Promise.all([
      this.prisma.bid.findMany({
        where: { creatorId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        include: {
          brief: {
            select: {
              id: true,
              title: true,
              category: true,
              budgetMin: true,
              budgetMax: true,
              deadlineAt: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.bid.count({ where: { creatorId } }),
    ]);
    return { items, total };
  }
}