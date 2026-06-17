import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { KycModule } from './kyc/kyc.module';
import { IpsModule } from './ips/ips.module';
import { UploadModule } from './upload/upload.module';
import { ModerationModule } from './moderation/moderation.module';
import { ProofingModule } from './proofing/proofing.module';
import { WatermarkModule } from './watermark/watermark.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentModule } from './payment/payment.module';
import { ContractsModule } from './contracts/contracts.module';
import { DownloadModule } from './download/download.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { LeadsModule } from './leads/leads.module';
import { configValidationSchema } from './config/config.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: configValidationSchema,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    KycModule,
    IpsModule,
    UploadModule,
    ModerationModule,
    ProofingModule,
    WatermarkModule,
    OrdersModule,
    PaymentModule,
    ContractsModule,
    DownloadModule,
    AdminModule,
    HealthModule,
    LeadsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}