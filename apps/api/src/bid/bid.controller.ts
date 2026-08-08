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
import { BidService } from './bid.service';

class CreateBidDto {
  @IsNumber() @Min(0) price!: number;
  @IsInt() @Min(1) deliveryDays!: number;
  @IsString() @MinLength(10) @MaxLength(2000) proposal!: string;
}

class ListBidQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) size?: number;
}

@ApiTags('bids')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('creator/briefs/:briefId/bids')
export class CreatorBidController {
  constructor(private readonly bids: BidService) {}

  // 创作者对某个 brief 报价 — POST /api/v1/creator/briefs/:briefId/bids
  @Roles(UserRole.CREATOR)
  @Post()
  async create(
    @CurrentUser() u: JwtUser,
    @Param('briefId') briefId: string,
    @Body() body: CreateBidDto,
  ) {
    return this.bids.create(u.id, briefId, body);
  }

  // 创作者撤回自己的报价
  @Roles(UserRole.CREATOR)
  @Post(':bidId/withdraw')
  async withdraw(
    @CurrentUser() u: JwtUser,
    @Param('briefId') briefId: string,
    @Param('bidId') bidId: string,
  ) {
    return this.bids.withdraw(bidId, u.id, briefId);
  }

  // 创作者查自己报过的所有 bid
  @Roles(UserRole.CREATOR)
  @Get('mine')
  async listMine(@CurrentUser() u: JwtUser, @Query() q: ListBidQueryDto) {
    return this.bids.listByCreator(u.id, q);
  }
}

// 买家侧 — 查看 brief 的所有 bid,并接受/拒绝
@ApiTags('bids')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('buyer/briefs/:briefId/bids')
export class BuyerBidController {
  constructor(private readonly bids: BidService) {}

  // 买家查 brief 的所有 bid
  @Roles(UserRole.BUYER)
  @Get()
  async listForBrief(
    @CurrentUser() u: JwtUser,
    @Param('briefId') briefId: string,
    @Query() q: ListBidQueryDto,
  ) {
    return this.bids.listForBuyer(u.id, briefId, q);
  }

  // 买家接受某个 bid(中标,其他 bid 自动 rejected,创建 workspace)
  @Roles(UserRole.BUYER)
  @Post(':bidId/accept')
  async accept(
    @CurrentUser() u: JwtUser,
    @Param('briefId') briefId: string,
    @Param('bidId') bidId: string,
  ) {
    return this.bids.accept(bidId, u.id, briefId);
  }

  // 买家拒绝某个 bid
  @Roles(UserRole.BUYER)
  @Post(':bidId/reject')
  async reject(
    @CurrentUser() u: JwtUser,
    @Param('briefId') briefId: string,
    @Param('bidId') bidId: string,
  ) {
    return this.bids.reject(bidId, u.id, briefId);
  }
}