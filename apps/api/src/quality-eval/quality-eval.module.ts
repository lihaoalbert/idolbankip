import { Module } from '@nestjs/common';
import { LlmConfigModule } from '../llm-config/llm-config.module';
import { ModerationModule } from '../moderation/moderation.module';
import { L1TechnicalService } from './l1-technical.service';
import { L2AestheticService } from './l2-aesthetic.service';
import { L4CommercialService } from './l4-commercial.service';
import { QualityEvalService } from './quality-eval.service';

/**
 * QualityEvalModule — W2.5 (D4-D5)
 *
 * DI 依赖:
 *   - LlmConfigModule  Anthropic client (L2/L4 主用)
 *   - ModerationModule  L3 (走阿里云增强版或 Mock fallback)
 *
 * 导出 QualityEvalService 给 D6-D7 (evidence 落库 / 控制器调用) 用。
 * 入口留为 service-only (无 controller) — D6-D7 加 POST /admin/quality-eval + GET /quality-eval/:briefId
 */
@Module({
  imports: [LlmConfigModule, ModerationModule],
  providers: [QualityEvalService, L1TechnicalService, L2AestheticService, L4CommercialService],
  exports: [QualityEvalService],
})
export class QualityEvalModule {}
