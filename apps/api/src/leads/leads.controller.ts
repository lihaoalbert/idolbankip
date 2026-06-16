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
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/util/roles.util';
import { LeadsService } from './leads.service';

class CreateLeadDto {
  @IsString() @MinLength(2) @MaxLength(64) name!: string;
  @IsOptional() @IsString() @MaxLength(128) company?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(64) wechat?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(2) @MaxLength(2000) message!: string;
  @IsOptional() @IsString() @MaxLength(64) source?: string;
}

class UpdateLeadStatusDto {
  @IsString() @IsIn(['NEW', 'CONTACTED', 'CLOSED']) status!: 'NEW' | 'CONTACTED' | 'CLOSED';
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  /**
   * 公开留资 — 任何人都可以提交,不需登录
   * 受 Throttler 60/min 全局限流保护
   */
  @Public()
  @Post()
  async create(@Body() body: CreateLeadDto) {
    const lead = await this.leads.create(body);
    return { lead };
  }

  /**
   * 后台: 列出全部留资
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  async list(@Query('status') status?: string) {
    const items = await this.leads.list(status);
    return { items };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateLeadStatusDto) {
    const lead = await this.leads.update(id, body);
    return { lead };
  }
}