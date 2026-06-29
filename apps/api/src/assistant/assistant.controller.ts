/**
 * AI 助手 controller — POST /assistant/chat
 *
 * 鉴权: JwtAuthGuard(任何登录用户); 不限角色(CREATOR/BUYER/ADMIN 都能用)
 * 限流: 全局 300/min + 本端点 20/min (@Throttle)
 *
 * 注意: 历史 (GET /assistant/history) 不需要 — plan 里明确"前端 localStorage 持久化,后端不存"。
 */
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { AssistantService } from './assistant.service';
import { ChatDto } from './dto/chat.dto';

@ApiTags('assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assistant')
@Throttle({ default: { limit: 20, ttl: 60_000 } }) // 20 次/分钟 — 防 token 滥用
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  @Post('chat')
  async chat(@CurrentUser() user: JwtUser, @Body() dto: ChatDto) {
    return this.service.chat(user.id, user.roles ?? [], dto);
  }
}