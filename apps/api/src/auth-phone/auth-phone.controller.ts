import { Body, Controller, HttpCode, NotImplementedException, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthPhoneService } from './auth-phone.service';
import { SendPhoneCodeDto } from './dto/send-code.dto';
import { PhoneLoginDto } from './dto/login.dto';

/**
 * AuthPhoneController — W3 W1 D3 骨架
 * D4 接入 PhoneVerifyCode + SmsService 全链路
 */
@Controller('auth/phone')
export class AuthPhoneController {
  constructor(private readonly service: AuthPhoneService) {}

  @Post('send-code')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // IP 5/min
  async sendCode(@Body() dto: SendPhoneCodeDto, @Req() req: Request) {
    return this.service.sendCode(dto.phone, req);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: PhoneLoginDto, @Req() req: Request) {
    return this.service.login(dto, req);
  }
}
