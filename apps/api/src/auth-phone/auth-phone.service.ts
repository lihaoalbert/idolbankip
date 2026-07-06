import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { Request } from 'express';
import { SmsService } from '../sms/sms.service';
import type { PhoneLoginDto } from './dto/login.dto';

/**
 * AuthPhoneService — W3 W1 D3 骨架
 * D4 接入 PhoneVerifyCode 表 + 校验 + 用户创建, 走 AuthService.issueTokens
 */
@Injectable()
export class AuthPhoneService {
  private readonly logger = new Logger(AuthPhoneService.name);

  constructor(private readonly sms: SmsService) {}

  async sendCode(phone: string, _req: Request) {
    // D4 在此: 查 throttle → 生成 code → 写 PhoneVerifyCode → 调 SmsService.sendLoginCode
    this.logger.warn(`sendCode(phone=${phone}) — D4 待实现, 当前为骨架`);
    throw new NotImplementedException('D4 实现');
  }

  async login(dto: PhoneLoginDto, _req: Request) {
    this.logger.warn(`login(phone=${dto.phone}) — D4 待实现, 当前为骨架`);
    throw new NotImplementedException('D4 实现');
  }
}
