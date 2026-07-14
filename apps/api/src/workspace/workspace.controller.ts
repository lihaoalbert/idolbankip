import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsObject,
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
import { WorkspaceService } from './workspace.service';

class UpdateToolchainDto {
  @IsObject() toolchain!: Record<string, boolean>;
}

class UpdateScriptsDto {
  @IsOptional() scripts?: unknown;
}

class AddMessageDto {
  @IsString() @MinLength(1) @MaxLength(5000) content!: string;
  @IsOptional() @IsArray() attachments?: string[];
  @IsOptional() @IsString() type?: string;
}

class ListMessageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) size?: number;
}

// ============== 创作者侧 ==============
@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('creator/workspaces')
export class CreatorWorkspaceController {
  constructor(private readonly workspaces: WorkspaceService) {}

  // 创作者查自己的 workspace 详情
  @Roles(UserRole.CREATOR)
  @Get(':id')
  async detail(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const ws = await this.workspaces.findById(id, u.id);
    return { workspace: ws };
  }

  // R11.1 P0-2: 创作者中标 workspace 列表(我接的活儿) — 解决投标后失联
  @Roles(UserRole.CREATOR)
  @Get()
  async list(@CurrentUser() u: JwtUser) {
    return this.workspaces.listForCreator(u.id);
  }

  // 创作者改工具链 {sora:true, kling:false, ...}
  @Roles(UserRole.CREATOR)
  @Patch(':id/toolchain')
  async updateToolchain(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Body() body: UpdateToolchainDto,
  ) {
    const ws = await this.workspaces.updateToolchain(id, u.id, body.toolchain);
    return { workspace: ws };
  }

  // 创作者改分镜脚本
  @Roles(UserRole.CREATOR)
  @Patch(':id/scripts')
  async updateScripts(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Body() body: UpdateScriptsDto,
  ) {
    const ws = await this.workspaces.updateScripts(id, u.id, body.scripts);
    return { workspace: ws };
  }

  // 创作者提交 (active / revision → submitted)
  @Roles(UserRole.CREATOR)
  @Post(':id/submit')
  async submit(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const ws = await this.workspaces.submit(id, u.id);
    return { workspace: ws };
  }

  // 创作者发消息
  @Roles(UserRole.CREATOR)
  @Post(':id/messages')
  async addMessage(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Body() body: AddMessageDto,
  ) {
    const msg = await this.workspaces.addMessage(
      id,
      u.id,
      body.content,
      body.attachments,
      body.type ?? 'text',
    );
    return { message: msg };
  }

  @Roles(UserRole.CREATOR)
  @Get(':id/messages')
  async listMessages(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Query() q: ListMessageQueryDto,
  ) {
    return this.workspaces.listMessages(id, u.id, q);
  }
}

// ============== 买家侧 ==============
@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('buyer/workspaces')
export class BuyerWorkspaceController {
  constructor(private readonly workspaces: WorkspaceService) {}

  // 买家查对应 brief 的 workspace
  @Roles(UserRole.BUYER)
  @Get(':id')
  async detail(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const ws = await this.workspaces.findById(id, u.id);
    return { workspace: ws };
  }

  // 买家通过 (submitted → approved)
  @Roles(UserRole.BUYER)
  @Post(':id/approve')
  async approve(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const ws = await this.workspaces.approve(id, u.id);
    return { workspace: ws };
  }

  // 买家打回 (submitted → revision) + revisionCount++
  @Roles(UserRole.BUYER)
  @Post(':id/revision')
  async requestRevision(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const ws = await this.workspaces.requestRevision(id, u.id);
    return { workspace: ws };
  }

  @Roles(UserRole.BUYER)
  @Post(':id/messages')
  async addMessage(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Body() body: AddMessageDto,
  ) {
    const msg = await this.workspaces.addMessage(
      id,
      u.id,
      body.content,
      body.attachments,
      body.type ?? 'text',
    );
    return { message: msg };
  }

  @Roles(UserRole.BUYER)
  @Get(':id/messages')
  async listMessages(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Query() q: ListMessageQueryDto,
  ) {
    return this.workspaces.listMessages(id, u.id, q);
  }
}