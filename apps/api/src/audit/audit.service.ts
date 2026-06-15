import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    actorId?: string;
    action: string;
    targetType: string;
    targetId: string;
    payload?: unknown;
    ipAddress?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        payload: params.payload as any,
        ipAddress: params.ipAddress,
      },
    });
  }
}