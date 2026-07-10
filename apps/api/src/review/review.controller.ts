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
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/util/roles.util';
import { ReviewService } from './review.service';

class CreateReviewDto {
  @IsIn(['buyer_to_creator', 'creator_to_buyer']) role!: 'buyer_to_creator' | 'creator_to_buyer';
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number;
  @IsString() @MinLength(5) @MaxLength(1000) content!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) tags?: string[];
}

@ApiTags('review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('briefs/:briefId/reviews')
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  /**
   * 双方都可调 — 但 role 必须匹配调用方身份
   */
  @Post()
  async create(
    @CurrentUser() u: JwtUser,
    @Param('briefId') briefId: string,
    @Body() body: CreateReviewDto,
  ) {
    const review = await this.reviews.create(
      briefId,
      u.id,
      body.role,
      body.rating,
      body.content,
      body.tags,
    );
    return { review };
  }

  @Get()
  async list(@Param('briefId') briefId: string) {
    const items = await this.reviews.listByBrief(briefId);
    return { items, total: items.length };
  }
}

@ApiTags('review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/:userId/reviews')
export class UserReviewController {
  constructor(private readonly reviews: ReviewService) {}

  /** 创作者主页用 — 列某人收到的所有评价 */
  @Get()
  async listReceived(
    @Param('userId') userId: string,
    @Query('limit') _limit?: string,
  ) {
    const items = await this.reviews.listReceivedByUser(userId);
    return { items, total: items.length };
  }

  /** 信用分算法用 — 返回 avgRating + count 摘要 */
  @Get('summary')
  async summary(@Param('userId') userId: string) {
    return this.reviews.getUserRatingSummary(userId);
  }
}