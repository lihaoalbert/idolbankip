/**
 * AI 助手 controller — POST /assistant/chat + /assistant/chat-with-attachments
 *
 * 鉴权: JwtAuthGuard(任何登录用户); 不限角色(CREATOR/BUYER/ADMIN 都能用)
 * 限流:
 *   - /chat: 20/min (JSON 单聊)
 *   - /chat-with-attachments: 10/min (multipart, 成本更高 + 落 OSS)
 *
 * 注意: 历史 (GET /assistant/history) 不需要 — plan 里明确"前端 localStorage 持久化,后端不存"。
 */
import { Body, Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { AssistantService } from './assistant.service';
import { ChatDto } from './dto/chat.dto';
import { BadRequestException } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * multipart 端点 body — 跟 ChatDto 类似, 但 history / routeContext 以 JSON string 形式随 form 上传
 * (multipart/form-data 没有结构化 body, 客户端需要 JSON.stringify 后塞到 form field)
 */
class ChatWithAttachmentsBody {
  @IsString() @MaxLength(2000)
  message!: string;

  @IsOptional() @IsString() @MaxLength(20000)
  historyRaw?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  routeContextRaw?: string;
}

@ApiTags('assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assistant')
@Throttle({ default: { limit: 20, ttl: 60_000 } }) // 默认 20/min, 下面 chat-with-attachments 单独覆盖
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  /** W6-R1 主入口 — JSON 单聊 */
  @Post('chat')
  async chat(@CurrentUser() user: JwtUser, @Body() dto: ChatDto) {
    return this.service.chat(user.id, user.roles ?? [], dto);
  }

  /**
   * W6-R7: 多模态 chat — multipart/form-data 上传 files + 文字 message
   *
   * 设计:
   *   - 限流更严 (10/min vs chat 20/min)
   *   - 5 个文件 + 单文件 50MB 上限 (FileInterceptor 限制)
   *   - image/* 类型喂 LLM 多模态, 其它挂 context metadata
   *   - 落 OSS public 桶, 1 月 CDN 缓存, 过期不补
   *
   * curl 示例:
   *   curl -X POST https://ibi.ren/api/v1/assistant/chat-with-attachments \
   *     -H "Authorization: Bearer $TOKEN" \
   *     -F "message=看看这张脸帮我写人物小传" \
   *     -F "files=@face.jpg"
   */
  @Post('chat-with-attachments')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async chatWithAttachments(
    @CurrentUser() user: JwtUser,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() body: ChatWithAttachmentsBody,
  ) {
    if (!body.message || body.message.trim() === '') {
      throw new BadRequestException('message 不能为空');
    }
    const list = files ?? [];
    if (list.length > 5) {
      throw new BadRequestException('附件最多 5 个');
    }
    // history + routeContext 是 JSON string, parse 后透传
    let history: any;
    let routeContext: any;
    try {
      history = body.historyRaw ? JSON.parse(body.historyRaw) : undefined;
    } catch {
      throw new BadRequestException('historyRaw 不是合法 JSON');
    }
    try {
      routeContext = body.routeContextRaw ? JSON.parse(body.routeContextRaw) : undefined;
    } catch {
      throw new BadRequestException('routeContextRaw 不是合法 JSON');
    }
    return this.service.chatWithAttachments(
      user.id,
      user.roles ?? [],
      body.message,
      list,
      history,
      routeContext,
    );
  }
}