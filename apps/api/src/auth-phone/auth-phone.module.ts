import { Module } from '@nestjs/common';
import { AuthPhoneController } from './auth-phone.controller';
import { AuthPhoneService } from './auth-phone.service';
import { SmsModule } from '../sms/sms.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [SmsModule, AuthModule, UsersModule],
  controllers: [AuthPhoneController],
  providers: [AuthPhoneService],
  exports: [AuthPhoneService],
})
export class AuthPhoneModule {}
