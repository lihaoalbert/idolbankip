import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Review } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ReviewRole = 'buyer_to_creator' | 'creator_to_buyer';
const VALID_ROLES: ReviewRole[] = ['buyer_to_creator', 'creator_to_buyer'];

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建评价 — 仅订单结束 (workspace.approved) 后才能评价
   * 同一 (briefId, role) 唯一 — 同一方向只能评一次
   */
  async create(
    briefId: string,
    fromUserId: string,
    role: ReviewRole,
    rating: number,
    content: string,
    tags?: string[],
  ): Promise<Review> {
    if (!VALID_ROLES.includes(role)) {
      throw new BadRequestException(`role 必须是 ${VALID_ROLES.join('/')}`);
    }
    if (rating < 1 || rating > 5) {
      throw new BadRequestException('rating 必须在 1-5 之间');
    }
    if (!content || content.length < 5) {
      throw new BadRequestException('content 至少 5 字');
    }

    // 校验 brief 存在 + workspace 已 approved + caller 是参与方
    const brief = await this.prisma.brief.findUnique({
      where: { id: briefId },
      include: { workspace: { select: { id: true, status: true, creatorId: true } } },
    });
    if (!brief) throw new NotFoundException('brief 不存在');
    if (!brief.workspace) throw new BadRequestException('该 brief 还没有 workspace');
    if (brief.workspace.status !== 'approved') {
      throw new BadRequestException('只有订单结束 (workspace.approved) 才能评价');
    }

    // role 决定 fromUser/toUser
    const toUserId = role === 'buyer_to_creator' ? brief.workspace.creatorId : brief.buyerId;
    if (fromUserId !== brief.buyerId && fromUserId !== brief.workspace.creatorId) {
      throw new ForbiddenException('只有订单参与方能评价');
    }
    // 检查方向是否正确
    if (role === 'buyer_to_creator' && fromUserId !== brief.buyerId) {
      throw new ForbiddenException('只有买家可评 buyer_to_creator');
    }
    if (role === 'creator_to_buyer' && fromUserId !== brief.workspace.creatorId) {
      throw new ForbiddenException('只有创作者可评 creator_to_buyer');
    }

    try {
      return await this.prisma.review.create({
        data: {
          briefId,
          fromUserId,
          toUserId,
          role,
          rating,
          content,
          tags: tags ? (tags as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
    } catch (e: any) {
      // @@unique([briefId, role]) 冲突
      if (e?.code === 'P2002') {
        throw new BadRequestException(`该方向已评价过 (${role})`);
      }
      throw e;
    }
  }

  /**
   * 列某 brief 的所有评价
   */
  async listByBrief(briefId: string): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { briefId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * 列某用户收到的所有评价 (用于创作者主页)
   */
  async listReceivedByUser(userId: string): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { toUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        from: { select: { id: true, displayName: true, avatarUrl: true } },
        brief: { select: { id: true, title: true } },
      },
    });
  }

  /**
   * 算某用户收到的平均分 + 计数 — 用于信用分 (W5 E3 复用)
   */
  async getUserRatingSummary(userId: string): Promise<{
    count: number;
    avgRating: number;
    asCreator: { count: number; avgRating: number };
    asBuyer: { count: number; avgRating: number };
  }> {
    const all = await this.prisma.review.findMany({
      where: { toUserId: userId },
      select: { rating: true, role: true },
    });
    const asCreator = all.filter((r) => r.role === 'buyer_to_creator');
    const asBuyer = all.filter((r) => r.role === 'creator_to_buyer');
    return {
      count: all.length,
      avgRating: all.length ? avg(all.map((r) => r.rating)) : 0,
      asCreator: {
        count: asCreator.length,
        avgRating: asCreator.length ? avg(asCreator.map((r) => r.rating)) : 0,
      },
      asBuyer: {
        count: asBuyer.length,
        avgRating: asBuyer.length ? avg(asBuyer.map((r) => r.rating)) : 0,
      },
    };
  }
}

function avg(arr: number[]): number {
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;
}