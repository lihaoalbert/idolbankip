import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AgeBucket, AssetType, Ethnicity, Gender, HonorAction, IpAsset, IpStatus, OrderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProofingService } from '../proofing/proofing.service';
import { AuditService } from '../audit/audit.service';
import { UserRole, rolesContains } from '../common/util/roles.util';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadService } from '../upload/upload.service';
import { HonorService } from '../honor/honor.service';

const TRANSITIONS: Record<IpStatus, IpStatus[]> = {
  PENDING_REVIEW: ['REVIEWED_PROOFING', 'REJECTED'],
  REVIEWED_PROOFING: ['PUBLIC_INTENT', 'REJECTED'],
  PUBLIC_INTENT: ['OFFICIAL_REGISTERED', 'ARCHIVED'],
  OFFICIAL_REGISTERED: ['ARCHIVED'],
  // 创作者被拒后可改 → 重提 (走 PENDING_REVIEW → 正常 submitForReview 流程)
  REJECTED: ['ARCHIVED', 'PENDING_REVIEW'],
  ARCHIVED: [],
};

// #32 标签体系常量 — 用于覆盖度网格枚举
export const GENDER_VALUES: Gender[] = [Gender.MALE, Gender.FEMALE, Gender.NONBINARY];
export const AGE_BUCKET_VALUES: AgeBucket[] = [AgeBucket.CHILD, AgeBucket.YOUNG, AgeBucket.MIDDLE, AgeBucket.ELDERLY];
export const ETHNICITY_VALUES: Ethnicity[] = [
  Ethnicity.EAST_ASIAN, Ethnicity.SOUTHEAST_ASIAN, Ethnicity.SOUTH_ASIAN,
  Ethnicity.AFRICAN, Ethnicity.EUROPEAN, Ethnicity.MIXED,
];

// FaceTag 允许的 category — 后续若扩 enum, 在此追加
export const FACE_TAG_CATEGORIES = [
  'FaceShape', 'SkinTone', 'HairStyle', 'HairColor', 'EyeShape', 'Vibe',
] as const;

export interface ListFilter {
  gender?: Gender;
  ageBucket?: AgeBucket;
  ethnicity?: Ethnicity;
  style?: string;
  scenario?: string;
  status?: IpStatus;
  page?: number;
  size?: number;
  sort?: 'newest' | 'popular';
}

export interface CreateIpParams {
  creatorId: string;
  displayName: string;
  tagline?: string;
  description: string;
  gender: Gender;
  ageBucket: AgeBucket;
  ethnicity?: Ethnicity;
  styleTags: string[];
  scenarioTags: string[];
  faceTags?: Array<{ category: string; value: string }>;
  depositPriceFen?: number;
  fullLicensePriceFen: number;
  // #30 接单任务: 创作者从任务板进入 wizard 时携带, 写 origin=TASK + 关联 taskId
  taskId?: string;
}

@Injectable()
export class IpsService {
  private readonly logger = new Logger(IpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly proofing: ProofingService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly upload: UploadService,
    private readonly honor: HonorService,
  ) {}

  generateNextCode(): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.ipAsset.findFirst({
        orderBy: { code: 'desc' },
        where: { code: { startsWith: 'IBI-' } },
      });
      const nextNum = last ? parseInt(last.code.split('-')[2], 10) + 1 : 1;
      return `IBI-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;
    });
  }

  async create(params: CreateIpParams): Promise<IpAsset> {
    const code = await this.generateNextCode();
    // #30 接单任务: 校验已接 + 任务 OPEN + 未截止 (双保险, 创作者端 controller 也校验)
    if (params.taskId) {
      const accept = await this.prisma.ipTaskAccept.findUnique({
        where: { taskId_creatorId: { taskId: params.taskId, creatorId: params.creatorId } },
      });
      if (!accept) throw new ForbiddenException('未接此任务, 不可提交');
      const task = await this.prisma.ipTask.findUnique({ where: { id: params.taskId } });
      if (!task) throw new NotFoundException('任务不存在');
      if (task.status !== 'OPEN' || task.deadlineAt.getTime() <= Date.now()) {
        throw new BadRequestException(`任务 ${task.status}, 不接受新提交`);
      }
    }
    return this.prisma.ipAsset.create({
      data: {
        code,
        creatorId: params.creatorId,
        displayName: params.displayName,
        tagline: params.tagline,
        description: params.description,
        gender: params.gender,
        ageBucket: params.ageBucket,
        ethnicity: params.ethnicity ?? null,
        styleTags: params.styleTags.join(','),
        scenarioTags: params.scenarioTags.join(','),
        faceTags: params.faceTags ? (params.faceTags as any) : undefined,
        depositPriceFen: params.depositPriceFen ?? 19900,
        fullLicensePriceFen: params.fullLicensePriceFen,
        // #30 接单关联
        origin: params.taskId ? 'TASK' : 'SELF',
        taskId: params.taskId ?? null,
        previewImageKeys: [],
        thumbnailKey: '',
      },
    });
  }

  async update(id: string, creatorId: string, data: Partial<CreateIpParams>): Promise<IpAsset> {
    const ip = await this.requireById(id);
    if (ip.creatorId !== creatorId) throw new ForbiddenException('无权操作此资产');
    // REJECTED 时也允许改 (创作者要重提) — 见 [[project-post-mvp-backlog]] #16
    if (ip.status !== 'PENDING_REVIEW' && ip.status !== 'REJECTED') {
      throw new BadRequestException(`当前状态 ${ip.status} 不允许修改元数据`);
    }
    return this.prisma.ipAsset.update({
      where: { id },
      data: {
        displayName: data.displayName,
        tagline: data.tagline,
        description: data.description,
        gender: data.gender,
        ageBucket: data.ageBucket,
        ethnicity: data.ethnicity,
        styleTags: data.styleTags?.join(','),
        scenarioTags: data.scenarioTags?.join(','),
        faceTags: data.faceTags ? (data.faceTags as any) : undefined,
        depositPriceFen: data.depositPriceFen,
        fullLicensePriceFen: data.fullLicensePriceFen,
      },
    });
  }

  async findById(id: string): Promise<IpAsset | null> {
    return this.prisma.ipAsset.findUnique({ where: { id } });
  }

  async requireById(id: string): Promise<IpAsset> {
    const ip = await this.findById(id);
    if (!ip) throw new NotFoundException('IP 不存在');
    return ip;
  }

  async findByCode(code: string): Promise<IpAsset | null> {
    return this.prisma.ipAsset.findUnique({ where: { code } });
  }

  async requireByCode(code: string): Promise<IpAsset> {
    const ip = await this.findByCode(code);
    if (!ip) throw new NotFoundException('IP 不存在');
    return ip;
  }

  async listPublic(filter: ListFilter) {
    const page = Math.max(1, filter.page ?? 1);
    const size = Math.min(100, Math.max(1, filter.size ?? 24));
    const where: any = {
      status: filter.status ?? 'PUBLIC_INTENT',
    };
    if (filter.gender) where.gender = filter.gender;
    if (filter.ageBucket) where.ageBucket = filter.ageBucket;
    if (filter.ethnicity) where.ethnicity = filter.ethnicity;
    if (filter.style) where.styleTags = { contains: filter.style };
    if (filter.scenario) where.scenarioTags = { contains: filter.scenario };

    const [items, total] = await Promise.all([
      this.prisma.ipAsset.findMany({
        where,
        orderBy: filter.sort === 'popular' ? { publishedAt: 'desc' } : { publishedAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        select: {
          id: true,
          code: true,
          displayName: true,
          tagline: true,
          thumbnailKey: true,
          styleTags: true,
          scenarioTags: true,
          gender: true,
          ageBucket: true,
          ethnicity: true,
          faceTags: true,
          depositPriceFen: true,
          fullLicensePriceFen: true,
          officialCertNo: true,
          blockchainTxId: true,
          status: true,
          publishedAt: true,
          faceCloseupFileId: true, // #31
        },
      }),
      this.prisma.ipAsset.count({ where }),
    ]);
    return { items, total, page, size };
  }

  async listMine(creatorId: string) {
    // BigInt sizeBytes → string, 见 [[feedback-prisma-bigint-serialization]]
    const items = await this.prisma.ipAsset.findMany({
      where: { creatorId },
      orderBy: { createdAt: 'desc' },
      include: {
        files: { select: { id: true, assetType: true, validated: true, sizeBytes: true } },
      },
    });
    return items.map((ip) => ({
      ...ip,
      files: ip.files.map((f) => ({ ...f, sizeBytes: f.sizeBytes.toString() })),
    }));
  }

  /**
   * #33 创作者查看自己 IP 的全部 PROCESS_EVIDENCE (description + processStep 完整)
   * 鉴权: 必须是自己 IP, 否则 404
   */
  async listProcessEvidence(ipId: string, creatorId: string): Promise<{
    items: Array<{ id: string; originalName: string; sizeBytes: string; description: string | null; processStep: string | null; uploadedAt: Date }>;
    totalBytes: number;
    maxBytes: number;
  }> {
    const ip = await this.findById(ipId);
    if (!ip || ip.creatorId !== creatorId) throw new NotFoundException('IP 不存在');
    const files = await this.prisma.ipFile.findMany({
      where: { ipId, assetType: 'PROCESS_EVIDENCE' },
      orderBy: { uploadedAt: 'desc' },
    });
    const totalBytes = files.reduce((s, f) => s + Number(f.sizeBytes), 0);
    // 与 upload.service 保持一致: 600MB 上限 (避免硬编码重复, 这里直接 import)
    const { PROCESS_EVIDENCE_TOTAL_MAX_BYTES } = await import('../upload/upload.service');
    return {
      items: files.map((f) => ({
        id: f.id,
        originalName: f.originalName,
        sizeBytes: f.sizeBytes.toString(),
        description: f.description,
        processStep: f.processStep,
        uploadedAt: f.uploadedAt,
      })),
      totalBytes,
      maxBytes: PROCESS_EVIDENCE_TOTAL_MAX_BYTES,
    };
  }

  /**
   * #33 删除单条创作证据 — 释放累计空间
   * 鉴权: 必须是自己 IP 的 PROCESS_EVIDENCE, 否则 404
   * OSS 删除失败不阻塞 DB 清理 (warn-only, 见 upload.deleteOssObject)
   */
  async deleteProcessEvidence(ipId: string, fileId: string, creatorId: string): Promise<{ deleted: true; remainingBytes: number }> {
    const ip = await this.findById(ipId);
    if (!ip || ip.creatorId !== creatorId) throw new NotFoundException('IP 不存在');
    const file = await this.prisma.ipFile.findUnique({ where: { id: fileId } });
    if (!file || file.ipId !== ipId || file.assetType !== 'PROCESS_EVIDENCE') {
      throw new NotFoundException('证据文件不存在');
    }
    // OSS 先删 (失败不抛, 至少 DB 行得清掉)
    await this.upload.deleteOssObject(file.ossKey);
    // DB 删
    await this.prisma.ipFile.delete({ where: { id: fileId } });
    // 重新算累计
    const agg = await this.prisma.ipFile.aggregate({
      where: { ipId, assetType: 'PROCESS_EVIDENCE' },
      _sum: { sizeBytes: true },
    });
    this.logger.log(`PROCESS_EVIDENCE deleted: ip=${ip.code} file=${fileId} (${this.fmtSize(Number(file.sizeBytes))})`);
    return { deleted: true, remainingBytes: Number(agg._sum.sizeBytes ?? 0n) };
  }

  private fmtSize(b: number): string {
    if (b < 1024) return `${b}B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(0)}MB`;
    return `${(b / 1024 / 1024 / 1024).toFixed(1)}GB`;
  }

  async transitionStatus(ip: IpAsset, next: IpStatus, actorId?: string, payload?: any): Promise<IpAsset> {
    const allowed = TRANSITIONS[ip.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`非法状态流转: ${ip.status} → ${next}`);
    }
    const updated = await this.prisma.ipAsset.update({
      where: { id: ip.id },
      data: {
        status: next,
        ...(next === 'PUBLIC_INTENT' && !ip.publishedAt ? { publishedAt: new Date() } : {}),
        ...(next === 'OFFICIAL_REGISTERED' && !ip.officialAt ? { officialAt: new Date() } : {}),
        ...(payload ?? {}),
      },
    });
    await this.audit.log({
      actorId,
      action: `IP_TRANSITION_${next}`,
      targetType: 'IpAsset',
      targetId: ip.id,
      payload: { from: ip.status, to: next },
    });

    // 荣誉流水 — 状态流转触发奖励 (发奖 / 通过 / 拒绝)
    // IP_PUBLISH (PUBLIC_INTENT) +200, IP_APPROVED (OFFICIAL_REGISTERED) +500, IP_REJECTED -100
    const honorAction =
      next === 'PUBLIC_INTENT' ? HonorAction.IP_PUBLISH
      : next === 'OFFICIAL_REGISTERED' ? HonorAction.IP_APPROVED
      : next === 'REJECTED' ? HonorAction.IP_REJECTED
      : null;
    if (honorAction) {
      this.honor.record(ip.creatorId, honorAction, {
        refType: 'IpAsset',
        refId: ip.id,
        metadata: { ipCode: ip.code, from: ip.status, to: next },
      }).catch((e) =>
        this.logger.warn(`honor record (${honorAction}) failed: ${e?.message ?? e}`),
      );
    }

    return updated;
  }

  /**
   * 校验资产包完整性 (Visual Matrix + AI Core + Lore + 版权证据)
   */
  async validatePackCompleteness(ipId: string): Promise<{ ok: boolean; missing: AssetType[]; present: AssetType[] }> {
    const files = await this.prisma.ipFile.findMany({
      where: { ipId },
      select: { assetType: true, validated: true },
    });
    // 5 个核心素材必填;LORA/RECIPE/VOICE/PACKAGE 选填 (prompt 与人物小传可替代 LORA 训练出图)
    // FACE_CLOSEUP 是版权登记证据,无它不能 submitForReview (见 #31)
    const required: AssetType[] = [
      AssetType.THREE_VIEW,
      AssetType.EXPRESSION_GRID,
      AssetType.TRANSPARENT_RENDER,
      AssetType.BIO_TXT,
      AssetType.FACE_CLOSEUP,
    ];
    const present = Array.from(new Set(files.filter(f => f.validated).map(f => f.assetType)));
    const missing = required.filter(r => !present.includes(r));
    return { ok: missing.length === 0, missing, present };
  }

  /**
   * 提交流程: 校验包完整性 → 计算 hash → 上链 → 转 PUBLIC_INTENT
   * REJECTED 时也允许重提 (走 PENDING_REVIEW 中转,清空上次的 rejectionReason)
   *
   * 顺序关键: 先 validatePackCompleteness, 再 REJECTED→PENDING_REVIEW。
   * 不然完整性校验失败时, IP 已经被错误地移到 PENDING_REVIEW (但 creator 没真提成功)。
   */
  async submitForReview(ipId: string, actorId: string): Promise<IpAsset> {
    const ip = await this.requireById(ipId);
    if (ip.creatorId !== actorId) throw new ForbiddenException('无权操作此资产');
    if (ip.status !== 'PENDING_REVIEW' && ip.status !== 'REJECTED') {
      throw new BadRequestException(`当前状态 ${ip.status} 不允许提交`);
    }
    // 1) 完整性校验 (先看 files,跟 status 无关)
    const completeness = await this.validatePackCompleteness(ipId);
    if (!completeness.ok) {
      throw new BadRequestException(
        `资产包不完整,缺失: ${completeness.missing.join(', ')}`,
      );
    }
    // 2) REJECTED → 先回到 PENDING_REVIEW (清空旧拒绝原因)
    let draft = ip;
    if (ip.status === 'REJECTED') {
      draft = await this.transitionStatus(ip, 'PENDING_REVIEW', actorId, { rejectionReason: null });
    }
    // 3) 转 REVIEWED_PROOFING
    const reviewed = await this.transitionStatus(draft, 'REVIEWED_PROOFING', actorId);
    // 4) 计算 hash 并上链
    const proof = await this.proofing.proofIp(ipId);
    // 5) 转 PUBLIC_INTENT
    const publicIp = await this.transitionStatus(reviewed, 'PUBLIC_INTENT', actorId, {
      blockchainHash: proof.payloadHash,
      blockchainTxId: proof.txId,
      blockchainNetwork: proof.network,
      proofTimestamp: proof.submittedAt,
    });
    await this.notifications.create({
      userId: actorId,
      type: 'IP_PUBLIC',
      title: '资产已上架',
      body: `${publicIp.displayName} 已通过审核并公开,可在形象库展示。`,
      link: `/creator/ips/${publicIp.id}`,
    });
    return publicIp;
  }

  async adminApprove(ipId: string, actorId: string): Promise<IpAsset> {
    const ip = await this.requireById(ipId);
    if (ip.status !== 'PENDING_REVIEW' && ip.status !== 'REVIEWED_PROOFING') {
      throw new BadRequestException(`当前状态 ${ip.status} 不允许审核`);
    }
    let publicIp: IpAsset;
    if (ip.status === 'PENDING_REVIEW') {
      const reviewed = await this.transitionStatus(ip, 'REVIEWED_PROOFING', actorId);
      const proof = await this.proofing.proofIp(ipId);
      publicIp = await this.transitionStatus(reviewed, 'PUBLIC_INTENT', actorId, {
        blockchainHash: proof.payloadHash,
        blockchainTxId: proof.txId,
        blockchainNetwork: proof.network,
        proofTimestamp: proof.submittedAt,
      });
    } else {
      publicIp = await this.transitionStatus(ip, 'PUBLIC_INTENT', actorId);
    }
    await this.notifications.create({
      userId: publicIp.creatorId,
      type: 'IP_PUBLIC',
      title: '资产已上架',
      body: `${publicIp.displayName} 已通过审核并公开,可在形象库展示。`,
      link: `/creator/ips/${publicIp.id}`,
    });
    return publicIp;
  }

  async adminReject(ipId: string, actorId: string, reason: string): Promise<IpAsset> {
    const ip = await this.requireById(ipId);
    const rejected = await this.transitionStatus(ip, 'REJECTED', actorId, { rejectionReason: reason });
    await this.notifications.create({
      userId: rejected.creatorId,
      type: 'IP_REJECTED',
      title: '资产审核未通过',
      body: `${rejected.displayName}: ${reason}。请修改后重新提交。`,
      link: `/creator/ips/${rejected.id}`,
    });
    return rejected;
  }

  async adminRegisterCert(ipId: string, actorId: string, certNo: string): Promise<IpAsset> {
    const ip = await this.requireById(ipId);
    if (ip.status !== 'PUBLIC_INTENT') {
      throw new BadRequestException('仅 PUBLIC_INTENT 状态可登记版权');
    }
    const registered = await this.transitionStatus(ip, 'OFFICIAL_REGISTERED', actorId, {
      officialCertNo: certNo,
    });
    await this.notifications.create({
      userId: registered.creatorId,
      type: 'IP_REGISTERED',
      title: '版权已登记',
      body: `${registered.displayName} 已登记版权 (证书号 ${certNo}),买家可正式下单。`,
      link: `/creator/ips/${registered.id}`,
    });
    return registered;
  }

  /**
   * 批量提交审核 — 创作者 dashboard 用 (#23)。
   * 顺序串行处理,任一失败立即停止 (避免部分提交部分失败的状态混乱)。
   * 每步复用 submitForReview (已含完整性校验 + 链上 + 通知 + 状态流转)。
   * 返回首个失败 ID + 原因。
   */
  async bulkSubmit(ids: string[], creatorId: string): Promise<{ submitted: string[]; failed: { id: string; reason: string } | null }> {
    if (ids.length === 0) return { submitted: [], failed: null };
    if (ids.length > 50) throw new BadRequestException('单次最多 50 个');
    const submitted: string[] = [];
    for (const id of ids) {
      const ip = await this.prisma.ipAsset.findUnique({ where: { id }, select: { creatorId: true } });
      if (!ip || ip.creatorId !== creatorId) {
        return { submitted, failed: { id, reason: '无权操作此资产' } };
      }
      try {
        await this.submitForReview(id, creatorId);
        submitted.push(id);
      } catch (e: any) {
        return { submitted, failed: { id, reason: e?.message || '提交失败' } };
      }
    }
    return { submitted, failed: null };
  }

  /**
   * 批量归档 — 仅 REJECTED → ARCHIVED 可由创作者触发 (PENDING_REVIEW 走正常重提流程)。
   * 同样顺序串行,首个失败停。
   */
  async bulkArchive(ids: string[], creatorId: string): Promise<{ archived: string[]; failed: { id: string; reason: string } | null }> {
    if (ids.length === 0) return { archived: [], failed: null };
    if (ids.length > 50) throw new BadRequestException('单次最多 50 个');
    const archived: string[] = [];
    for (const id of ids) {
      const ip = await this.requireById(id);
      if (ip.creatorId !== creatorId) {
        return { archived, failed: { id, reason: '无权操作此资产' } };
      }
      if (!TRANSITIONS[ip.status]?.includes('ARCHIVED')) {
        return { archived, failed: { id, reason: `当前状态 ${ip.status} 不允许归档` } };
      }
      await this.transitionStatus(ip, 'ARCHIVED', creatorId);
      archived.push(id);
    }
    return { archived, failed: null };
  }

  async adminGetDetail(id: string) {
    const ip = await this.requireById(id);
    const files = await this.prisma.ipFile.findMany({
      where: { ipId: ip.id },
      orderBy: { assetType: 'asc' },
    });
    const creator = await this.prisma.user.findUnique({
      where: { id: ip.creatorId },
      select: { id: true, email: true, displayName: true, roles: true, kycStatus: true },
    });
    return {
      ip,
      files: files.map((f) => ({
        ...f,
        sizeBytes: f.sizeBytes.toString(),
      })),
      creator,
    };
  }

  async adminStats() {
    const [totalIps, statusGroups, totalUsers, creators, buyers, pendingKyc, paidOrders, unlockedOrders, gmvAgg] = await Promise.all([
      this.prisma.ipAsset.count(),
      this.prisma.ipAsset.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { roles: rolesContains(UserRole.CREATOR) } }),
      this.prisma.user.count({ where: { roles: rolesContains(UserRole.BUYER) } }),
      this.prisma.user.count({ where: { kycStatus: 'PENDING' } }),
      this.prisma.order.count({ where: { status: { in: ['PAID', 'CONTRACT_PENDING', 'CONTRACT_SIGNED', 'DOWNLOAD_UNLOCKED', 'DELIVERED'] } } }),
      this.prisma.order.count({ where: { status: { in: ['DOWNLOAD_UNLOCKED', 'DELIVERED'] } } }),
      this.prisma.order.aggregate({ where: { paidAt: { not: null } }, _sum: { amountFen: true } }),
    ]);
    const statusMap: Record<string, number> = {};
    for (const g of statusGroups) statusMap[g.status] = g._count._all;
    return {
      totalIps,
      pendingReview: statusMap.PENDING_REVIEW || 0,
      proofing: statusMap.REVIEWED_PROOFING || 0,
      publicIntent: statusMap.PUBLIC_INTENT || 0,
      official: statusMap.OFFICIAL_REGISTERED || 0,
      rejected: statusMap.REJECTED || 0,
      archived: statusMap.ARCHIVED || 0,
      totalUsers,
      totalCreators: creators,
      totalBuyers: buyers,
      pendingKyc,
      totalOrders: await this.prisma.order.count(),
      paidOrders,
      unlockedOrders,
      gmvFen: gmvAgg._sum.amountFen || 0,
    };
  }

  async adminListUsers(page = 1, size = 50) {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
      select: {
        id: true, email: true, displayName: true, roles: true,
        kycStatus: true, companyName: true, createdAt: true,
      },
    });
  }

  async adminListAllOrders(filter: { status?: string } = {}) {
    return this.prisma.order.findMany({
      where: filter.status ? { status: filter.status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        ip: { select: { id: true, code: true, displayName: true } },
        buyer: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  /**
   * 后台审核队列 — 返回 IP + 创作者 + 文件,按状态过滤(不传则全量)
   */
  async adminListIps(status?: IpStatus) {
    return this.prisma.ipAsset.findMany({
      where: status ? { status } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        creator: { select: { id: true, email: true, displayName: true, roles: true, kycStatus: true } },
        files: { select: { id: true, assetType: true, validated: true } },
      },
    });
  }

  async getDetail(code: string) {
    const ip = await this.requireByCode(code);
    if (ip.status === 'PENDING_REVIEW' || ip.status === 'REJECTED' || ip.status === 'ARCHIVED') {
      throw new NotFoundException('该 IP 暂不可见');
    }
    const files = await this.prisma.ipFile.findMany({
      where: { ipId: ip.id },
      orderBy: { assetType: 'asc' },
    });
    return {
      ip,
      files: files.map(f => ({
        id: f.id,
        assetType: f.assetType,
        displayName: f.originalName,
        sizeBytes: f.sizeBytes.toString(),
        mimeType: f.mimeType,
        previewOnly: ip.status !== 'OFFICIAL_REGISTERED' || true, // B 端始终是 preview
        isFaceCloseup: f.id === ip.faceCloseupFileId, // #31 — UI 可用这个高亮版权图
        // #33 创作过程证据专用元数据
        description: f.description,
        processStep: f.processStep,
        uploadedAt: f.uploadedAt,
      })),
      availableTiers: {
        depositPriceFen: ip.depositPriceFen,
        fullLicensePriceFen: ip.fullLicensePriceFen,
        licenseScopes: ['SINGLE_DRAMA', 'THREE_YEAR_WEB', 'BUYOUT_EXCLUSIVE'] as const,
      },
    };
  }

  // #32 形象库覆盖度 — gender × ageBucket × ethnicity 网格 (4×3×6=72 格)
  // 仅统计公开可售 IP (PUBLIC_INTENT + OFFICIAL_REGISTERED)
  // 60s in-memory cache (admin dashboard 用, 不需要 Redis)
  private coverageCache: { at: number; data: any } | null = null;
  private static COVERAGE_TTL_MS = 60_000;

  async libraryCoverage() {
    const now = Date.now();
    if (this.coverageCache && now - this.coverageCache.at < IpsService.COVERAGE_TTL_MS) {
      return this.coverageCache.data;
    }
    const rows = await this.prisma.ipAsset.groupBy({
      by: ['gender', 'ageBucket', 'ethnicity'],
      where: { status: { in: ['PUBLIC_INTENT', 'OFFICIAL_REGISTERED'] } },
      _count: { _all: true },
    });

    // 构建完整网格 (72 格, count=0 也填上, 便于前端 3D 可视化)
    const filledMap = new Map<string, number>();
    for (const r of rows) {
      filledMap.set(`${r.gender}|${r.ageBucket}|${r.ethnicity ?? 'NULL'}`, r._count._all);
    }
    const totalCells = GENDER_VALUES.length * AGE_BUCKET_VALUES.length * ETHNICITY_VALUES.length;
    let filledCells = 0;
    const heatmap: Array<{ gender: Gender; ageBucket: AgeBucket; ethnicity: Ethnicity | null; count: number }> = [];
    for (const g of GENDER_VALUES) {
      for (const a of AGE_BUCKET_VALUES) {
        for (const e of ETHNICITY_VALUES) {
          const c = filledMap.get(`${g}|${a}|${e}`) ?? 0;
          if (c > 0) filledCells++;
          heatmap.push({ gender: g, ageBucket: a, ethnicity: e, count: c });
        }
      }
    }

    // 子分 (by gender / by ageBucket / by ethnicity): 同时返回 单元格覆盖度 + IP 总数
    const ipCountByGender: Record<string, number> = { FEMALE: 0, MALE: 0, NONBINARY: 0 };
    const ipCountByAge: Record<string, number> = { CHILD: 0, YOUNG: 0, MIDDLE: 0, ELDERLY: 0 };
    const ipCountByEth: Record<string, number> = { EAST_ASIAN: 0, SOUTHEAST_ASIAN: 0, SOUTH_ASIAN: 0, AFRICAN: 0, EUROPEAN: 0, MIXED: 0 };
    for (const r of rows) {
      if (r.gender) ipCountByGender[r.gender] = (ipCountByGender[r.gender] || 0) + r._count._all;
      if (r.ageBucket) ipCountByAge[r.ageBucket] = (ipCountByAge[r.ageBucket] || 0) + r._count._all;
      if (r.ethnicity) ipCountByEth[r.ethnicity] = (ipCountByEth[r.ethnicity] || 0) + r._count._all;
    }
    const byGender: Record<string, { count: number; filledCells: number; totalCells: number }> = {};
    for (const g of GENDER_VALUES) {
      byGender[g] = {
        count: ipCountByGender[g] || 0,
        filledCells: heatmap.filter((h) => h.gender === g && h.count > 0).length,
        totalCells: AGE_BUCKET_VALUES.length * ETHNICITY_VALUES.length,
      };
    }
    const byAgeBucket: Record<string, { count: number; filledCells: number; totalCells: number }> = {};
    for (const a of AGE_BUCKET_VALUES) {
      byAgeBucket[a] = {
        count: ipCountByAge[a] || 0,
        filledCells: heatmap.filter((h) => h.ageBucket === a && h.count > 0).length,
        totalCells: GENDER_VALUES.length * ETHNICITY_VALUES.length,
      };
    }
    const byEthnicity: Record<string, { count: number; filledCells: number; totalCells: number }> = {};
    for (const e of ETHNICITY_VALUES) {
      byEthnicity[e] = {
        count: ipCountByEth[e] || 0,
        filledCells: heatmap.filter((h) => h.ethnicity === e && h.count > 0).length,
        totalCells: GENDER_VALUES.length * AGE_BUCKET_VALUES.length,
      };
    }

    const totalIps = await this.prisma.ipAsset.count({
      where: { status: { in: ['PUBLIC_INTENT', 'OFFICIAL_REGISTERED'] } },
    });
    const missingEthnicityCount = await this.prisma.ipAsset.count({
      where: { status: { in: ['PUBLIC_INTENT', 'OFFICIAL_REGISTERED'] }, ethnicity: null },
    });

    const data = {
      grid: {
        genders: GENDER_VALUES,
        ageBuckets: AGE_BUCKET_VALUES,
        ethnicities: ETHNICITY_VALUES,
        totalCells,
        filledCells,
        coveragePct: Math.round((filledCells / totalCells) * 1000) / 10, // 一位小数
      },
      totalIps,
      missingEthnicityCount,
      byGender,
      byAgeBucket,
      byEthnicity,
      heatmap,
      cachedAt: new Date().toISOString(),
    };
    this.coverageCache = { at: now, data };
    return data;
  }
}