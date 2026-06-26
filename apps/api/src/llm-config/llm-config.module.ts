import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LlmConfigController } from './llm-config.controller';
import { LlmConfigService } from './llm-config.service';

@Module({
  imports: [AuthModule],
  controllers: [LlmConfigController],
  providers: [LlmConfigService],
  exports: [LlmConfigService],
})
export class LlmConfigModule {}