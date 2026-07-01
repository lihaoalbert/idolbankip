import { Module } from '@nestjs/common';
import { PlatformJudgeService } from './platform-judge.service';
import { PlatformJudgeController } from './platform-judge.controller';
import { LlmConfigModule } from '../llm-config/llm-config.module';

@Module({
  imports: [LlmConfigModule],
  controllers: [PlatformJudgeController],
  providers: [PlatformJudgeService],
  exports: [PlatformJudgeService],
})
export class PlatformJudgeModule {}
