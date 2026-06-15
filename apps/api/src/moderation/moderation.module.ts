import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ModerationService } from './moderation.service';
import {
  MODERATION_CLIENT,
  MockModerationClient,
} from '@ibi-ren/shared-contracts';

@Module({
  imports: [ConfigModule],
  providers: [
    ModerationService,
    {
      provide: MODERATION_CLIENT,
      useClass: MockModerationClient,
    },
  ],
  exports: [ModerationService],
})
export class ModerationModule {}