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
import { RegistrationStage } from '@prisma/client';
import { CopyrightService } from './copyright.service';
import { CopyrightFeeResolver } from './copyright-fee.resolver';
import { DraftRegistrationDto } from './dto/draft-registration.dto';
import { AdminAcceptDto, AdminCertifyDto, AdminRejectDto } from './dto/admin-copyright.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../common/util/roles.util';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

/**
 * Creator 端 — 著作权登记申请流.
 * /ips/:id/copyright-reg/* — 创作者对自己的 IP 操作
 */
@ApiTags('copyright')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CREATOR)
@Controller('ips/:id/copyright-reg')
export class CopyrightController {
  constructor(
    private readonly service: CopyrightService,
    private readonly feeResolver: CopyrightFeeResolver,
  ) {}

  /** 查当前申请状态 */
  @Get()
  get(@Param('id') ipId: string, @CurrentUser() user: JwtUser) {
    return this.service.getForCreator(ipId, user.id);
  }

  /** 创建/更新 DRAFT */
  @Post('draft')
  draft(
    @Param('id') ipId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: DraftRegistrationDto,
  ) {
    return this.service.upsertDraft(ipId, user.id, dto);
  }

  /** 提交申请 DRAFT → SUBMITTED, snapshot fee */
  @Post('submit')
  submit(@Param('id') ipId: string, @CurrentUser() user: JwtUser) {
    return this.service.submit(ipId, user.id);
  }

  /** 撤回 */
  @Post('withdraw')
  withdraw(@Param('id') ipId: string, @CurrentUser() user: JwtUser) {
    return this.service.withdraw(ipId, user.id);
  }

  /** 下载 PDF 申请包 (Commit 2 完整实现) */
  @Get('pdf')
  pdf(@Param('id') ipId: string, @CurrentUser() user: JwtUser) {
    return this.service.downloadPdf(ipId, user.id);
  }
}

/**
 * 价格表 (公开,前端表单用)
 */
@ApiTags('copyright')
@Controller('copyright-fee-config')
export class CopyrightFeeConfigController {
  constructor(private readonly resolver: CopyrightFeeResolver) {}

  @Public()
  @Get()
  get() {
    return this.resolver.getPublicConfig();
  }
}

/**
 * Admin 端 — 著作权申请队列 + 状态推进.
 * /admin/copyright-reg/* — 平台代办员/审核员
 */
@ApiTags('copyright-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/copyright-reg')
export class AdminCopyrightController {
  constructor(private readonly service: CopyrightService) {}

  @Get('queue')
  queue(
    @Query('stage') stage?: RegistrationStage,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.service.listQueue(stage, Number(page), Number(pageSize));
  }

  @Get(':ipId')
  detail(@Param('ipId') ipId: string) {
    return this.service.getAdminDetail(ipId);
  }

  @Post(':ipId/accept')
  accept(@Param('ipId') ipId: string, @CurrentUser() user: JwtUser, @Body() dto: AdminAcceptDto) {
    return this.service.adminAccept(ipId, user.id, dto.applicationNo);
  }

  @Post(':ipId/under-review')
  underReview(@Param('ipId') ipId: string, @CurrentUser() user: JwtUser) {
    return this.service.adminUnderReview(ipId, user.id);
  }

  @Post(':ipId/certify')
  certify(@Param('ipId') ipId: string, @CurrentUser() user: JwtUser, @Body() dto: AdminCertifyDto) {
    return this.service.adminCertify(ipId, user.id, dto.certificateNo);
  }

  @Post(':ipId/reject')
  reject(@Param('ipId') ipId: string, @CurrentUser() user: JwtUser, @Body() dto: AdminRejectDto) {
    return this.service.adminReject(ipId, user.id, dto.reason);
  }
}