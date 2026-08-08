import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SubmissionComment, WorkspaceSubmission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SUBMISSION_STATUSES = ['pending', 'approved', 'rejected', 'superseded'] as const;

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创作者上传中间稿
   * 自动计算下一个 version 号(同一 workspace 内 +1)
   */
  async create(
    workspaceId: string,
    creatorId: string,
    params: { ossKeys: string[]; notes?: string },
  ): Promise<WorkspaceSubmission> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, creatorId: true, status: true },
    });
    if (!ws) throw new NotFoundException('workspace 不存在');
    if (ws.creatorId !== creatorId) {
      throw new ForbiddenException('只有创作者可上传中间稿');
    }
    if (ws.status === 'approved') {
      throw new BadRequestException('workspace 已通过,不能再上传');
    }
    if (!params.ossKeys || params.ossKeys.length === 0) {
      throw new BadRequestException('ossKeys 不能为空');
    }

    return this.prisma.$transaction(async (tx) => {
      const last = await tx.workspaceSubmission.findFirst({
        where: { workspaceId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (last?.version ?? 0) + 1;

      // 之前的 pending 自动 superseded(防止重复审批)
      await tx.workspaceSubmission.updateMany({
        where: { workspaceId, status: 'pending' },
        data: { status: 'superseded' },
      });

      return tx.workspaceSubmission.create({
        data: {
          workspaceId,
          creatorId,
          version: nextVersion,
          ossKeys: params.ossKeys as Prisma.InputJsonValue,
          notes: params.notes ?? null,
          status: 'pending',
        },
      });
    });
  }

  async list(
    workspaceId: string,
    viewerId: string,
  ): Promise<{ items: WorkspaceSubmission[]; total: number }> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { brief: { select: { buyerId: true } } },
    });
    if (!ws) throw new NotFoundException('workspace 不存在');
    if (ws.creatorId !== viewerId && ws.brief.buyerId !== viewerId) {
      throw new ForbiddenException('无权查看');
    }
    const [items, total] = await Promise.all([
      this.prisma.workspaceSubmission.findMany({
        where: { workspaceId },
        orderBy: { version: 'desc' },
        include: {
          comments: {
            orderBy: { createdAt: 'asc' },
            include: {
              from: { select: { id: true, displayName: true, avatarUrl: true } },
            },
          },
        },
      }),
      this.prisma.workspaceSubmission.count({ where: { workspaceId } }),
    ]);
    return { items, total };
  }

  async setStatus(
    submissionId: string,
    buyerId: string,
    status: 'approved' | 'rejected',
  ): Promise<WorkspaceSubmission> {
    const sub = await this.prisma.workspaceSubmission.findUnique({
      where: { id: submissionId },
      include: { workspace: { include: { brief: { select: { buyerId: true } } } } },
    });
    if (!sub) throw new NotFoundException('submission 不存在');
    if (sub.workspace.brief.buyerId !== buyerId) {
      throw new ForbiddenException('只有买家可改状态');
    }
    if (sub.status !== 'pending') {
      throw new BadRequestException(`当前状态 ${sub.status} 不能再改`);
    }
    return this.prisma.workspaceSubmission.update({
      where: { id: submissionId },
      data: { status },
    });
  }

  async addComment(
    submissionId: string,
    fromUserId: string,
    content: string,
  ): Promise<SubmissionComment> {
    if (!content || content.trim().length === 0) {
      throw new BadRequestException('评论不能为空');
    }
    const sub = await this.prisma.workspaceSubmission.findUnique({
      where: { id: submissionId },
      include: {
        workspace: {
          select: { creatorId: true, brief: { select: { buyerId: true } } },
        },
      },
    });
    if (!sub) throw new NotFoundException('submission 不存在');
    if (
      sub.workspace.creatorId !== fromUserId &&
      sub.workspace.brief.buyerId !== fromUserId
    ) {
      throw new ForbiddenException('无权评论');
    }
    return this.prisma.submissionComment.create({
      data: { submissionId, fromUserId, content: content.trim() },
    });
  }
}