/**
 * QualityEvalController — 创作者/买家端评分查询 + 申诉
 *
 * 路由:
 *   POST /api/v1/quality-eval/run             创作者自查 / 买家测试 (需登录)
 *   GET  /api/v1/quality-eval/by-deliverable/:id  公开查询 (评分面向买家+创作者公开, §9.1 #1)
 *   GET  /api/v1/quality-eval/by-brief/:briefId   公开查询历史评分
 *   POST /api/v1/quality-eval/:id/appeal     申诉 (48h 1 次, §9.1 #6)
 *
 * admin /settings/quality-eval 端独立 — 见 admin.controller
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { QualityEvalService } from './quality-eval.service';
import {
  AppealQualityEvalDto,
  RunQualityEvalDto,
} from './dto/run-quality-eval.dto';

@Controller('quality-eval')
export class QualityEvalController {
  constructor(private readonly service: QualityEvalService) {}

  /**
   * 创作者自查评分 — 触发评分 + 持久化,需登录
   * admin 也用同一端点 (admin 触发手动评分)
   */
  @Post('run')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async run(@CurrentUser() user: JwtUser, @Body() body: RunQualityEvalDto) {
    const row = await this.service.persist(
      {
        briefId: body.briefId,
        deliverableId: body.deliverableId ?? '',
        briefDescription: body.briefDescription,
        deliverableDescription: body.deliverableDescription,
        deliverableUrls: body.deliverableUrls,
        thumbnailUrls: body.thumbnailUrls,
        creatorNote: body.creatorNote,
        triggeredBy: user.id,
      },
      { triggeredBy: user.id, trigger: 'manual' },
    );
    return { eval: row };
  }

  /** 评分公开 — 买家/创作者都看 (§9.1 #1) */
  @Get('by-deliverable/:id')
  async byDeliverable(@Param('id') deliverableId: string) {
    const latest = await this.service.getLatestByDeliverable(deliverableId);
    return { eval: latest };
  }

  /** 历史评分 + 申诉轨迹 */
  @Get('by-brief/:briefId')
  async byBrief(@Param('briefId') briefId: string) {
    const items = await this.service.listByBrief(briefId, 20);
    return { items };
  }

  /** 申诉 — 48h 1 次,SLA 48h (§9.1 #6) */
  @Post(':id/appeal')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async appeal(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() body: AppealQualityEvalDto,
  ) {
    const row = await this.service.appeal(id, body.appealReason, user.id);
    return { eval: row };
  }
}
