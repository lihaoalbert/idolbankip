import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Workspace, WorkspaceMessage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// W3 W2 Workspace 状态机
// active → submitted → (approved | revision) → submitted → ...
// approved 是终态
export const WS_STATUS = {
  ACTIVE: 'active',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REVISION: 'revision',
} as const;
export type WorkspaceStatus = (typeof WS_STATUS)[keyof typeof WS_STATUS];

const VALID_TRANSITIONS: Record<WorkspaceStatus, WorkspaceStatus[]> = {
  [WS_STATUS.ACTIVE]: [WS_STATUS.SUBMITTED],
  [WS_STATUS.SUBMITTED]: [WS_STATUS.APPROVED, WS_STATUS.REVISION],
  [WS_STATUS.REVISION]: [WS_STATUS.SUBMITTED],
  [WS_STATUS.APPROVED]: [],
};

export interface ToolchainMap {
  sora?: boolean;
  kling?: boolean;
  jimeng?: boolean;
  runway?: boolean;
  [k: string]: boolean | undefined;
}

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * 在 BidService.accept 事务里创建 workspace
   * 必须接 tx,保证 workspace 创建和 bid.accept 同事务
   */
  async createForAcceptedBid(
    tx: Prisma.TransactionClient,
    briefId: string,
    creatorId: string,
  ): Promise<Workspace> {
    return tx.workspace.create({
      data: {
        briefId,
        creatorId,
        toolchain: {} as Prisma.InputJsonValue,
        status: WS_STATUS.ACTIVE,
      },
    });
  }

  /**
   * 查 workspace 详情 — viewer 必须是创作者或对应 brief 的买家
   */
  async findById(
    workspaceId: string,
    viewerId: string,
  ): Promise<
    Workspace & {
      brief: {
        id: string;
        title: string;
        buyerId: string;
        status: string;
        budgetMin: any;
        budgetMax: any;
        deadlineAt: Date;
        description: string | null;
      };
    }
  > {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        brief: {
          select: {
            id: true,
            title: true,
            buyerId: true,
            status: true,
            budgetMin: true,
            budgetMax: true,
            deadlineAt: true,
            description: true,
            // R11.1 P0-1: 关联订单,买家侧顶栏「去支付」CTA 用
            // 一个 brief 对应一个 Order,只取最新一笔
            orders: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                status: true,
                amountFen: true,
                paidAt: true,
              },
            },
          },
        },
      },
    });
    if (!ws) throw new NotFoundException('workspace 不存在');
    if (ws.creatorId !== viewerId && ws.brief.buyerId !== viewerId) {
      throw new ForbiddenException('无权查看该 workspace');
    }
    return ws as Workspace & {
      brief: {
        id: string;
        title: string;
        buyerId: string;
        status: string;
        budgetMin: any;
        budgetMax: any;
        deadlineAt: Date;
        description: string | null;
        orders: Array<{ id: string; status: string; amountFen: number; paidAt: Date | null }>;
      };
    };
  }

  /**
   * R11.1 P0-2: 创作者中标 workspace 列表(我接的活儿)
   * 命中 @@index([creatorId, status])
   */
  async listForCreator(creatorId: string) {
    const items = await this.prisma.workspace.findMany({
      where: { creatorId },
      orderBy: { startedAt: 'desc' },
      include: {
        brief: {
          select: {
            id: true,
            title: true,
            status: true,
            budgetMax: true,
            deadlineAt: true,
          },
        },
      },
    });
    return { items };
  }

  /**
   * 创作者更新工具链
   */
  async updateToolchain(
    workspaceId: string,
    creatorId: string,
    toolchain: ToolchainMap,
  ): Promise<Workspace> {
    await this.assertCreator(workspaceId, creatorId);
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { toolchain: toolchain as Prisma.InputJsonValue },
    });
  }

  /**
   * 创作者更新分镜脚本
   */
  async updateScripts(
    workspaceId: string,
    creatorId: string,
    scripts: unknown,
  ): Promise<Workspace> {
    await this.assertCreator(workspaceId, creatorId);
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { scripts: scripts as Prisma.InputJsonValue },
    });
  }

  /**
   * 创作者提交 (active / revision → submitted)
   */
  async submit(workspaceId: string, creatorId: string): Promise<Workspace> {
    await this.assertCreator(workspaceId, creatorId);
    const ws = await this.transition(workspaceId, WS_STATUS.SUBMITTED, {
      submittedAt: new Date(),
    });
    // R11.2 P1-4: 提交 → 通知买家审
    const brief = await this.prisma.brief.findUnique({
      where: { id: ws.briefId },
      select: { buyerId: true, title: true },
    });
    if (brief) {
      this.notifications
        .create({
          userId: brief.buyerId,
          type: 'WORKSPACE_SUBMITTED',
          title: '创作者已提交',
          body: `${brief.title} — 创作者已提交工作区,等待你审核`,
          link: `/buyer/workspaces/${workspaceId}`,
        })
        .catch((e) =>
          this.logger.warn(`notify buyer (WORKSPACE_SUBMITTED) failed: ${e?.message ?? e}`),
        );
    }
    return ws;
  }

  /**
   * 买家通过 (submitted → approved) — 终态
   */
  async approve(workspaceId: string, buyerId: string): Promise<Workspace> {
    await this.assertBuyer(workspaceId, buyerId);
    const ws = await this.transition(workspaceId, WS_STATUS.APPROVED, {
      finishedAt: new Date(),
    });
    // R11.2 P1-4: 通过 → 通知创作者(协作完结)
    const brief = await this.prisma.brief.findUnique({
      where: { id: ws.briefId },
      select: { title: true },
    });
    this.notifications
      .create({
        userId: ws.creatorId,
        type: 'WORKSPACE_APPROVED',
        title: '工作区已通过',
        body: `${brief?.title ?? ''} — 买家已通过审核,可上传交付物`,
        link: `/workspaces/${workspaceId}`,
      })
      .catch((e) =>
        this.logger.warn(`notify creator (WORKSPACE_APPROVED) failed: ${e?.message ?? e}`),
      );
    return ws;
  }

  /**
   * 买家打回 (submitted → revision) + revisionCount++
   */
  async requestRevision(
    workspaceId: string,
    buyerId: string,
  ): Promise<Workspace> {
    await this.assertBuyer(workspaceId, buyerId);
    const ws = await this.transition(workspaceId, WS_STATUS.REVISION);
    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { revisionCount: { increment: 1 } },
    });
    // R11.2 P1-4: 打回 → 通知创作者改
    const brief = await this.prisma.brief.findUnique({
      where: { id: ws.briefId },
      select: { title: true },
    });
    this.notifications
      .create({
        userId: ws.creatorId,
        type: 'WORKSPACE_REVISION',
        title: '工作区被打回',
        body: `${brief?.title ?? ''} — 买家打回,请按要求修改后重新提交`,
        link: `/workspaces/${workspaceId}`,
      })
      .catch((e) =>
        this.logger.warn(`notify creator (WORKSPACE_REVISION) failed: ${e?.message ?? e}`),
      );
    return updated;
  }

  private async transition(
    workspaceId: string,
    target: WorkspaceStatus,
    extra: Prisma.WorkspaceUpdateInput = {},
  ): Promise<Workspace> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!ws) throw new NotFoundException('workspace 不存在');
    const allowed = VALID_TRANSITIONS[ws.status as WorkspaceStatus] ?? [];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `workspace 状态 ${ws.status} 不能转 ${target}`,
      );
    }
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { status: target, ...extra },
    });
  }

  private async assertCreator(
    workspaceId: string,
    creatorId: string,
  ): Promise<void> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { creatorId: true },
    });
    if (!ws) throw new NotFoundException('workspace 不存在');
    if (ws.creatorId !== creatorId) {
      throw new ForbiddenException('只有创作者可操作');
    }
  }

  private async assertBuyer(
    workspaceId: string,
    buyerId: string,
  ): Promise<void> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { brief: { select: { buyerId: true } } },
    });
    if (!ws) throw new NotFoundException('workspace 不存在');
    if (ws.brief.buyerId !== buyerId) {
      throw new ForbiddenException('只有买家可操作');
    }
  }

  /**
   * 消息列表 — 创作者 / 买家 都能看
   */
  async listMessages(
    workspaceId: string,
    viewerId: string,
    q: { page?: number; size?: number },
  ): Promise<{ items: (WorkspaceMessage & { from: any })[]; total: number }> {
    await this.assertMember(workspaceId, viewerId);
    const page = q.page ?? 1;
    const size = q.size ?? 50;
    const [items, total] = await Promise.all([
      this.prisma.workspaceMessage.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * size,
        take: size,
        include: {
          from: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      }),
      this.prisma.workspaceMessage.count({ where: { workspaceId } }),
    ]);
    return { items, total };
  }

  /**
   * 发消息
   */
  async addMessage(
    workspaceId: string,
    fromUserId: string,
    content: string,
    attachments?: unknown,
    type: string = 'text',
  ): Promise<WorkspaceMessage> {
    await this.assertMember(workspaceId, fromUserId);
    return this.prisma.workspaceMessage.create({
      data: {
        workspaceId,
        fromUserId,
        content,
        attachments: attachments as Prisma.InputJsonValue | undefined,
        type,
      },
    });
  }

  private async assertMember(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { brief: { select: { buyerId: true } } },
    });
    if (!ws) throw new NotFoundException('workspace 不存在');
    if (ws.creatorId !== userId && ws.brief.buyerId !== userId) {
      throw new ForbiddenException('无权操作该 workspace');
    }
  }
}