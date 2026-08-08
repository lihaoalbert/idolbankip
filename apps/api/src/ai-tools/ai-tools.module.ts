import { Module } from '@nestjs/common';
import { AiToolsService } from './ai-tools.service';
import {
  BuyerAiToolsController,
  CreatorAiToolsController,
} from './ai-tools.controller';

@Module({
  controllers: [BuyerAiToolsController, CreatorAiToolsController],
  providers: [AiToolsService],
  exports: [AiToolsService],
})
export class AiToolsModule {}