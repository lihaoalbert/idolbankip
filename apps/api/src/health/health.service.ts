import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
  ) {}

  async check() {
    const [db, oss] = await Promise.all([
      this.prisma.healthCheck().catch(() => false),
      this.upload.healthCheck().catch(() => false),
    ]);
    return {
      status: db ? 'ok' : 'degraded',
      checks: { database: db, oss },
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}