import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CopyrightRegistration,
  Prisma,
  RegistrationStage,
  RegistrationType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { CopyrightFeeResolver } from './copyright-fee.resolver';
import { CopyrightPdfBuilder } from './copyright-pdf.builder';
import { UploadService } from '../upload/upload.service';
import { DraftRegistrationDto } from './dto/draft-registration.dto';

/**
 * 状态机 (TRANSITIONS) — 直接套用现有 RegistrationStage enum,所有合法迁移在这里定义.
 * 用 updateMany({ where: { workflowStage: FROM } }) 防止 admin 双开 race.
 */
const TRANSITIONS: Record<RegistrationStage, RegistrationStage[]> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['ACCEPTED', 'WITHDRAWN'],
  ACCEPTED: ['UNDER_REVIEW', 'CERTIFIED', 'REJECTED'],
  UNDER_REVIEW: ['CERTIFIED', 'REJECTED'],
  CERTIFIED: [],
  REJECTED: ['DRAFT'],
  WITHDRAWN: ['DRAFT'],
};

@Injectable()
export class CopyrightService {
  private readonly logger = new Logger(CopyrightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly feeResolver: CopyrightFeeResolver,
    private readonly pdfBuilder: CopyrightPdfBuilder,
    private readonly upload: UploadService,
  ) {}

  // ============================================================
  //  Creator 端
  // ============================================================

  /**
   * 创作者获取当前 IP 的著作权登记状态. 不存在则返回 stage='NONE'.
   */
  async getForCreator(ipId: string, userId: string): Promise<{
    registration: CopyrightRegistration | null;
    feeFen: number;
    feeSnapshot: number | null;
    canApply: boolean;
    canSubmit: boolean;
    canWithdraw: boolean;
  }> {
    const ip = await this.prisma.ipAsset.findUnique({
      where: { id: ipId },
      include: { registration: true },
    });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== userId) throw new ForbiddenException('无权操作此 IP');

    const reg = ip.registration;
    const stage = reg?.workflowStage ?? 'NONE';
    const canApply = !reg && ['PUBLIC_INTENT', 'OFFICIAL_REGISTERED'].includes(ip.status);
    const canSubmit = stage === 'DRAFT';
    const canWithdraw =
      stage === 'DRAFT' || stage === 'SUBMITTED' || stage === 'ACCEPTED' || stage === 'UNDER_REVIEW';

    let feeFen = 0;
    let feeSnapshot: number | null = null;
    if (reg) {
      feeSnapshot = reg.creatorAgentFeeFen;
    } else if (canApply) {
      // 申请前需要先选 level/region 才知道 fee;前端从 /copyright-fee-config 拿
    }

    return {
      registration: reg,
      feeFen,
      feeSnapshot,
      canApply,
      canSubmit,
      canWithdraw,
    };
  }

  /**
   * 创作者创建/更新 DRAFT — upsert. 任意阶段都可以修改? 不,
   * 只有 DRAFT / REJECTED / WITHDRAWN 允许编辑.
   */
  async upsertDraft(
    ipId: string,
    userId: string,
    dto: DraftRegistrationDto,
  ): Promise<CopyrightRegistration> {
    const ip = await this.prisma.ipAsset.findUnique({
      where: { id: ipId },
      include: { registration: true },
    });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== userId) throw new ForbiddenException('无权操作此 IP');

    if (ip.status !== 'PUBLIC_INTENT' && ip.status !== 'OFFICIAL_REGISTERED') {
      throw new BadRequestException(
        `IP 当前状态 ${ip.status} 不允许申请著作权 (需 PUBLIC_INTENT / OFFICIAL_REGISTERED)`,
      );
    }

    const existing = ip.registration;
    if (existing && !['DRAFT', 'REJECTED', 'WITHDRAWN'].includes(existing.workflowStage)) {
      throw new BadRequestException(
        `当前阶段 ${existing.workflowStage} 不允许编辑著作权人信息`,
      );
    }

    // region 必填校验
    if (dto.registrationType === 'PROVINCIAL' && !dto.registrationRegion) {
      throw new BadRequestException('PROVINCIAL 级别必须填写备案省份');
    }

    const data: Prisma.CopyrightRegistrationUncheckedCreateInput = {
      ipId,
      ownerName: dto.ownerName,
      ownerType: dto.ownerType,
      ownerIdNumber: dto.ownerIdNumber ?? dto.ownerIdNumberCompany ?? null,
      registrationType: dto.registrationType,
      registrationRegion: dto.registrationRegion ?? '',
      // 重新进入 DRAFT 时,清掉历史 application/certificate/rejection
      workflowStage: 'DRAFT',
      submittedAt: null,
      acceptedAt: null,
      reviewedAt: null,
      certifiedAt: null,
      withdrawnAt: null,
      applicationNo: null,
      certificateNo: null,
      rejectionReason: null,
      creatorAgentRequestedAt: existing?.creatorAgentRequestedAt ?? new Date(),
    };

    const reg = existing
      ? await this.prisma.copyrightRegistration.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.copyrightRegistration.create({ data });

    await this.audit.log({
      actorId: userId,
      action: 'COPYRIGHT_REGISTRATION_DRAFT_CREATED',
      targetType: 'CopyrightRegistration',
      targetId: reg.id,
      payload: { ipId, ownerType: dto.ownerType, registrationType: dto.registrationType },
    });

    await this.notifications.create({
      userId,
      type: 'COPYRIGHT_REG_DRAFT',
      title: '著作权登记草稿已保存',
      body: `${ip.displayName} 的著作权登记草稿已保存,可继续完善或提交申请`,
      link: `/creator/ips/${ipId}?tab=copyright`,
    });

    return reg;
  }

  /**
   * 创作者提交申请 — DRAFT → SUBMITTED, snapshot fee.
   */
  async submit(ipId: string, userId: string): Promise<CopyrightRegistration> {
    const ip = await this.prisma.ipAsset.findUnique({
      where: { id: ipId },
      include: { registration: true },
    });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== userId) throw new ForbiddenException('无权操作此 IP');
    const reg = ip.registration;
    if (!reg) throw new BadRequestException('请先创建草稿');
    if (!TRANSITIONS[reg.workflowStage].includes('SUBMITTED')) {
      throw new BadRequestException(`当前阶段 ${reg.workflowStage} 不允许提交`);
    }

    const feeFen = await this.feeResolver.resolve(reg.registrationType, reg.registrationRegion);

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.copyrightRegistration.updateMany({
        where: { id: reg.id, workflowStage: 'DRAFT' },
        data: {
          workflowStage: 'SUBMITTED',
          submittedAt: new Date(),
          creatorAgentFeeFen: feeFen,
        },
      });
      if (res.count !== 1) throw new ConflictException('状态已被其他操作修改,请刷新');
      return tx.copyrightRegistration.findUnique({ where: { id: reg.id } });
    });

    await this.audit.log({
      actorId: userId,
      action: 'COPYRIGHT_REGISTRATION_SUBMITTED',
      targetType: 'CopyrightRegistration',
      targetId: reg.id,
      payload: { ipId, feeFen, level: reg.registrationType, region: reg.registrationRegion },
    });

    await this.notifications.create({
      userId,
      type: 'COPYRIGHT_REG_SUBMITTED',
      title: '著作权登记申请已提交',
      body: `${ip.displayName} 的著作权申请已提交,平台将在 3 个工作日内向版权局递交。代办费 ¥${(feeFen / 100).toFixed(2)}`,
      link: `/creator/ips/${ipId}?tab=copyright`,
    });

    return updated!;
  }

  /**
   * 创作者主动撤回 (任意非终态 → WITHDRAWN).
   */
  async withdraw(ipId: string, userId: string): Promise<CopyrightRegistration> {
    const ip = await this.prisma.ipAsset.findUnique({
      where: { id: ipId },
      include: { registration: true },
    });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== userId) throw new ForbiddenException('无权操作此 IP');
    const reg = ip.registration;
    if (!reg) throw new BadRequestException('无申请记录');
    if (!TRANSITIONS[reg.workflowStage].includes('WITHDRAWN')) {
      throw new BadRequestException(`当前阶段 ${reg.workflowStage} 不允许撤回`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.copyrightRegistration.updateMany({
        where: { id: reg.id, workflowStage: reg.workflowStage },
        data: { workflowStage: 'WITHDRAWN', withdrawnAt: new Date() },
      });
      if (res.count !== 1) throw new ConflictException('状态已被其他操作修改');
      return tx.copyrightRegistration.findUnique({ where: { id: reg.id } });
    });

    await this.audit.log({
      actorId: userId,
      action: 'COPYRIGHT_REGISTRATION_WITHDRAWN',
      targetType: 'CopyrightRegistration',
      targetId: reg.id,
      payload: { ipId, fromStage: reg.workflowStage },
    });

    return updated!;
  }

  // ============================================================
  //  Admin 端 (Commit 3 才挂 controller,但 service 先实现好)
  // ============================================================

  async listQueue(stage?: RegistrationStage, page = 1, pageSize = 20) {
    const where: Prisma.CopyrightRegistrationWhereInput = stage ? { workflowStage: stage } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.copyrightRegistration.findMany({
        where,
        include: {
          ip: {
            select: {
              id: true,
              code: true,
              displayName: true,
              status: true,
              officialCertNo: true,
              creator: { select: { id: true, email: true, displayName: true } },
            },
          },
        },
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.copyrightRegistration.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getAdminDetail(ipId: string) {
    const reg = await this.prisma.copyrightRegistration.findUnique({
      where: { ipId },
      include: {
        ip: {
          include: {
            creator: { select: { id: true, email: true, displayName: true, phone: true } },
            files: {
              where: { validated: true },
              orderBy: [{ assetType: 'asc' }, { uploadedAt: 'asc' }],
              select: { id: true, assetType: true, originalName: true, ossKey: true, mimeType: true, sizeBytes: true },
            },
            faceCloseupFile: true,
          },
        },
      },
    });
    if (!reg) throw new NotFoundException('该 IP 暂无著作权申请');
    return reg;
  }

  async adminAccept(ipId: string, adminId: string, applicationNo: string) {
    return this.adminTransition(ipId, adminId, 'ACCEPTED', {
      applicationNo,
      acceptedAt: new Date(),
      auditAction: 'COPYRIGHT_REGISTRATION_ACCEPTED',
      notification: (ip) => ({
        userId: ip.creatorId,
        type: 'COPYRIGHT_REG_ACCEPTED' as const,
        title: '版权局已受理您的著作权申请',
        body: `${ip.displayName} 已被版权局受理,受理号 ${applicationNo}`,
        link: `/creator/ips/${ipId}?tab=copyright`,
      }),
    });
  }

  async adminUnderReview(ipId: string, adminId: string) {
    return this.adminTransition(ipId, adminId, 'UNDER_REVIEW', {
      reviewedAt: new Date(),
      auditAction: 'COPYRIGHT_REGISTRATION_UNDER_REVIEW',
    });
  }

  async adminCertify(ipId: string, adminId: string, certificateNo: string) {
    const reg = await this.adminTransition(ipId, adminId, 'CERTIFIED', {
      certificateNo,
      certifiedAt: new Date(),
      auditAction: 'COPYRIGHT_REGISTRATION_CERTIFIED',
      postTransition: async (tx, regAfter, ip) => {
        // 同步 IpAsset.officialCertNo (创作者详情页看得到)
        await tx.ipAsset.update({
          where: { id: ipId },
          data: { officialCertNo: certificateNo },
        });
      },
      notification: (ip) => ({
        userId: ip.creatorId,
        type: 'COPYRIGHT_REG_CERTIFIED' as const,
        title: '🎉 著作权登记成功',
        body: `${ip.displayName} 著作权已登记,登记号 ${certificateNo}。请在 IP 详情页下载证书原件`,
        link: `/creator/ips/${ipId}?tab=copyright`,
      }),
    });
    return reg;
  }

  async adminReject(ipId: string, adminId: string, reason: string) {
    return this.adminTransition(ipId, adminId, 'REJECTED', {
      rejectionReason: reason,
      auditAction: 'COPYRIGHT_REGISTRATION_REJECTED',
      notification: (ip) => ({
        userId: ip.creatorId,
        type: 'COPYRIGHT_REG_REJECTED' as const,
        title: '著作权申请被驳回',
        body: `${ip.displayName} 申请被驳回,原因:${reason}。请修改后重新提交`,
        link: `/creator/ips/${ipId}?tab=copyright`,
      }),
    });
  }

  /**
   * Admin 状态推进通用方法. 包在 transaction 里:
   * 1. updateMany WHERE stage=当前,确保 race-condition 防护
   * 2. postTransition hook (e.g. certify 时同步 IpAsset.officialCertNo)
   * 3. audit log
   * 4. notification
   */
  private async adminTransition(
    ipId: string,
    adminId: string,
    next: RegistrationStage,
    opts: {
      applicationNo?: string;
      certificateNo?: string;
      rejectionReason?: string;
      acceptedAt?: Date;
      reviewedAt?: Date;
      certifiedAt?: Date;
      auditAction: string;
      postTransition?: (tx: Prisma.TransactionClient, reg: CopyrightRegistration, ip: { id: string; displayName: string; creatorId: string }) => Promise<void>;
      notification?: (ip: { id: string; displayName: string; creatorId: string }) => {
        userId: string;
        type: 'COPYRIGHT_REG_ACCEPTED' | 'COPYRIGHT_REG_CERTIFIED' | 'COPYRIGHT_REG_REJECTED';
        title: string;
        body: string;
        link: string;
      };
    },
  ): Promise<CopyrightRegistration> {
    const reg = await this.prisma.copyrightRegistration.findUnique({
      where: { ipId },
      include: { ip: { select: { id: true, displayName: true, creatorId: true } } },
    });
    if (!reg) throw new NotFoundException('该 IP 暂无著作权申请');
    if (!TRANSITIONS[reg.workflowStage].includes(next)) {
      throw new BadRequestException(`非法状态流转: ${reg.workflowStage} → ${next}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.CopyrightRegistrationUpdateInput = { workflowStage: next };
      if (opts.applicationNo !== undefined) data.applicationNo = opts.applicationNo;
      if (opts.certificateNo !== undefined) data.certificateNo = opts.certificateNo;
      if (opts.rejectionReason !== undefined) data.rejectionReason = opts.rejectionReason;
      if (opts.acceptedAt) data.acceptedAt = opts.acceptedAt;
      if (opts.reviewedAt) data.reviewedAt = opts.reviewedAt;
      if (opts.certifiedAt) data.certifiedAt = opts.certifiedAt;

      const res = await tx.copyrightRegistration.updateMany({
        where: { id: reg.id, workflowStage: reg.workflowStage },
        data,
      });
      if (res.count !== 1) throw new ConflictException(`状态已被其他管理员修改,请刷新`);

      if (opts.postTransition) {
        await opts.postTransition(tx, { ...reg, workflowStage: next } as CopyrightRegistration, reg.ip);
      }

      return tx.copyrightRegistration.findUnique({ where: { id: reg.id } });
    });

    await this.audit.log({
      actorId: adminId,
      action: opts.auditAction,
      targetType: 'CopyrightRegistration',
      targetId: reg.id,
      payload: {
        ipId,
        fromStage: reg.workflowStage,
        toStage: next,
        ...(opts.applicationNo ? { applicationNo: opts.applicationNo } : {}),
        ...(opts.certificateNo ? { certificateNo: opts.certificateNo } : {}),
        ...(opts.rejectionReason ? { rejectionReason: opts.rejectionReason } : {}),
      },
    });

    if (opts.notification) {
      const n = opts.notification(reg.ip);
      await this.notifications.create(n);
    }

    return updated!;
  }

  // ============================================================
  //  PDF 下载 — material hash 缓存,素材变才重生成
  // ============================================================

  async downloadPdf(ipId: string, userId: string): Promise<{ url: string; cached: boolean }> {
    const ip = await this.prisma.ipAsset.findUnique({
      where: { id: ipId },
      include: { registration: true, faceCloseupFile: true },
    });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== userId) throw new ForbiddenException('无权操作此 IP');
    if (!ip.faceCloseupFile) throw new BadRequestException('IP 还没有面部特写,无法生成 PDF');

    const reg = ip.registration;
    const currentHash = await this.pdfBuilder.computeMaterialHash(ipId);

    // 缓存命中: hash 一致且已有 key
    if (reg?.pdfFileKey && reg.pdfMaterialHash === currentHash) {
      const url = await this.upload.signDownloadUrl(reg.pdfFileKey, 'private', `${ip.code}-著作权申请包.pdf`);
      return { url, cached: true };
    }

    // 缓存失效,重生成
    this.logger.log(`PDF 重生成 ipId=${ipId} hash=${currentHash.slice(0, 12)}…`);
    const buf = await this.pdfBuilder.generatePdf(ipId);
    const ossKey = `ips/${ip.code}/copyright-pdf/${Date.now()}.pdf`;
    await this.upload.uploadPrivate(ossKey, buf);
    await this.prisma.copyrightRegistration.upsert({
      where: { ipId },
      update: { pdfFileKey: ossKey, pdfMaterialHash: currentHash },
      create: {
        ipId,
        ownerName: 'PDF-PREVIEW',
        ownerType: 'INDIVIDUAL',
        registrationRegion: '',
        registrationType: 'NATIONAL',
        workflowStage: 'DRAFT',
        pdfFileKey: ossKey,
        pdfMaterialHash: currentHash,
        creatorAgentRequestedAt: new Date(),
      },
    });
    await this.audit.log({
      actorId: userId,
      action: 'COPYRIGHT_PDF_GENERATED',
      targetType: 'IpAsset',
      targetId: ipId,
      payload: { sizeBytes: buf.length, materialHash: currentHash.slice(0, 16) },
    });

    const url = await this.upload.signDownloadUrl(ossKey, 'private', `${ip.code}-著作权申请包.pdf`);
    return { url, cached: false };
  }
}