import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KycStatus } from '@prisma/client';
import { KYC_CLIENT, KycClient } from '@ibi-ren/shared-contracts';
import { AuditService } from '../audit/audit.service';
import { parseRoles, serializeRoles, UserRole } from '../common/util/roles.util';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(KYC_CLIENT) private readonly client: KycClient,
  ) {}

  /**
   * KYC 通过时幂等补 CREATOR 角色 — 解除 OnboardPage "联系商务" 死循环
   * 见 [[project-post-mvp-backlog]] #17
   *
   * 设计: BUYER 提交 KYC 后会自动升 CREATOR,不用再联系商务。短期解(真 KYC 服务接入前)。
   * 已有 CREATOR 时 no-op (idempotent)。REJECTED 路径不进。
   */
  private async grantCreatorRoleOnApproval(userId: string, actorId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { roles: true },
    });
    const current = parseRoles(user?.roles);
    if (current.includes(UserRole.CREATOR)) return;
    const next = [...current, UserRole.CREATOR];
    await this.prisma.user.update({
      where: { id: userId },
      data: { roles: serializeRoles(next) as any },
    });
    await this.audit.log({
      actorId,
      action: 'CREATOR_ROLE_AUTO_GRANTED',
      targetType: 'User',
      targetId: userId,
      payload: { reason: 'KYC_APPROVED', before: current, after: next },
    });
    this.logger.log(`auto-granted CREATOR role to user ${userId} after KYC approval`);
  }

  async submit(userId: string, payload: { realName: string; idNumber: string; phone?: string; livenessImageKey?: string }) {
    const result = await this.client.verifyIdentity(payload);
    const status: KycStatus = result.status === 'APPROVED' ? 'APPROVED' : result.status === 'REJECTED' ? 'REJECTED' : 'PENDING';
    const submission = await this.prisma.kycSubmission.create({
      data: {
        userId,
        payload: payload as any,
        status,
        reviewedAt: status !== 'PENDING' ? new Date() : null,
      },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: status,
        realName: payload.realName,
        kycData: { refId: result.refId } as any,
      },
    });
    if (status === 'APPROVED') {
      await this.grantCreatorRoleOnApproval(userId, userId);
    }
    await this.audit.log({
      actorId: userId,
      action: 'KYC_SUBMITTED',
      targetType: 'KycSubmission',
      targetId: submission.id,
      payload: { status, reason: result.reason },
    });
    return submission;
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const latest = await this.prisma.kycSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { status: user.kycStatus, latest };
  }

  async adminApprove(submissionId: string, reviewerId: string, notes?: string) {
    const sub = await this.prisma.kycSubmission.update({
      where: { id: submissionId },
      data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date(), notes },
    });
    await this.prisma.user.update({
      where: { id: sub.userId },
      data: { kycStatus: 'APPROVED' },
    });
    await this.grantCreatorRoleOnApproval(sub.userId, reviewerId);
    await this.audit.log({
      actorId: reviewerId,
      action: 'KYC_APPROVED',
      targetType: 'KycSubmission',
      targetId: submissionId,
    });
    return sub;
  }

  async adminReject(submissionId: string, reviewerId: string, notes: string) {
    const sub = await this.prisma.kycSubmission.update({
      where: { id: submissionId },
      data: { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: new Date(), notes },
    });
    await this.prisma.user.update({
      where: { id: sub.userId },
      data: { kycStatus: 'REJECTED' },
    });
    await this.audit.log({
      actorId: reviewerId,
      action: 'KYC_REJECTED',
      targetType: 'KycSubmission',
      targetId: submissionId,
      payload: { notes },
    });
    return sub;
  }
}