import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreditScoreService } from './credit.service';

/**
 * W5 E3 — 信用分接口
 *
 * GET /api/v1/users/:userId/credit-score?as=creator|buyer
 *  - 公开数据,默认 as=creator (创作者角色权重)
 *  - 不强制 JWT,但保留 UseGuards 装饰 (后续按需放开)
 */
@ApiTags('credit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users/:userId/credit-score')
export class CreditScoreController {
  constructor(private readonly credit: CreditScoreService) {}

  @Get()
  async get(
    @Param('userId') userId: string,
    @Query('as') as?: string,
  ) {
    const role = as === 'buyer' ? 'buyer' : 'creator';
    return this.credit.compute(userId, role);
  }
}
