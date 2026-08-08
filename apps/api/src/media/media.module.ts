import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CreatorTranscodeController } from './media.controller';
import { MockMtsService, MtsService, MtsServiceFactory } from './mts.service';

@Module({
  imports: [ConfigModule],
  controllers: [CreatorTranscodeController],
  providers: [MockMtsService, MtsServiceFactory, MtsService],
  exports: [MtsService],
})
export class MediaModule {}