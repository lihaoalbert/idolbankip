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
import { QualityEvalAdminController } from './quality-eval-admin.controller';

/**
 * QualityEvalModule — W2.5 (D4-D9)
 *
 * 暴露 2 个 controller:
 *   - QualityEvalController (公开): 创作者/买家侧评分查询 + 申诉
 *   - QualityEvalAdminController (ADMIN): admin 评分队列 + 复审
 */
@Module({
  imports: [PrismaModule, AuditModule, LlmConfigModule, ModerationModule],
  providers: [QualityEvalService, L1TechnicalService, L2AestheticService, L4CommercialService],
  controllers: [QualityEvalController, QualityEvalAdminController],
  exports: [QualityEvalService],
})
export class QualityEvalModule {}
