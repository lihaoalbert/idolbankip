import { Module } from '@nestjs/common';
import { AuthPhoneController } from './auth-phone.controller';
import { AuthPhoneService } from './auth-phone.service';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [SmsModule],
  controllers: [AuthPhoneController],
  providers: [AuthPhoneService],
  exports: [AuthPhoneService],
})
export class AuthPhoneModule {}
