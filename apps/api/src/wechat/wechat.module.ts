import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WechatService } from './wechat.service';

/**
 * WeChat 模块 — W2 #29 推送通知
 *
 * 不依赖外部 SDK (curl 即可),mock 模式只打日志。
 */
@Module({
  imports: [ConfigModule],
  providers: [WechatService],
  exports: [WechatService],
})
export class WechatModule {}
