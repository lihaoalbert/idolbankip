/**
 * QualityEvalAdminController — admin 端评分管理 (D8-D9)
 *
 * 路由 (全部 @Roles(ADMIN) + JwtAuthGuard):
 *   GET  /api/v1/admin/quality-eval/queue        评分队列 (按 grade/decision/briefId/trigger 过滤 + 分页)
 *   GET  /api/v1/admin/quality-eval/dashboard    评分统计
 *   GET  /api/v1/admin/quality-eval/:id          评分详情 (含 4 层 JSON)
 *   POST /api/v1/admin/quality-eval/:id/appeal-decision  复审申诉 (overridden / confirmed)
 *
 * 前台 QualityEvalController 仍存在 — 创作者 / 买家从公开路由访问
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/util/roles.util';
import { QualityEvalService } from './quality-eval.service';
import { AuditService } from '../audit/audit.service';
import {
  AppealDecisionDto,
  QualityEvalQueueQueryDto,
} from './dto/admin-quality-eval.dto';

@Controller('admin/quality-eval')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class QualityEvalAdminController {
  constructor(
    private readonly service: QualityEvalService,
    private readonly audit: AuditService,
  ) {}

  @Get('queue')
  async queue(@Query() q: QualityEvalQueueQueryDto) {
    const { items, total, page, pageSize } = await this.service.listAll({
      grade: q.grade,
      decision: q.decision,
      briefId: q.briefId,
      trigger: q.trigger,
      page: q.page,
      pageSize: q.pageSize,
    });
    return { items, total, page, pageSize };
  }

  @Get('dashboard')
  async dashboard() {
    return this.service.dashboardStats();
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    return this.service.getById(id);
  }

  /** Admin 复审申诉 — 写 appealDecision + appealSummary + appealResponderId */
  @Post(':id/appeal-decision')
  async appealDecision(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() body: AppealDecisionDto,
  ) {
    const existing = await this.service.getById(id);
    if (!existing.appealedAt) {
      // 没申诉过直接落决策无意义, 但允许 admin 提前建档
    }
    const newComposite =
      body.appealDecision === 'overridden' && body.newScores?.length === 4
        ? body.newScores[0] * 0.15 +
          body.newScores[1] * 0.3 +
          body.newScores[2] * 0.25 +
          body.newScores[3] * 0.3
        : undefined;
    const newGrade =
      newComposite !== undefined
        ? newComposite >= 0.85
          ? 'S'
          : newComposite >= 0.7
            ? 'A'
            : newComposite >= 0.6
              ? 'B'
              : 'C'
        : existing.grade;

    const row = await (this.service as any).prisma.qualityEval.update({
      where: { id },
      data: {
        appealDecision: body.appealDecision,
        appealSummary: body.appealSummary,
        appealResponderId: user.id,
        ...(body.appealDecision === 'overridden' && newComposite !== undefined
          ? { compositeScore: newComposite, grade: newGrade }
          : {}),
      },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'quality_eval.appeal_decided',
      targetType: 'QualityEval',
      targetId: id,
      payload: {
        appealDecision: body.appealDecision,
        newComposite,
        newGrade,
        briefId: existing.briefId,
      },
    });
    return { eval: row };
  }
}
