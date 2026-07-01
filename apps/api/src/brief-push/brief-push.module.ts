import { Module } from '@nestjs/common';
import { BriefPushService } from './brief-push.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { WechatModule } from '../wechat/wechat.module';

@Module({
  imports: [NotificationsModule, EmailModule, WechatModule],
  providers: [BriefPushService],
  exports: [BriefPushService],
})
export class BriefPushModule {}
