/**
 * AI 助手 module
 *
 * 依赖:
 *   - PrismaModule: 写 AssistantCallLog (审计)
 *   - AiModule: 复用 AiService.chat() — 不重新接 LLM client
 *   - UploadModule: W6-R7 chat-with-attachments 落 OSS public 桶
 *
 * 不依赖 AuthModule: JwtAuthGuard 直接从 common/guards 复用, 不需要导出 AuthService。
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { UploadModule } from '../upload/upload.module';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';

@Module({
  imports: [PrismaModule, AiModule, UploadModule],
  providers: [AssistantService],
  controllers: [AssistantController],
})
export class AssistantModule {}