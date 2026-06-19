/**
 * #30.6 AI controller — 两个端点
 *   POST /ai/recognize-face  (CREATOR 角色) — 面部特写 → IP 元数据
 *   POST /ai/suggest-task    (ADMIN 角色)   — 任务描述 → 任务 spec
 */
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/util/roles.util';
import { AiService } from './ai.service';
import { RecognizeFaceDto } from './dto/recognize-face.dto';
import { SuggestTaskDto } from './dto/suggest-task.dto';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Post('recognize-face')
  async recognizeFace(@CurrentUser() u: JwtUser, @Body() body: RecognizeFaceDto) {
    const result = await this.ai.recognizeFace(u.id, body.fileId);
    return { fields: result };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('suggest-task')
  async suggestTask(@CurrentUser() u: JwtUser, @Body() body: SuggestTaskDto) {
    const result = await this.ai.suggestTask(u.id, body.description);
    return { fields: result };
  }
}