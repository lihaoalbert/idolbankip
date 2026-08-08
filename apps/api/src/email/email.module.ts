import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';

/**
 * Email 模块 — W2 #29 推送通知
 *
 * 不导入其他业务模块,只是 Config-driven 的薄包装服务。
 * 其它模块 (brief / copyright / KYC 等) 需要发邮件时 import 这个 module 拿 EmailService。
 */
@Module({
  imports: [ConfigModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
