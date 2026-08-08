/**
 * #30.6 AI controller — 四个端点
 *   POST /ai/recognize-face    (CREATOR 角色) — 面部特写 → IP 元数据
 *   POST /ai/generate-image    (CREATOR 角色) — 面部特写 + 小传 → AI 出图(三视图/立绘/表情矩阵)
 *   POST /ai/generate-recipe   (CREATOR 角色) — IP 信息 → AI 写 Prompt 说明书 (.md)
 *   POST /ai/suggest-task      (ADMIN 角色)   — 任务描述 → 任务 spec
 */
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/util/roles.util';
import { AiService } from './ai.service';
import { RecognizeFaceDto } from './dto/recognize-face.dto';
import { SuggestTaskDto } from './dto/suggest-task.dto';
import { GenerateImageDto } from './dto/generate-image.dto';

class GenerateRecipeDto {
  @IsString()
  ipId!: string;
}

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

  /**
   * #30.6.15 AI 生成图片 (通义万相) — 创作者侧
   * body: { ipId, imageType: THREE_VIEW | EXPRESSION_GRID | TRANSPARENT_RENDER, promptOverride? }
   * 返回: { fileId, assetType, ossKey }
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Post('generate-image')
  async generateImage(@CurrentUser() u: JwtUser, @Body() body: GenerateImageDto) {
    return this.ai.generateImage(u.id, body.ipId, body.imageType, body.size, body.promptOverride);
  }

  /**
   * #30.6.16 AI 生成 Prompt 说明书 (.md) — 创作者侧
   * body: { ipId }
   * 返回: { fileId, assetType, ossKey }
   * 买家拿去 ComfyUI / SD WebUI 直接复现 IP
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Post('generate-recipe')
  async generateRecipe(@CurrentUser() u: JwtUser, @Body() body: GenerateRecipeDto) {
    return this.ai.generateRecipe(u.id, body.ipId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('suggest-task')
  async suggestTask(@CurrentUser() u: JwtUser, @Body() body: SuggestTaskDto) {
    const result = await this.ai.suggestTask(u.id, body.description);
    return { fields: result };
  }
}