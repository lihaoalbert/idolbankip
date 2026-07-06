import { Module } from '@nestjs/common';
import { AuthWechatController } from './auth-wechat.controller';
import { AuthWechatService } from './auth-wechat.service';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [SmsModule],
  controllers: [AuthWechatController],
  providers: [AuthWechatService],
  exports: [AuthWechatService],
})
export class AuthWechatModule {}
