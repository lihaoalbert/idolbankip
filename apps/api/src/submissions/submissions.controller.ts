import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../common/util/roles.util';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { SubmissionsService } from './submissions.service';

class CreateSubmissionDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true })
  ossKeys!: string[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

class CommentDto {
  @IsString() @MinLength(1) @MaxLength(2000) content!: string;
}

class SetStatusDto {
  @IsIn(['approved', 'rejected']) status!: 'approved' | 'rejected';
}

@ApiTags('submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class SubmissionsController {
  constructor(private readonly subs: SubmissionsService) {}

  // 创作者上传中间稿
  @Roles(UserRole.CREATOR)
  @Post('creator/workspaces/:workspaceId/submissions')
  async create(
    @CurrentUser() u: JwtUser,
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateSubmissionDto,
  ) {
    const submission = await this.subs.create(workspaceId, u.id, body);
    return { submission };
  }

  // 双方都能列(中间稿列表)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('workspaces/:workspaceId/submissions')
  async list(
    @CurrentUser() u: JwtUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.subs.list(workspaceId, u.id);
  }

  // 买家改状态(approved / rejected)
  @Roles(UserRole.BUYER)
  @Post('buyer/submissions/:id/status')
  async setStatus(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Body() body: SetStatusDto,
  ) {
    const submission = await this.subs.setStatus(id, u.id, body.status);
    return { submission };
  }

  // 双方都能评论
  @Post('submissions/:id/comments')
  async addComment(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Body() body: CommentDto,
  ) {
    const comment = await this.subs.addComment(id, u.id, body.content);
    return { comment };
  }
}