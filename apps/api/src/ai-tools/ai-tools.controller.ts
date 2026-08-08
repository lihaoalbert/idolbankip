import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { UserRole } from '../common/util/roles.util';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { AiToolsService } from './ai-tools.service';
import { SUPPORTED_TOOLS } from './cost.config';

class GenerateDto {
  @IsIn(SUPPORTED_TOOLS) toolName!: string;
  @IsString() @MinLength(5) @MaxLength(5000) prompt!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) durationSec?: number;
  @IsOptional() @IsString() resolution?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) imageCount?: number;
}

class ListRecordsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) size?: number;
  @IsOptional() @IsString() toolName?: string;
}

class PreflightQueryDto {
  @IsString() toolName!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) durationSec?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) imageCount?: number;
}

@ApiTags('ai-tools')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('creator/workspaces/:workspaceId')
export class CreatorAiToolsController {
  constructor(private readonly aiTools: AiToolsService) {}

  // 创作者调用 AI 工具
  @Roles(UserRole.CREATOR)
  @Post('generate')
  async generate(
    @CurrentUser() u: JwtUser,
    @Param('workspaceId') workspaceId: string,
    @Body() body: GenerateDto,
  ) {
    const record = await this.aiTools.generate(workspaceId, u.id, body.toolName, {
      prompt: body.prompt,
      durationSec: body.durationSec,
      resolution: body.resolution,
      imageCount: body.imageCount,
    });
    return { record };
  }

  // 列生成记录
  @Roles(UserRole.CREATOR)
  @Get('generations')
  async listRecords(
    @CurrentUser() u: JwtUser,
    @Param('workspaceId') workspaceId: string,
    @Query() q: ListRecordsQueryDto,
  ) {
    return this.aiTools.listRecords(workspaceId, u.id, q);
  }

  // 成本预估 — 满配工具链
  @Roles(UserRole.CREATOR)
  @Get('toolchain/cost-estimate')
  async estimateCost(
    @CurrentUser() u: JwtUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.aiTools.estimateWorkspaceCost(workspaceId, u.id);
  }

  // 成本预估 — 单次调用某工具 (实时,query 参数)
  @Roles(UserRole.CREATOR)
  @Get('tools/preflight')
  async preflight(
    @CurrentUser() _u: JwtUser,
    @Query() q: PreflightQueryDto,
  ) {
    return { estimate: this.aiTools.preflightCost(q.toolName, q) };
  }
}

@ApiTags('ai-tools')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('buyer/workspaces/:workspaceId')
export class BuyerAiToolsController {
  constructor(private readonly aiTools: AiToolsService) {}

  // 买家也能看创作者在 workspace 里的 AI 调用记录(透明)
  @Roles(UserRole.BUYER)
  @Get('generations')
  async listRecords(
    @CurrentUser() u: JwtUser,
    @Param('workspaceId') workspaceId: string,
    @Query() q: ListRecordsQueryDto,
  ) {
    return this.aiTools.listRecords(workspaceId, u.id, q);
  }
}