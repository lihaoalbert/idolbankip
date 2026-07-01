import { Module } from '@nestjs/common';
import { BriefService } from './brief.service';
import { BuyerBriefController, CreatorBriefController, AdminBriefOpsController } from './brief.controller';

@Module({
  controllers: [BuyerBriefController, CreatorBriefController, AdminBriefOpsController],
  providers: [BriefService],
  exports: [BriefService],
})
export class BriefModule {}