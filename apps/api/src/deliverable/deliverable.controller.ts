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
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/util/roles.util';
import {
  DeliverableService,
  SUPPORTED_DELIVERABLE_TYPES,
  SUPPORTED_PLATFORMS,
} from './deliverable.service';

class CreateDeliverableDto {
  @IsIn(SUPPORTED_DELIVERABLE_TYPES) type!: string;
  @IsIn(SUPPORTED_PLATFORMS) platform!: string;
  @IsString() @MinLength(5) url!: string;
  @IsOptional() @IsString() thumbnailUrl?: string;
  @IsObject() spec!: Record<string, unknown>;
}

class ListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) size?: number;
  @IsOptional() @IsString() status?: string;
}

class ReviewDto {
  @IsIn(['approved', 'rejected']) decision!: 'approved' | 'rejected';
  @IsOptional() @IsString() rejectedReason?: string;
}

class PublishDto {
  @IsString() @IsUrl({ require_tld: false }) publishedUrl!: string;
}

@ApiTags('deliverable')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('creator/workspaces/:workspaceId/deliverables')
export class CreatorDeliverableController {
  constructor(private readonly deliverable: DeliverableService) {}

  @Roles(UserRole.CREATOR)
  @Post()
  async create(
    @CurrentUser() u: JwtUser,
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateDeliverableDto,
  ) {
    const d = await this.deliverable.create(workspaceId, u.id, body);
    return { deliverable: d };
  }

  @Roles(UserRole.CREATOR)
  @Get()
  async list(
    @CurrentUser() u: JwtUser,
    @Param('workspaceId') workspaceId: string,
    @Query() q: ListQueryDto,
  ) {
    return this.deliverable.listByWorkspace(workspaceId, u.id, q);
  }
}

@ApiTags('deliverable')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('creator/deliverables')
export class CreatorDeliverableItemController {
  constructor(private readonly deliverable: DeliverableService) {}

  @Roles(UserRole.CREATOR)
  @Post(':id/publish')
  async markPublished(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Body() body: PublishDto,
  ) {
    const d = await this.deliverable.markPublished(id, u.id, body.publishedUrl);
    return { deliverable: d };
  }
}

@ApiTags('deliverable')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('buyer/workspaces/:workspaceId/deliverables')
export class BuyerDeliverableController {
  constructor(private readonly deliverable: DeliverableService) {}

  @Roles(UserRole.BUYER)
  @Get()
  async list(
    @CurrentUser() u: JwtUser,
    @Param('workspaceId') workspaceId: string,
    @Query() q: ListQueryDto,
  ) {
    return this.deliverable.listByWorkspace(workspaceId, u.id, q);
  }
}

@ApiTags('deliverable')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('buyer/deliverables')
export class BuyerDeliverableItemController {
  constructor(private readonly deliverable: DeliverableService) {}

  /** 买家审批 — pending → approved / rejected */
  @Roles(UserRole.BUYER)
  @Post(':id/review')
  async review(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Body() body: ReviewDto,
  ) {
    const d = await this.deliverable.reviewByBuyer(
      id,
      u.id,
      body.decision,
      body.rejectedReason,
    );
    return { deliverable: d };
  }
}

@ApiTags('deliverable')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('buyer/workbench')
export class BuyerWorkbenchController {
  constructor(private readonly deliverable: DeliverableService) {}

  /** 买家工作台 — 跨 workspace 列出所有待处理 deliverable */
  @Roles(UserRole.BUYER)
  @Get()
  async list(@CurrentUser() u: JwtUser, @Query() q: ListQueryDto) {
    return this.deliverable.listForBuyer(u.id, q);
  }
}