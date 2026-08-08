import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength, ArrayNotEmpty } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/util/roles.util';
import { MtsService, SUPPORTED_RATIOS, TranscodeRatio } from './mts.service';

class TranscodeDto {
  @IsString() @MinLength(5) sourceUrl!: string;
  @IsArray() @ArrayNotEmpty() ratios!: TranscodeRatio[];
  @IsOptional() @IsString() resolution?: string;
}

@ApiTags('media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('creator/workspaces/:workspaceId/transcode')
export class CreatorTranscodeController {
  constructor(private readonly mts: MtsService) {}

  /**
   * 触发转码 — 创作者在 workspace 内提交源视频 URL,后端按 ratios 转码
   * 返回的 items 可直接喂给 POST /creator/workspaces/:id/deliverables 创建交付
   */
  @Roles(UserRole.CREATOR)
  @Post()
  async transcode(
    @CurrentUser() _u: JwtUser,
    @Param('workspaceId') _workspaceId: string,
    @Body() body: TranscodeDto,
  ) {
    // 校验 ratio 都在 SUPPORTED_RATIOS 内
    for (const r of body.ratios) {
      if (!SUPPORTED_RATIOS.includes(r)) {
        throw new Error(`ratio 必须是 ${SUPPORTED_RATIOS.join('/')}, 收到 ${r}`);
      }
    }
    const result = await this.mts.transcode({
      sourceUrl: body.sourceUrl,
      ratios: body.ratios,
      resolution: body.resolution,
    });
    return { job: result };
  }
}