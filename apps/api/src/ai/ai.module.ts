/**
 * #30.6 AI module — 提供 recognizeFace / suggestTask / generateImage 服务
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { DashScopeProvider } from './dashscope.provider';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadModule } from '../upload/upload.module';
import { HonorModule } from '../honor/honor.module';
import { LlmConfigModule } from '../llm-config/llm-config.module';

@Module({
  imports: [ConfigModule, PrismaModule, UploadModule, HonorModule, LlmConfigModule],
  providers: [AiService, DashScopeProvider],
  controllers: [AiController],
  exports: [AiService, DashScopeProvider],
})
export class AiModule {}