import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/util/roles.util';
import { PlatformJudgeService } from './platform-judge.service';

class JudgeDto {
  @IsString() briefId!: string;
  @IsOptional() @IsString() deliverableId?: string;
  @IsOptional() @IsString() bidId?: string;
}

/**
 * #30.7.1 W2 #28 平台仲裁 Agent 端点
 * POST /api/v1/platform/judge/deliverable  — admin / buyer / creator 都能触发
 * GET  /api/v1/platform/judge/by-brief/:briefId  — 列出 brief 的判定历史
 * GET  /api/v1/platform/judge/:id  — 单个判定详情
 */
@ApiTags('platform-judge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('platform/judge')
export class PlatformJudgeController {
  constructor(private readonly judge: PlatformJudgeService) {}

  @Post('deliverable')
  async runJudge(
    @CurrentUser() u: JwtUser,
    @Body() body: JudgeDto,
  ) {
    const j = await this.judge.judgeDeliverable({
      briefId: body.briefId,
      deliverableId: body.deliverableId,
      bidId: body.bidId,
      triggeredBy: u.id,
    });
    return { judgment: j };
  }

  @Get('by-brief/:briefId')
  async listByBrief(@Param('briefId') briefId: string) {
    return { items: await this.judge.listByBrief(briefId) };
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.judge.getById(id);
  }
}
