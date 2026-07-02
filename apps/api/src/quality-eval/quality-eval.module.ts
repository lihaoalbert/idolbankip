import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { LlmConfigModule } from '../llm-config/llm-config.module';
import { ModerationModule } from '../moderation/moderation.module';
import { L1TechnicalService } from './l1-technical.service';
import { L2AestheticService } from './l2-aesthetic.service';
import { L4CommercialService } from './l4-commercial.service';
import { QualityEvalService } from './quality-eval.service';
import { QualityEvalController } from './quality-eval.controller';

/**
 * QualityEvalModule — W2.5 (D4-D7)
 *
 * DI 依赖:
 *   - PrismaModule     QualityEval 表读写 (§11.6 schema)
 *   - AuditModule      evaluate + appeal 写入审计流
 *   - LlmConfigModule  Anthropic client (L2/L4 主用)
 *   - ModerationModule  L3 (走阿里云增强版或 Mock fallback)
 *
 * 路由 (QualityEvalController):
 *   - POST /api/v1/quality-eval/run          创作者/买家触发自评
 *   - GET  /api/v1/quality-eval/by-deliverable/:id
 *   - GET  /api/v1/quality-eval/by-brief/:briefId
 *   - POST /api/v1/quality-eval/:id/appeal   申诉入口 (48h 1 次)
 *
 * admin 路由独立在 AdminQualityEvalController,不在本 module 暴露
 */
@Module({
  imports: [PrismaModule, AuditModule, LlmConfigModule, ModerationModule],
  providers: [QualityEvalService, L1TechnicalService, L2AestheticService, L4CommercialService],
  controllers: [QualityEvalController],
  exports: [QualityEvalService],
})
export class QualityEvalModule {}
