import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KycStatus } from '@prisma/client';
import { KYC_CLIENT, KycClient } from '@ibi-ren/shared-contracts';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(KYC_CLIENT) private readonly client: KycClient,
  ) {}

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