import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { HonorService } from './honor.service';

@ApiTags('honor')
@Controller()
export class HonorController {
  constructor(private readonly honor: HonorService) {}

  /** 当前用户的荣誉面板 (积分/等级/称号/连续/最近流水) */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('honor/me')
  async me(@CurrentUser() u: JwtUser) {
    return this.honor.getMe(u.id);
  }

  /**
   * 公开排行榜
   * ?period=week|month|all (默认 all), &limit=50
   */
  @Get('honor/leaderboard')
  async leaderboard(
    @Query('period') period?: 'week' | 'month' | 'all',
    @Query('limit') limitStr?: string,
  ) {
    const p: 'week' | 'month' | 'all' =
      period === 'week' || period === 'month' ? period : 'all';
    const limit = Math.max(1, Math.min(200, parseInt(limitStr ?? '50', 10) || 50));
    return this.honor.leaderboard(p, limit);
  }

  /**
   * 公开个人主页 — `/u/:userId` 用
   * 找不到用户返回 404
   */
  @Get('users/:userId/profile')
  async profile(@Param('userId') userId: string) {
    const data = await this.honor.getProfile(userId);
    if (!data) throw new NotFoundException('用户不存在');
    return data;
  }

  /** 公开 — 用户的已获徽章 */
  @Get('users/:userId/badges')
  async badges(@Param('userId') userId: string) {
    return this.honor.getUserBadges(userId);
  }
}