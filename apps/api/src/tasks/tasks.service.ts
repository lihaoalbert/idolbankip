// #30 任务发布 / 接单 — Service
// 核心循环:
//   admin:  createTask / listTasks (admin 视角) / getTaskDetail / closeTask / listSubmissions / approveSubmission / rejectSubmission
//   creator: listOpenTasks / getTaskForCreator / acceptTask / listMyAccepts
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AgeBucket, Ethnicity, Gender, IpAsset, IpOrigin, IpStatus, IpTask, IpTaskStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IpsService } from '../ips/ips.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface TaskSpec {
  count: number;
  gender?: Gender;
  ageBuckets?: AgeBucket[];
  ethnicities?: Ethnicity[];
  styleTags?: string[];
  scenarioTags?: string[];
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ips: IpsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ===================== ADMIN =====================

  /**
   * admin 发布任务
   */
  async createTask(adminId: string, params: {
    title: string;
    description: string;
    spec: TaskSpec;
    budgetFen: number;
    perIpFen?: number;
    maxAccepts: number;
    deadlineAt: Date;
  }): Promise<IpTask> {
    if (params.deadlineAt.getTime() <= Date.now()) {
      throw new BadRequestException('截止时间必须在未来');
    }
    if (params.perIpFen && params.perIpFen * params.spec.count > params.budgetFen) {
      throw new BadRequestException('单 IP 报酬 × 数量 > 总预算, 请调整');
    }
    const task = await this.prisma.ipTask.create({
      data: {
        title: params.title,
        description: params.description,
        spec: params.spec as unknown as Prisma.InputJsonValue,
        budgetFen: params.budgetFen,
        perIpFen: params.perIpFen,
        maxAccepts: params.maxAccepts,
        deadlineAt: params.deadlineAt,
        createdById: adminId,
        status: IpTaskStatus.OPEN,
      },
    });
    await this.audit.log({
      actorId: adminId,
      action: 'TASK_CREATED',
      targetType: 'IpTask',
      targetId: task.id,
      payload: { title: task.title, budgetFen: task.budgetFen },
    });
    this.logger.log(`task created: ${task.id} (${task.title}) budget=${task.budgetFen}fen`);
    return task;
  }

  /**
   * admin 列表所有任务
   */
  async listAllTasks(filter?: { status?: IpTaskStatus }): Promise<IpTask[]> {
    return this.prisma.ipTask.findMany({
      where: filter?.status ? { status: filter.status } : undefined,
      orderBy: [{ status: 'asc' }, { deadlineAt: 'asc' }],
      take: 200,
      include: {
        _count: { select: { accepts: true, submissions: true } },
      },
    });
  }

  /**
   * admin 任务详情 (含接单 + 提交统计)
   */
  async getTaskDetail(taskId: string): Promise<IpTask & { _count: { accepts: number; submissions: number } }> {
    const task = await this.prisma.ipTask.findUnique({
      where: { id: taskId },
      include: {
        _count: { select: { accepts: true, submissions: true } },
      },
    });
    if (!task) throw new NotFoundException('任务不存在');
    return task as any;
  }

  /**
   * admin 关闭 / 取消 / 完成任务
   */
  async updateTaskStatus(taskId: string, actorId: string, action: 'CLOSE' | 'CANCEL' | 'COMPLETE'): Promise<IpTask> {
    const task = await this.prisma.ipTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('任务不存在');

    let nextStatus: IpTaskStatus;
    if (action === 'CLOSE') {
      if (task.status !== IpTaskStatus.OPEN) {
        throw new BadRequestException(`OPEN 状态才能关闭, 当前 ${task.status}`);
      }
      nextStatus = IpTaskStatus.CLOSED;
    } else if (action === 'CANCEL') {
      if (task.status === IpTaskStatus.COMPLETED) {
        throw new BadRequestException('已完成的任务不能取消');
      }
      nextStatus = IpTaskStatus.CANCELLED;
    } else if (action === 'COMPLETE') {
      if (task.status === IpTaskStatus.OPEN) {
        throw new BadRequestException('请先关闭任务再标完成');
      }
      if (task.status === IpTaskStatus.CANCELLED) {
        throw new BadRequestException('已取消的任务不能标完成');
      }
      nextStatus = IpTaskStatus.COMPLETED;
    } else {
      throw new BadRequestException(`不支持的操作: ${action}`);
    }

    const updated = await this.prisma.ipTask.update({
      where: { id: taskId },
      data: {
        status: nextStatus,
        closedAt: new Date(),
      },
    });
    await this.audit.log({
      actorId,
      action: `TASK_${action}`,
      targetType: 'IpTask',
      targetId: taskId,
      payload: { from: task.status, to: nextStatus },
    });
    this.logger.log(`task ${taskId}: ${task.status} → ${nextStatus} (${action})`);
    return updated;
  }

  /**
   * admin 列出某任务的所有提交 IP (按 creatorId 分组, 用前端组装)
   */
  async listSubmissions(taskId: string): Promise<Array<{
    id: string;
    code: string;
    displayName: string;
    status: IpStatus;
    rejectionReason: string | null;
    thumbnailKey: string;
    createdAt: Date;
    creator: { id: string; displayName: string; email: string };
  }>> {
    const ips = await this.prisma.ipAsset.findMany({
      where: { taskId },
      orderBy: [{ creatorId: 'asc' }, { createdAt: 'desc' }],
      include: {
        creator: { select: { id: true, displayName: true, email: true } },
      },
    });
    return ips.map((ip) => ({
      id: ip.id,
      code: ip.code,
      displayName: ip.displayName,
      status: ip.status,
      rejectionReason: ip.rejectionReason,
      thumbnailKey: ip.thumbnailKey,
      createdAt: ip.createdAt,
      creator: ip.creator,
    }));
  }

  /**
   * admin 通过任务提交的 IP — 走 P1 平台代办证书 (暂存 status=PUBLIC_INTENT 等 #28)
   * MVP 阶段: 跟自传 IP 走相同流转, 只是标记 origin=TASK
   */
  async approveSubmission(taskId: string, ipId: string, actorId: string): Promise<IpAsset> {
    const ip = await this.prisma.ipAsset.findUnique({ where: { id: ipId } });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.taskId !== taskId) throw new BadRequestException('该 IP 不属于此任务');
    if (ip.origin !== IpOrigin.TASK) throw new BadRequestException('只能审核任务来源的 IP');
    // 复用 adminApprove 完整流转 (PENDING/REVIEWED → PUBLIC_INTENT)
    const updated = await this.ips.adminApprove(ipId, actorId);
    // 通知创作者
    await this.notifications.create({
      userId: updated.creatorId,
      type: 'IP_PUBLIC',
      title: '任务提交已通过',
      body: `你提交到任务的形象「${updated.displayName}」已通过审核, 进入公示中。`,
      link: `/creator/ips/${updated.id}`,
    });
    return updated;
  }

  /**
   * admin 拒绝任务提交的 IP — 创作者可改后重提 (复用 submitForReview 流程)
   */
  async rejectSubmission(taskId: string, ipId: string, actorId: string, reason: string): Promise<IpAsset> {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('拒绝原因至少 5 字');
    }
    const ip = await this.prisma.ipAsset.findUnique({ where: { id: ipId } });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.taskId !== taskId) throw new BadRequestException('该 IP 不属于此任务');
    if (ip.origin !== IpOrigin.TASK) throw new BadRequestException('只能审核任务来源的 IP');
    const rejected = await this.ips.adminReject(ipId, actorId, reason);
    return rejected;
  }

  // ===================== CREATOR =====================

  /**
   * 创作者可见的任务板 — OPEN 状态, 截止未过
   * 已经接过的任务也带 accept 标记返回
   */
  async listOpenTasks(creatorId: string): Promise<Array<IpTask & {
    acceptedByMe: boolean;
    mySubmissionCount: number;
    acceptedCount: number;
  }>> {
    const tasks = await this.prisma.ipTask.findMany({
      where: {
        status: IpTaskStatus.OPEN,
        deadlineAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        _count: { select: { accepts: true } },
        accepts: { where: { creatorId }, select: { id: true, submittedCount: true } },
      },
    });
    // 每个 task 拉该 creator 已提交的 IP 数
    return Promise.all(tasks.map(async (t) => {
      const mySubs = await this.prisma.ipAsset.count({
        where: { taskId: t.id, creatorId, origin: IpOrigin.TASK },
      });
      return {
        ...t,
        acceptedByMe: t.accepts.length > 0,
        mySubmissionCount: mySubs,
        acceptedCount: t._count.accepts,
      };
    }));
  }

  /**
   * 创作者接单 — 校验 OPEN + 未截止 + 未接 + 未满
   */
  async acceptTask(taskId: string, creatorId: string): Promise<{ taskId: string; creatorId: string; acceptedAt: Date }> {
    // 先查是否已接 — 友好错误, 避免 Prisma unique 异常泄露
    const existing = await this.prisma.ipTaskAccept.findUnique({
      where: { taskId_creatorId: { taskId, creatorId } },
    });
    if (existing) throw new BadRequestException('已接过此任务, 不可重复');
    const task = await this.prisma.ipTask.findUnique({
      where: { id: taskId },
      include: { _count: { select: { accepts: true } } },
    });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status !== IpTaskStatus.OPEN) {
      throw new BadRequestException(`任务当前 ${task.status}, 不可接单`);
    }
    if (task.deadlineAt.getTime() <= Date.now()) {
      throw new BadRequestException('任务已过截止时间');
    }
    if (task._count.accepts >= task.maxAccepts) {
      throw new BadRequestException(`任务已满 (${task._count.accepts}/${task.maxAccepts})`);
    }
    // 重复接单 — 唯一索引会兜底
    const accept = await this.prisma.ipTaskAccept.create({
      data: { taskId, creatorId },
    });
    await this.audit.log({
      actorId: creatorId,
      action: 'TASK_ACCEPTED',
      targetType: 'IpTask',
      targetId: taskId,
    });
    this.logger.log(`creator ${creatorId} accepted task ${taskId}`);
    return { taskId: accept.taskId, creatorId: accept.creatorId, acceptedAt: accept.acceptedAt };
  }

  /**
   * 创作者查看自己接过的任务 (含提交统计)
   */
  async listMyAccepts(creatorId: string): Promise<Array<{
    task: IpTask;
    acceptedAt: Date;
    submittedCount: number;
  }>> {
    const accepts = await this.prisma.ipTaskAccept.findMany({
      where: { creatorId },
      orderBy: { acceptedAt: 'desc' },
      include: { task: true },
    });
    return Promise.all(accepts.map(async (a) => {
      const submittedCount = await this.prisma.ipAsset.count({
        where: { taskId: a.taskId, creatorId, origin: IpOrigin.TASK },
      });
      return { task: a.task, acceptedAt: a.acceptedAt, submittedCount };
    }));
  }

  /**
   * 创作者创建接单 IP — 校验已接, 然后写 origin=TASK + taskId
   * 走 IpsService.create, 在 data 里加 origin + taskId
   */
  async createTaskSubmission(creatorId: string, taskId: string, ipData: {
    displayName: string;
    description: string;
    tagline?: string;
    gender: Gender;
    ageBucket: AgeBucket;
    ethnicity?: Ethnicity;
    styleTags: string[];
    scenarioTags: string[];
    faceTags?: Array<{ category: string; value: string }>;
    depositPriceFen?: number;
    fullLicensePriceFen: number;
  }): Promise<IpAsset> {
    const accept = await this.prisma.ipTaskAccept.findUnique({
      where: { taskId_creatorId: { taskId, creatorId } },
    });
    if (!accept) throw new ForbiddenException('未接此任务, 不可提交');
    const task = await this.prisma.ipTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status !== IpTaskStatus.OPEN) {
      throw new BadRequestException(`任务 ${task.status}, 不接受新提交`);
    }
    if (task.deadlineAt.getTime() <= Date.now()) {
      throw new BadRequestException('任务已过截止时间');
    }
    // 写 IP, origin=TASK + taskId 关联
    const code = await this.ips.generateNextCode();
    const ip = await this.prisma.ipAsset.create({
      data: {
        code,
        creatorId,
        displayName: ipData.displayName,
        tagline: ipData.tagline,
        description: ipData.description,
        gender: ipData.gender,
        ageBucket: ipData.ageBucket,
        ethnicity: ipData.ethnicity ?? null,
        styleTags: ipData.styleTags.join(','),
        scenarioTags: ipData.scenarioTags.join(','),
        faceTags: ipData.faceTags ? (ipData.faceTags as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        depositPriceFen: ipData.depositPriceFen ?? 19900,
        fullLicensePriceFen: ipData.fullLicensePriceFen,
        origin: IpOrigin.TASK,
        taskId,
        previewImageKeys: [],
        thumbnailKey: '',
      },
    });
    // 累计接单提交数
    await this.prisma.ipTaskAccept.update({
      where: { id: accept.id },
      data: { submittedCount: { increment: 1 } },
    });
    await this.audit.log({
      actorId: creatorId,
      action: 'TASK_SUBMISSION_CREATED',
      targetType: 'IpTask',
      targetId: taskId,
      payload: { ipId: ip.id, code: ip.code },
    });
    this.logger.log(`creator ${creatorId} submitted IP ${ip.code} to task ${taskId}`);
    return ip;
  }
}
