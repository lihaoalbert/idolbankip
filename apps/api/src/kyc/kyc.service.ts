import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KycStatus } from '@prisma/client';
import { KYC_CLIENT, KycClient, OCR_CLIENT, OcrClient } from '@ibi-ren/shared-contracts';
import { AuditService } from '../audit/audit.service';
import { parseRoles, serializeRoles, UserRole } from '../common/util/roles.util';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly upload: UploadService,
    @Inject(KYC_CLIENT) private readonly client: KycClient,
    @Inject(OCR_CLIENT) private readonly ocr: OcrClient | null,
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
      // 通知: mock 直接 APPROVED 时也告诉用户
      await this.notifications.create({
        userId,
        type: 'KYC_APPROVED',
        title: 'KYC 实名认证已通过',
        body: '创作者权限已自动开通,立即上传虚拟人资产。',
        link: '/creator/onboard',
      });
    } else if (status === 'REJECTED') {
      await this.notifications.create({
        userId,
        type: 'KYC_REJECTED',
        title: 'KYC 实名认证未通过',
        body: result.reason || '请检查信息后重新提交。',
        link: '/creator/onboard',
      });
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

  /**
   * 企业 KYC 提交 — 法人姓名+身份证号 (营业执照信息由前端在 OCR 步骤拿到并二次确认)
   * 流程:
   *   1. 重新 OCR 营业执照图片(防止前端篡改 OCR 结果)
   *   2. 校验:法人姓名 必须等于 OCR 出来的 legalPerson
   *   3. 调 AliyunKycClient.verifyIdentity(法人姓名, 法人身份证号) 做二要素
   *   4. APPROVED → User.companyName = OCR 出来的 enterpriseName
   */
  async submitEnterprise(
    userId: string,
    payload: {
      licenseImageKey: string;
      legalPersonName: string;
      legalPersonIdNumber: string;
      phone?: string;
    },
  ) {
    if (!this.ocr) {
      throw new BadRequestException('OCR 服务未配置 (OCR_DRIVER=aliyun)');
    }

    // 1. 重新 OCR 营业执照,防止前端 OCR 结果被篡改
    const imageUrl = await this.upload.getSignedUrl(payload.licenseImageKey, 300);
    const ocrResult = await this.ocr.recognizeBusinessLicense({ imageUrl });

    // 2. 校验法人姓名一致
    const ocrLegal = (ocrResult.legalPerson || '').trim();
    const inputLegal = payload.legalPersonName.trim();
    if (!ocrLegal || ocrLegal !== inputLegal) {
      // 记录到 submission 但 REJECTED,留 audit 痕迹
      const submission = await this.prisma.kycSubmission.create({
        data: {
          userId,
          payload: { ...payload, ocrResult } as any,
          status: 'REJECTED',
          reviewedAt: new Date(),
          notes: `法人姓名不一致 (OCR=${ocrLegal}, 输入=${inputLegal})`,
        },
      });
      await this.audit.log({
        actorId: userId,
        action: 'KYC_ENTERPRISE_REJECTED_NAME_MISMATCH',
        targetType: 'KycSubmission',
        targetId: submission.id,
        payload: { ocrLegal, inputLegal },
      });
      return submission;
    }

    // 3. 法人二要素核验
    const result = await this.client.verifyIdentity({
      realName: payload.legalPersonName,
      idNumber: payload.legalPersonIdNumber,
      // 企业 KYC 不走 livenessImageKey (法人代表公司,不需要活体)
      // 但保留 bizId 让阿里云按"任务"维度去重
      bizId: `enterprise-${userId}-${Date.now()}`,
    });

    const status: KycStatus =
      result.status === 'APPROVED' ? 'APPROVED' : result.status === 'REJECTED' ? 'REJECTED' : 'PENDING';

    const submission = await this.prisma.kycSubmission.create({
      data: {
        userId,
        payload: { ...payload, ocrResult, aliyunRef: result.refId } as any,
        status,
        reviewedAt: status !== 'PENDING' ? new Date() : null,
        notes: result.reason,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: status,
        // 法人 = 真实姓名 (用于合同显示),公司名 = OCR 出的 enterpriseName
        realName: payload.legalPersonName,
        companyName: ocrResult.enterpriseName || undefined,
        kycData: {
          refId: result.refId,
          type: 'ENTERPRISE',
          licenseNo: ocrResult.licenseNo,
          legalPerson: ocrResult.legalPerson,
        } as any,
      },
    });

    if (status === 'APPROVED') {
      await this.grantCreatorRoleOnApproval(userId, userId);
      await this.notifications.create({
        userId,
        type: 'KYC_APPROVED',
        title: '企业实名认证已通过',
        body: `公司 ${ocrResult.enterpriseName} 已通过认证,可上架虚拟人资产。`,
        link: '/creator/onboard',
      });
    } else if (status === 'REJECTED') {
      await this.notifications.create({
        userId,
        type: 'KYC_REJECTED',
        title: '企业实名认证未通过',
        body: result.reason || '请检查法人信息后重新提交。',
        link: '/creator/onboard',
      });
    }
    await this.audit.log({
      actorId: userId,
      action: 'KYC_ENTERPRISE_SUBMITTED',
      targetType: 'KycSubmission',
      targetId: submission.id,
      payload: { status, ocrLegal, inputLegal, licenseNo: ocrResult.licenseNo },
    });
    return submission;
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
    await this.notifications.create({
      userId: sub.userId,
      type: 'KYC_APPROVED',
      title: 'KYC 实名认证已通过',
      body: '创作者权限已开通,可以上传虚拟人资产。',
      link: '/creator/onboard',
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
    await this.notifications.create({
      userId: sub.userId,
      type: 'KYC_REJECTED',
      title: 'KYC 实名认证未通过',
      body: notes || '请重新提交。',
      link: '/creator/onboard',
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