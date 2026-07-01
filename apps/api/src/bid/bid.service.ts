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

@Injectable()
export class BidService {
  private readonly logger = new Logger(BidService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    try {
      return await this.prisma.bid.create({
        data: {
          briefId,
          creatorId,
          price: params.price,
          deliveryDays: params.deliveryDays,
          proposal: params.proposal,
          status: 'pending',
        },
      });
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

    return this.prisma.$transaction(async (tx) => {
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
      const workspace = await tx.workspace.create({
        data: {
          briefId,
          creatorId: bid.creatorId,
          toolchain: {},
          status: 'active',
        },
      });

      return { bid: accepted, brief: updatedBrief, workspace };
    });
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