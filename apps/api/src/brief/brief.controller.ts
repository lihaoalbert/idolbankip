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
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { UserRole } from '../common/util/roles.util';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { BriefService, BriefFilter } from './brief.service';

// #30.7.1 AIGC 众包 — Brief 发包单
// 状态机: draft → bidding → in_progress → delivered → closed (disputed 是分支)
const BRIEF_CATEGORIES = ['ad', 'shortvideo', 'livestream_clip', 'poster', '3d'] as const;
const BRIEF_PACKAGES = ['essential', 'standard', 'premium'] as const;
const BRIEF_STATUSES = [
  'draft',
  'bidding',
  'in_progress',
  'delivered',
  'closed',
  'disputed',
] as const;

class CreateBriefDto {
  @IsString() @MinLength(5) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() category!: string;
  @IsArray() @IsString({ each: true }) platformSet!: string[];
  @IsArray() @IsString({ each: true }) ipIds!: string[];
  @IsNumber() @Min(0) budgetMin!: number;
  @IsNumber() @Min(0) budgetMax!: number;
  @IsString() packageTier!: string;
  @IsDateString() deadlineAt!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
}

class UpdateBriefDto {
  @IsOptional() @IsString() @MinLength(5) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) platformSet?: string[];
  @IsOptional() @IsNumber() @Min(0) budgetMin?: number;
  @IsOptional() @IsNumber() @Min(0) budgetMax?: number;
  @IsOptional() @IsString() packageTier?: string;
  @IsOptional() @IsDateString() deadlineAt?: string;
}

class ListBriefQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) size?: number;
}

// #30.7.1 W2 #28 动态调价 DTO
// percent: 加价幅度 (0, 100], 1-100
// confirmed: 超 2x 菜单价时的二次确认标记
class BumpBriefDto {
  @IsNumber() @Min(0.01) @Max(100) percent!: number;
  @IsOptional() @IsBoolean() confirmed?: boolean;
}

@ApiTags('briefs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('buyer/briefs')
export class BuyerBriefController {
  constructor(private readonly briefs: BriefService) {}

  // 买家发包 — POST /api/v1/buyer/briefs
  @Roles(UserRole.BUYER)
  @Post()
  async create(@CurrentUser() u: JwtUser, @Body() body: CreateBriefDto) {
    const brief = await this.briefs.create(u.id, body);
    return { brief };
  }

  // 买家查自己的 brief 列表
  @Roles(UserRole.BUYER)
  @Get()
  async listMine(@CurrentUser() u: JwtUser, @Query() q: ListBriefQueryDto) {
    const filter: BriefFilter = { ...q, buyerId: u.id };
    return this.briefs.list(filter);
  }

  // 买家查单个 brief
  @Roles(UserRole.BUYER)
  @Get(':id')
  async detail(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.briefs.getById(id, u.id);
  }

  // 买家编辑 brief(只在 draft / bidding 状态可改)
  @Roles(UserRole.BUYER)
  @Patch(':id')
  async update(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Body() body: UpdateBriefDto,
  ) {
    return this.briefs.update(id, u.id, body);
  }

  // 买家手动关闭 brief(没找到合适创作者时)
  @Roles(UserRole.BUYER)
  @Post(':id/close')
  async close(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.briefs.close(id, u.id);
  }

  // 买家发布 brief 进入 bidding(draft → bidding)
  @Roles(UserRole.BUYER)
  @Post(':id/publish')
  async publish(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.briefs.publish(id, u.id);
  }

  // 买家加价(动态调价机制 — 不设硬上限 + 3 道软护栏)
  // POST /api/v1/buyer/briefs/:id/bump  body: { percent, confirmed? }
  // 响应: { brief, needConfirm, overCap }
  //   needConfirm=true → 前端弹窗"我知这是高溢价"二次确认
  //   overCap=true → 加价后总价 > 2x 菜单价
  @Roles(UserRole.BUYER)
  @Post(':id/bump')
  async bump(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Body() body: BumpBriefDto,
  ) {
    return this.briefs.bumpPrice(id, u.id, body);
  }
}

// 创作者侧 — 浏览可抢单的 brief
@ApiTags('briefs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('creator/briefs')
export class CreatorBriefController {
  constructor(private readonly briefs: BriefService) {}

  // 创作者浏览公开的 bidding 状态 brief
  @Roles(UserRole.CREATOR)
  @Get()
  async listOpen(@CurrentUser() u: JwtUser, @Query() q: ListBriefQueryDto) {
    const filter: BriefFilter = { ...q, status: 'bidding', excludeBuyerId: u.id };
    return this.briefs.listPublic(filter);
  }

  // 创作者查单个 brief 详情(在 bidding 状态)
  @Roles(UserRole.CREATOR)
  @Get(':id')
  async detail(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.briefs.getPublicById(id);
  }
}

// #30.7.1 W2 #28 内部 ops 端 — 动态调价 cron 调用入口
// 由 Linux crontab 调,需 admin token;真实推送留到 W2-#29
@ApiTags('briefs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/briefs')
export class AdminBriefOpsController {
  constructor(private readonly briefs: BriefService) {}

  // GET /api/v1/admin/briefs/bump-recommendations
  // 返回 [{ briefId, hoursSincePublish, suggestedPercent, urgency }]
  // 调用方: crontab 6h 跑一次,命中后做推送
  @Get('bump-recommendations')
  async bumpRecommendations() {
    return { items: await this.briefs.getBumpRecommendations() };
  }
}