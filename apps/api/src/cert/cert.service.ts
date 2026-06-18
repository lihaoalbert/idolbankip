import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CertFileType, CertStatus, CopyrightCertificate, IpStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UploadService } from '../upload/upload.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface CreateCertSubmissionDto {
  certFileType: CertFileType;
  certFileKey: string;
  certFileName: string;
  certFileSize: number;
  selfCertNo?: string;
  selfIssuedAt?: Date;
}

@Injectable()
export class CertService {
  private readonly logger = new Logger(CertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly upload: UploadService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * 创作者提交证书 (PUBLIC_INTENT 状态)
   * - IP 必须属于该创作者
   * - IP 状态必须是 PUBLIC_INTENT
   * - 同一 IP 已有 cert 且 APPROVED → 拒绝重提
   * - 已有 cert 且 REJECTED/PENDING_REVIEW → 覆盖文件 + 重置 PENDING_REVIEW
   * - 通过 upload.verifyCertObject HEAD-check OSS key 真实存在且 magic 匹配
   */
  async createSubmission(
    ipId: string,
    creatorId: string,
    dto: CreateCertSubmissionDto,
  ): Promise<CopyrightCertificate> {
    const ip = await this.prisma.ipAsset.findUnique({ where: { id: ipId } });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== creatorId) throw new ForbiddenException('无权操作此资产');
    if (ip.status !== IpStatus.PUBLIC_INTENT) {
      throw new BadRequestException(`仅 PUBLIC_INTENT 状态可提交证书,当前 ${ip.status}`);
    }

    // 验证 OSS key 真实存在 + magic 校验 (防止前端伪造 key)
    const verify = await this.upload.verifyCertObject(dto.certFileKey, dto.certFileType, dto.certFileSize);
    if (!verify.ok) {
      throw new BadRequestException(`证书文件校验失败: ${verify.reason}`);
    }

    const existing = await this.prisma.copyrightCertificate.findUnique({ where: { ipId } });
    if (existing?.status === CertStatus.APPROVED) {
      throw new BadRequestException('已通过的证书不能重提,需联系客服');
    }

    const data = {
      certFileType: dto.certFileType,
      certFileKey: dto.certFileKey,
      certFileName: dto.certFileName,
      certFileSize: BigInt(dto.certFileSize),
      selfCertNo: dto.selfCertNo ?? null,
      selfIssuedAt: dto.selfIssuedAt ?? null,
      status: CertStatus.PENDING_REVIEW,
      rejectionReason: null,
      reviewedById: null,
      reviewedAt: null,
    };

    if (existing) {
      return this.prisma.copyrightCertificate.update({ where: { ipId }, data });
    }
    return this.prisma.copyrightCertificate.create({
      data: { ipId, applyMethod: 'CREATOR_SELF', ...data },
    });
  }

  /**
   * 创作者查自己的 cert
   */
  async getByIpIdForCreator(ipId: string, creatorId: string): Promise<CopyrightCertificate | null> {
    const ip = await this.prisma.ipAsset.findUnique({
      where: { id: ipId },
      select: { creatorId: true },
    });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== creatorId) throw new ForbiddenException('无权查看');
    return this.prisma.copyrightCertificate.findUnique({ where: { ipId } });
  }

  /**
   * admin 看待审核 cert 队列
   */
  async adminListQueue() {
    return this.prisma.copyrightCertificate.findMany({
      where: { status: CertStatus.PENDING_REVIEW },
      orderBy: { createdAt: 'asc' },
      include: {
        ip: {
          select: {
            id: true,
            code: true,
            displayName: true,
            creatorId: true,
            status: true,
            creator: { select: { id: true, email: true, displayName: true } },
          },
        },
      },
    });
  }

  /**
   * admin 按 ID 取 cert (用于预览文件)
   * - 不做状态过滤 (PENDING/APPROVED/REJECTED 都能预览)
   * - 含 ip.creator 信息
   */
  async adminGetById(certId: string): Promise<CopyrightCertificate> {
    const cert = await this.prisma.copyrightCertificate.findUnique({
      where: { id: certId },
      include: {
        ip: {
          select: {
            id: true,
            code: true,
            displayName: true,
            creatorId: true,
            status: true,
            creator: { select: { id: true, email: true, displayName: true } },
          },
        },
      },
    });
    if (!cert) throw new NotFoundException('证书不存在');
    return cert;
  }

  /**
   * admin 通过 cert
   * - cert.status = APPROVED
   * - ip.status = OFFICIAL_REGISTERED
   * - ip.officialCertNo = selfCertNo or fallback
   * - 用 prisma transaction 保证一致性
   */
  async adminApprove(certId: string, adminId: string): Promise<CopyrightCertificate> {
    const { updated, ipCreatorId, ipId, certNo } = await this.prisma.$transaction(async (tx) => {
      const cert = await tx.copyrightCertificate.findUnique({
        where: { id: certId },
        include: { ip: true },
      });
      if (!cert) throw new NotFoundException('证书不存在');
      if (cert.status !== CertStatus.PENDING_REVIEW) {
        throw new BadRequestException(`当前 cert 状态 ${cert.status} 不允许审核`);
      }
      if (cert.ip.status !== IpStatus.PUBLIC_INTENT) {
        throw new BadRequestException(`IP 状态 ${cert.ip.status} 不允许登记证书`);
      }

      const certNo = cert.selfCertNo || `IBI-AUTO-${cert.id.slice(-8).toUpperCase()}`;
      const certIssuedAt = cert.selfIssuedAt || new Date();

      const updated = await tx.copyrightCertificate.update({
        where: { id: certId },
        data: {
          status: CertStatus.APPROVED,
          certNo,
          certIssuedAt,
          reviewedById: adminId,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      });

      await tx.ipAsset.update({
        where: { id: cert.ipId },
        data: {
          status: IpStatus.OFFICIAL_REGISTERED,
          officialCertNo: certNo,
          officialAt: certIssuedAt,
        },
      });

      await this.audit.log({
        actorId: adminId,
        action: 'CERT_APPROVED',
        targetType: 'CopyrightCertificate',
        targetId: certId,
        payload: { ipId: cert.ipId, certNo },
      });

      this.logger.log(`Cert ${certId} APPROVED by admin ${adminId}, ip ${cert.ip.code} → OFFICIAL_REGISTERED`);
      return { updated, ipCreatorId: cert.ip.creatorId, ipId: cert.ipId, certNo };
    });
    // 事务提交后通知创作者
    await this.notifications.create({
      userId: ipCreatorId,
      type: 'CERT_APPROVED',
      title: '版权证书已通过',
      body: `IP 版权已登记 (证书号 ${certNo}),可在创作者中心下载证书。`,
      link: `/creator/ips/${ipId}`,
    });
    return updated;
  }

  /**
   * admin 拒绝 cert
   * - cert.status = REJECTED
   * - ip.status = PENDING_REVIEW (创作者可重提)
   * - rejectionReason 至少 5 字
   */
  async adminReject(certId: string, adminId: string, reason: string): Promise<CopyrightCertificate> {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('拒绝原因至少 5 字');
    }
    const { updated, ipCreatorId, ipId } = await this.prisma.$transaction(async (tx) => {
      const cert = await tx.copyrightCertificate.findUnique({
        where: { id: certId },
        include: { ip: true },
      });
      if (!cert) throw new NotFoundException('证书不存在');
      if (cert.status !== CertStatus.PENDING_REVIEW) {
        throw new BadRequestException(`当前 cert 状态 ${cert.status} 不允许审核`);
      }

      const updated = await tx.copyrightCertificate.update({
        where: { id: certId },
        data: {
          status: CertStatus.REJECTED,
          reviewedById: adminId,
          reviewedAt: new Date(),
          rejectionReason: reason,
        },
      });

      await tx.ipAsset.update({
        where: { id: cert.ipId },
        data: {
          status: IpStatus.PENDING_REVIEW,
          officialCertNo: null,
          officialAt: null,
          rejectionReason: reason,
        },
      });

      await this.audit.log({
        actorId: adminId,
        action: 'CERT_REJECTED',
        targetType: 'CopyrightCertificate',
        targetId: certId,
        payload: { ipId: cert.ipId, reason },
      });

      this.logger.log(`Cert ${certId} REJECTED by admin ${adminId}, reason: ${reason}`);
      return { updated, ipCreatorId: cert.ip.creatorId, ipId: cert.ipId };
    });
    await this.notifications.create({
      userId: ipCreatorId,
      type: 'CERT_REJECTED',
      title: '版权证书审核未通过',
      body: `原因: ${reason}。请在创作者中心重新提交。`,
      link: `/creator/ips/${ipId}`,
    });
    return updated;
  }
}
