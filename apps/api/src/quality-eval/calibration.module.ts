/**
 * CalibrationModule — W2.5 D10-D12 校准脚本专用
 *
 * 不依赖 AppModule (AppModule 包含 Auth/Payment 等, applicationContext 模式下
 * JwtStrategy 初始化失败 — ConfigService 未注入)。
 *
 * 只导入校准需要的服务: L1/L2/L4 + Prisma + Moderation(L3 可选) + Audit
 * LlmConfigService 用 CalibrationLlmProvider 替换, 跳过 DB 查 + AuthModule 依赖。
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ModerationModule } from '../moderation/moderation.module';
import { LlmConfigService } from '../llm-config/llm-config.service';
import { L1TechnicalService } from './l1-technical.service';
import { L2AestheticService } from './l2-aesthetic.service';
import { L4CommercialService } from './l4-commercial.service';
import { QualityEvalService } from './quality-eval.service';
import { CalibrationLlmProvider } from './calibration-llm.provider';
import { configValidationSchema } from '../config/config.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
      envFilePath: ['.env'],
    }),
    PrismaModule,
    AuditModule,
    ModerationModule,
  ],
  providers: [
    // applicationContext 模式下 ConfigModule.forRoot isGlobal: true 不能跨模块共享 ConfigService,
    // 显式 provide 让 Moderation/Audit 等子模块能注入到
    ConfigService,
    // 用 calibration 专用 LLM provider 替换 LlmConfigService
    // (LlmConfigService 在 applicationContext 下会拉 AuthModule → JwtStrategy 初始化失败)
    { provide: LlmConfigService, useClass: CalibrationLlmProvider },
    QualityEvalService,
    L1TechnicalService,
    L2AestheticService,
    L4CommercialService,
  ],
  exports: [QualityEvalService],
})
export class CalibrationModule {}