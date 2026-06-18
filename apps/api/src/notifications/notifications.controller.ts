import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

class ListQueryDto {
  @IsOptional() unreadOnly?: string;
  @IsOptional() limit?: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  async list(@CurrentUser() u: JwtUser, @Query() q: ListQueryDto) {
    return this.svc.listForUser(u.id, {
      unreadOnly: q.unreadOnly === 'true',
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() u: JwtUser) {
    return { count: await this.svc.unreadCount(u.id) };
  }

  @Patch(':id/read')
  async markRead(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.svc.markRead(u.id, id);
  }

  @Post('mark-all-read')
  async markAllRead(@CurrentUser() u: JwtUser) {
    return this.svc.markAllRead(u.id);
  }
}