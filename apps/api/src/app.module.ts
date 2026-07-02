import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { KycModule } from './kyc/kyc.module';
import { IpsModule } from './ips/ips.module';
import { TasksModule } from './tasks/tasks.module';
import { UploadModule } from './upload/upload.module';
import { ModerationModule } from './moderation/moderation.module';
import { ProofingModule } from './proofing/proofing.module';
import { WatermarkModule } from './watermark/watermark.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentModule } from './payment/payment.module';
import { ContractsModule } from './contracts/contracts.module';
import { DownloadModule } from './download/download.module';
import { CertModule } from './cert/cert.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { LeadsModule } from './leads/leads.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AgentModule } from './agent/agent.module';
import { AiModule } from './ai/ai.module';
import { HonorModule } from './honor/honor.module';
import { NiApiModule } from './mock/ni-api/ni-api.module';
import { BlueprintModule } from './blueprint/blueprint.module';
import { CopyrightModule } from './copyright/copyright.module';
import { LlmConfigModule } from './llm-config/llm-config.module';
import { AssistantModule } from './assistant/assistant.module';
import { BriefModule } from './brief/brief.module';
import { BidModule } from './bid/bid.module';
import { PricingModule } from './pricing/pricing.module';
import { CatalogModule } from './catalog/catalog.module';
import { PlatformJudgeModule } from './platform-judge/platform-judge.module';
import { EmailModule } from './email/email.module';
import { WechatModule } from './wechat/wechat.module';
import { BriefPushModule } from './brief-push/brief-push.module';
import { QualityEvalModule } from './quality-eval/quality-eval.module';
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
    CertModule,
    AdminModule,
    TasksModule,
    HealthModule,
    LeadsModule,
    NotificationsModule,
    AgentModule,
    AiModule,
    HonorModule,
    NiApiModule,
    BlueprintModule,
    CopyrightModule,
    LlmConfigModule,
    AssistantModule,
    BriefModule,
    BidModule,
    PricingModule,
    CatalogModule,
    PlatformJudgeModule,
    EmailModule,
    WechatModule,
    BriefPushModule,
    QualityEvalModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}