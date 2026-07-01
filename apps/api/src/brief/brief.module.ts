import { Module } from '@nestjs/common';
import { BriefService } from './brief.service';
import { BuyerBriefController, CreatorBriefController, AdminBriefOpsController } from './brief.controller';
import { BriefPushModule } from '../brief-push/brief-push.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [BriefPushModule, NotificationsModule],
  controllers: [BuyerBriefController, CreatorBriefController, AdminBriefOpsController],
  providers: [BriefService],
  exports: [BriefService],
})
export class BriefModule {}
