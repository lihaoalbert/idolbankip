import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthWechatController } from './auth-wechat.controller';
import { AuthWechatService } from './auth-wechat.service';
import { WechatOAuthService } from './wechat-oauth.service';
import { WechatOAuthMockDriver } from './wechat-oauth.mock.driver';
import { WechatOAuthRealDriver } from './wechat-oauth.real.driver';
import { WECHAT_OAUTH_DRIVER } from './wechat-oauth.token';
import { SmsModule } from '../sms/sms.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [SmsModule, AuthModule, UsersModule],
  controllers: [AuthWechatController],
  providers: [
    AuthWechatService,
    WechatOAuthService,
    WechatOAuthMockDriver,
    WechatOAuthRealDriver,
    {
      provide: WECHAT_OAUTH_DRIVER,
      inject: [ConfigService, WechatOAuthMockDriver, WechatOAuthRealDriver],
      useFactory: (
        config: ConfigService,
        mock: WechatOAuthMockDriver,
        real: WechatOAuthRealDriver,
      ) => {
        const driver = config.get<string>('WECHAT_OAUTH_DRIVER', 'mock');
        const log = new Logger('WechatOAuthDriver');
        log.log(`[wechat-oauth] driver=${driver}`);
        return driver === 'real' ? real : mock;
      },
    },
  ],
  exports: [AuthWechatService],
})
export class AuthWechatModule {}