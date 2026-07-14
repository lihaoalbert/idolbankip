import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class DownloadService {
  private readonly logger = new Logger(DownloadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly upload: UploadService,
  ) {}

  async list(orderId: string, requesterId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        ip: {
          include: {
            files: {
              where: { assetType: { in: ['LORA_FILE', 'BIO_TXT', 'RECIPE_TXT', 'THREE_VIEW', 'EXPRESSION_GRID', 'TRANSPARENT_RENDER', 'PACKAGE_ZIP', 'VOICE_REF', 'TEST_SAMPLE'] } },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.buyerId !== requesterId) {
      const u = await this.prisma.user.findUniqueOrThrow({ where: { id: requesterId } });
      const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
      if (!roles.includes('ADMIN')) throw new ForbiddenException();
    }
    if (!['CONTRACT_SIGNED', 'DOWNLOAD_UNLOCKED', 'DELIVERED'].includes(order.status)) {
      throw new ForbiddenException('订单尚未签署完成,无法下载');
    }
    // R10 P0-3: brief 中标订单 ip 为 null, 应走 workspace deliverable 流程而非 IP 下载
    if (!order.ip) throw new ForbiddenException('该订单为发包中标,资产在工作台交付');
    return {
      order: { id: order.id, status: order.status, ipCode: order.ip.code },
      files: order.ip.files.map(f => ({
        fileId: f.id,
        assetType: f.assetType,
        displayName: f.originalName,
        sizeBytes: f.sizeBytes.toString(),
      })),
    };
  }

  async generateSignedUrl(params: {
    orderId: string;
    fileId: string;
    requesterId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ url: string; expiresAt: Date }> {
    const order = await this.prisma.order.findUnique({ where: { id: params.orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.buyerId !== params.requesterId) {
      const u = await this.prisma.user.findUniqueOrThrow({ where: { id: params.requesterId } });
      const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
      if (!roles.includes('ADMIN')) throw new ForbiddenException();
    }
    if (!['CONTRACT_SIGNED', 'DOWNLOAD_UNLOCKED', 'DELIVERED'].includes(order.status)) {
      throw new ForbiddenException('订单尚未签署完成,无法下载');
    }
    const file = await this.prisma.ipFile.findUnique({ where: { id: params.fileId } });
    if (!file) throw new NotFoundException('文件不存在');

    const bucket = file.ossKey.includes('contracts/') ? 'contracts' : 'private';
    const url = await this.upload.signDownloadUrl(file.ossKey, bucket, file.originalName);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.prisma.downloadGrant.create({
      data: {
        orderId: order.id,
        assetKey: file.ossKey,
        signedUrl: url,
        expiresAt,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
    await this.audit.log({
      actorId: params.requesterId,
      action: 'DOWNLOAD_GRANTED',
      targetType: 'IpFile',
      targetId: file.id,
      payload: { orderId: order.id, bucket, expiresAt },
      ipAddress: params.ipAddress,
    });
    return { url, expiresAt };
  }
}