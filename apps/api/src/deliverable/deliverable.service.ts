import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Deliverable, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublisherService } from './publishers/base.publisher';

// W4 Deliverable 状态机
// pending → approved → published (终态)
// pending → rejected → published (创作者修后可重提, 走 publish 端点)
export const DELIVERABLE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
} as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUS)[keyof typeof DELIVERABLE_STATUS];

const VALID_TRANSITIONS: Record<DeliverableStatus, DeliverableStatus[]> = {
  [DELIVERABLE_STATUS.PENDING]: [DELIVERABLE_STATUS.APPROVED, DELIVERABLE_STATUS.REJECTED],
  [DELIVERABLE_STATUS.APPROVED]: [DELIVERABLE_STATUS.PUBLISHED],
  [DELIVERABLE_STATUS.REJECTED]: [DELIVERABLE_STATUS.PUBLISHED], // 创作者修后重新提交发布
  [DELIVERABLE_STATUS.PUBLISHED]: [],
};

export interface DeliverableSpec {
  duration?: number;
  ratio?: '9:16' | '16:9' | '1:1';
  resolution?: string;
  fileSize?: number;
  [k: string]: unknown;
}

export const SUPPORTED_PLATFORMS = [
  'douyin',
  'xiaohongshu',
  'wechat',
  'youtube',
  'tiktok',
] as const;
export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export const SUPPORTED_DELIVERABLE_TYPES = ['video', 'image', 'copy'] as const;

@Injectable()
export class DeliverableService {
  private readonly logger = new Logger(DeliverableService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: PublisherService,
  ) {}

  /**
   * 创作者提交交付 — 仅在 workspace 已 approved 之后才能创建
   * workspace.approved 是 buyer 已经审过创作内容的信号
   */
  async create(
    workspaceId: string,
    creatorId: string,
    input: {
      type: string;
      platform: string;
      url: string;
      thumbnailUrl?: string;
      spec: DeliverableSpec;
    },
  ): Promise<Deliverable> {
    const ws = await this.assertCreator(workspaceId, creatorId);
    if (ws.status !== 'approved') {
      throw new BadRequestException(
        `workspace 必须 approved 后才能交付 (当前: ${ws.status})`,
      );
    }
    if (!SUPPORTED_DELIVERABLE_TYPES.includes(input.type as any)) {
      throw new BadRequestException(`type 必须是 ${SUPPORTED_DELIVERABLE_TYPES.join('/')}`);
    }
    if (!SUPPORTED_PLATFORMS.includes(input.platform as any)) {
      throw new BadRequestException(`platform 必须是 ${SUPPORTED_PLATFORMS.join('/')}`);
    }
    return this.prisma.deliverable.create({
      data: {
        briefId: ws.briefId,
        workspaceId,
        type: input.type,
        platform: input.platform,
        url: input.url,
        thumbnailUrl: input.thumbnailUrl,
        spec: input.spec as Prisma.InputJsonValue,
        status: DELIVERABLE_STATUS.PENDING,
      },
    });
  }

  /**
   * 列表 — 创作者或买家都能查某 workspace 的交付
   */
  async listByWorkspace(
    workspaceId: string,
    viewerId: string,
    q: { page?: number; size?: number; status?: string },
  ): Promise<{ items: Deliverable[]; total: number }> {
    await this.assertMember(workspaceId, viewerId);
    const page = q.page ?? 1;
    const size = q.size ?? 50;
    const where: Prisma.DeliverableWhereInput = { workspaceId };
    if (q.status) where.status = q.status;
    const [items, total] = await Promise.all([
      this.prisma.deliverable.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.deliverable.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * 买家工作台 — 跨 workspace 列出某买家所有 deliverable
   * 默认只显示 pending / approved (待处理), 已 published 默认折叠
   */
  async listForBuyer(
    buyerId: string,
    q: { page?: number; size?: number; status?: string },
  ): Promise<{
    items: Array<
      Deliverable & {
        brief: { id: string; title: string };
        workspace: { id: string; creatorId: string };
      }
    >;
    total: number;
  }> {
    const page = q.page ?? 1;
    const size = q.size ?? 50;
    const where: Prisma.DeliverableWhereInput = {
      brief: { buyerId },
    };
    if (q.status) {
      where.status = q.status;
    } else {
      // 默认排除 published (历史已发)
      where.status = { not: DELIVERABLE_STATUS.PUBLISHED };
    }
    const [items, total] = await Promise.all([
      this.prisma.deliverable.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        include: {
          brief: { select: { id: true, title: true } },
          workspace: { select: { id: true, creatorId: true } },
        },
      }),
      this.prisma.deliverable.count({ where }),
    ]);
    return { items: items as any, total };
  }

  /**
   * 查单条 — 鉴权后返回
   */
  async findById(
    deliverableId: string,
    viewerId: string,
  ): Promise<
    Deliverable & {
      workspace: { creatorId: string; brief: { buyerId: string } };
    }
  > {
    const d = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
      include: {
        workspace: {
          select: {
            creatorId: true,
            brief: { select: { buyerId: true } },
          },
        },
      },
    });
    if (!d) throw new NotFoundException('deliverable 不存在');
    if (
      d.workspace.creatorId !== viewerId &&
      d.workspace.brief.buyerId !== viewerId
    ) {
      throw new ForbiddenException('无权查看该 deliverable');
    }
    return d as Deliverable & {
      workspace: { creatorId: string; brief: { buyerId: string } };
    };
  }

  /**
   * 买家审批 — pending → approved / rejected
   */
  async reviewByBuyer(
    deliverableId: string,
    buyerId: string,
    decision: 'approved' | 'rejected',
    rejectedReason?: string,
  ): Promise<Deliverable> {
    const d = await this.findById(deliverableId, buyerId);
    if (d.workspace?.brief?.buyerId !== buyerId) {
      throw new ForbiddenException('只有买家可审批');
    }
    const target = decision === 'approved' ? DELIVERABLE_STATUS.APPROVED : DELIVERABLE_STATUS.REJECTED;
    return this.transition(d.id, target, {
      approvedAt: decision === 'approved' ? new Date() : null,
      rejectedReason: decision === 'rejected' ? (rejectedReason ?? '买家打回') : null,
    });
  }

  /**
   * 创作者发布 — approved/rejected → published
   * 真实场景: 调多平台 publisher adapter (W4 D3 实现),成功后回填 publishedUrl + publishedAt
   * 失败: 状态保持原状,抛 ServiceUnavailableException,前端提示重试
   */
  async publish(deliverableId: string, creatorId: string): Promise<Deliverable> {
    const d = await this.findById(deliverableId, creatorId);
    if (d.workspace.creatorId !== creatorId) {
      throw new ForbiddenException('只有创作者可发布');
    }
    // 调 publisher adapter — 拿平台 URL
    const result = await this.publisher.publish(d.platform, {
      videoUrl: d.url,
      title: `deliverable-${d.id}`,
    });
    this.logger.log(
      `published deliverable=${d.id} platform=${d.platform} → ${result.platformUrl}`,
    );
    return this.transition(d.id, DELIVERABLE_STATUS.PUBLISHED, {
      publishedAt: result.publishedAt,
      publishedUrl: result.platformUrl,
    });
  }

  private async transition(
    deliverableId: string,
    target: DeliverableStatus,
    extra: Prisma.DeliverableUpdateInput = {},
  ): Promise<Deliverable> {
    const d = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
    });
    if (!d) throw new NotFoundException('deliverable 不存在');
    const allowed = VALID_TRANSITIONS[d.status as DeliverableStatus] ?? [];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `deliverable 状态 ${d.status} 不能转 ${target}`,
      );
    }
    return this.prisma.deliverable.update({
      where: { id: deliverableId },
      data: { status: target, ...extra },
    });
  }

  private async assertCreator(
    workspaceId: string,
    creatorId: string,
  ): Promise<{ id: string; creatorId: string; briefId: string; status: string }> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, creatorId: true, briefId: true, status: true },
    });
    if (!ws) throw new NotFoundException('workspace 不存在');
    if (ws.creatorId !== creatorId) {
      throw new ForbiddenException('只有创作者可操作');
    }
    return ws;
  }

  private async assertMember(workspaceId: string, userId: string): Promise<void> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { brief: { select: { buyerId: true } } },
    });
    if (!ws) throw new NotFoundException('workspace 不存在');
    if (ws.creatorId !== userId && ws.brief.buyerId !== userId) {
      throw new ForbiddenException('无权查看');
    }
  }
}