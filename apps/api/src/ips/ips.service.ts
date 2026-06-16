import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AssetType, IpAsset, IpStatus, OrderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProofingService } from '../proofing/proofing.service';
import { AuditService } from '../audit/audit.service';
import { UserRole, rolesContains } from '../common/util/roles.util';

const TRANSITIONS: Record<IpStatus, IpStatus[]> = {
  PENDING_REVIEW: ['REVIEWED_PROOFING', 'REJECTED'],
  REVIEWED_PROOFING: ['PUBLIC_INTENT', 'REJECTED'],
  PUBLIC_INTENT: ['OFFICIAL_REGISTERED', 'ARCHIVED'],
  OFFICIAL_REGISTERED: ['ARCHIVED'],
  REJECTED: ['ARCHIVED'],
  ARCHIVED: [],
};

export interface ListFilter {
  gender?: string;
  visualAgeBucket?: string;
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
  gender: string;
  visualAgeBucket: string;
  styleTags: string[];
  scenarioTags: string[];
  depositPriceFen?: number;
  fullLicensePriceFen: number;
}

@Injectable()
export class IpsService {
  private readonly logger = new Logger(IpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly proofing: ProofingService,
    private readonly audit: AuditService,
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
    return this.prisma.ipAsset.create({
      data: {
        code,
        creatorId: params.creatorId,
        displayName: params.displayName,
        tagline: params.tagline,
        description: params.description,
        gender: params.gender,
        visualAgeBucket: params.visualAgeBucket,
        styleTags: params.styleTags.join(','),
        scenarioTags: params.scenarioTags.join(','),
        depositPriceFen: params.depositPriceFen ?? 19900,
        fullLicensePriceFen: params.fullLicensePriceFen,
        previewImageKeys: [],
        thumbnailKey: '',
      },
    });
  }

  async update(id: string, creatorId: string, data: Partial<CreateIpParams>): Promise<IpAsset> {
    const ip = await this.requireById(id);
    if (ip.creatorId !== creatorId) throw new ForbiddenException('无权操作此资产');
    if (ip.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('已提交审核的 IP 不允许修改元数据');
    }
    return this.prisma.ipAsset.update({
      where: { id },
      data: {
        displayName: data.displayName,
        tagline: data.tagline,
        description: data.description,
        gender: data.gender,
        visualAgeBucket: data.visualAgeBucket,
        styleTags: data.styleTags?.join(','),
        scenarioTags: data.scenarioTags?.join(','),
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
    if (filter.visualAgeBucket) where.visualAgeBucket = filter.visualAgeBucket;
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
          visualAgeBucket: true,
          depositPriceFen: true,
          fullLicensePriceFen: true,
          officialCertNo: true,
          blockchainTxId: true,
          status: true,
          publishedAt: true,
        },
      }),
      this.prisma.ipAsset.count({ where }),
    ]);
    return { items, total, page, size };
  }

  async listMine(creatorId: string) {
    return this.prisma.ipAsset.findMany({
      where: { creatorId },
      orderBy: { createdAt: 'desc' },
      include: {
        files: { select: { id: true, assetType: true, validated: true } },
      },
    });
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
    return updated;
  }

  /**
   * 校验资产包完整性 (Visual Matrix + AI Core + Lore)
   */
  async validatePackCompleteness(ipId: string): Promise<{ ok: boolean; missing: AssetType[]; present: AssetType[] }> {
    const files = await this.prisma.ipFile.findMany({
      where: { ipId },
      select: { assetType: true, validated: true },
    });
    // 4 个核心素材必填;LORA/RECIPE/VOICE/PACKAGE 选填 (prompt 与人物小传可替代 LORA 训练出图)
    const required: AssetType[] = [
      AssetType.THREE_VIEW,
      AssetType.EXPRESSION_GRID,
      AssetType.TRANSPARENT_RENDER,
      AssetType.BIO_TXT,
    ];
    const present = Array.from(new Set(files.filter(f => f.validated).map(f => f.assetType)));
    const missing = required.filter(r => !present.includes(r));
    return { ok: missing.length === 0, missing, present };
  }

  /**
   * 提交流程: 校验包完整性 → 计算 hash → 上链 → 转 PUBLIC_INTENT
   */
  async submitForReview(ipId: string, actorId: string): Promise<IpAsset> {
    const ip = await this.requireById(ipId);
    if (ip.creatorId !== actorId) throw new ForbiddenException('无权操作此资产');
    if (ip.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(`当前状态 ${ip.status} 不允许提交`);
    }
    const completeness = await this.validatePackCompleteness(ipId);
    if (!completeness.ok) {
      throw new BadRequestException(
        `资产包不完整,缺失: ${completeness.missing.join(', ')}`,
      );
    }
    // 转 REVIEWED_PROOFING
    const reviewed = await this.transitionStatus(ip, 'REVIEWED_PROOFING', actorId);
    // 计算 hash 并上链
    const proof = await this.proofing.proofIp(ipId);
    // 转 PUBLIC_INTENT
    return this.transitionStatus(reviewed, 'PUBLIC_INTENT', actorId, {
      blockchainHash: proof.payloadHash,
      blockchainTxId: proof.txId,
      blockchainNetwork: proof.network,
      proofTimestamp: proof.submittedAt,
    });
  }

  async adminApprove(ipId: string, actorId: string): Promise<IpAsset> {
    const ip = await this.requireById(ipId);
    if (ip.status !== 'PENDING_REVIEW' && ip.status !== 'REVIEWED_PROOFING') {
      throw new BadRequestException(`当前状态 ${ip.status} 不允许审核`);
    }
    if (ip.status === 'PENDING_REVIEW') {
      const reviewed = await this.transitionStatus(ip, 'REVIEWED_PROOFING', actorId);
      const proof = await this.proofing.proofIp(ipId);
      return this.transitionStatus(reviewed, 'PUBLIC_INTENT', actorId, {
        blockchainHash: proof.payloadHash,
        blockchainTxId: proof.txId,
        blockchainNetwork: proof.network,
        proofTimestamp: proof.submittedAt,
      });
    }
    return this.transitionStatus(ip, 'PUBLIC_INTENT', actorId);
  }

  async adminReject(ipId: string, actorId: string, reason: string): Promise<IpAsset> {
    const ip = await this.requireById(ipId);
    return this.transitionStatus(ip, 'REJECTED', actorId, { rejectionReason: reason });
  }

  async adminRegisterCert(ipId: string, actorId: string, certNo: string): Promise<IpAsset> {
    const ip = await this.requireById(ipId);
    if (ip.status !== 'PUBLIC_INTENT') {
      throw new BadRequestException('仅 PUBLIC_INTENT 状态可登记版权');
    }
    return this.transitionStatus(ip, 'OFFICIAL_REGISTERED', actorId, {
      officialCertNo: certNo,
    });
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
      })),
      availableTiers: {
        depositPriceFen: ip.depositPriceFen,
        fullLicensePriceFen: ip.fullLicensePriceFen,
        licenseScopes: ['SINGLE_DRAMA', 'THREE_YEAR_WEB', 'BUYOUT_EXCLUSIVE'] as const,
      },
    };
  }
}