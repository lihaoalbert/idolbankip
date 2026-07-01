import { Module } from '@nestjs/common';
import { BriefService } from './brief.service';
import { BuyerBriefController, CreatorBriefController, AdminBriefOpsController } from './brief.controller';
import { BriefPushModule } from '../brief-push/brief-push.module';

@Module({
  imports: [BriefPushModule],
  controllers: [BuyerBriefController, CreatorBriefController, AdminBriefOpsController],
  providers: [BriefService],
  exports: [BriefService],
})
export class BriefModule {}
