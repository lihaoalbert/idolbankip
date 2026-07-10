import { Module } from '@nestjs/common';
import { CreatorAssetsController } from './creator-assets.controller';
import { CreatorAssetsService } from './creator-assets.service';

@Module({
  controllers: [CreatorAssetsController],
  providers: [CreatorAssetsService],
  exports: [CreatorAssetsService],
})
export class CreatorAssetsModule {}