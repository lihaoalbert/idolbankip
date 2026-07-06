import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { Request, Response } from 'express';
import type { WechatExchangeDto } from './dto/exchange.dto';
import type { WechatBindDto } from './dto/bind.dto';

/**
 * AuthWechatService — W3 W1 D3 骨架
 * D5 接入 WechatOAuthState + 微信开放平台 OAuth 真实流程
 */
@Injectable()
export class AuthWechatService {
  private readonly logger = new Logger(AuthWechatService.name);

  async getQrUrl(_req: Request) {
    this.logger.warn('getQrUrl — D5 待实现');
    throw new NotImplementedException('D5 实现');
  }

  async poll(_state: string) {
    this.logger.warn('poll — D5 待实现');
    throw new NotImplementedException('D5 实现');
  }

  async exchange(_dto: WechatExchangeDto) {
    this.logger.warn('exchange — D5 待实现');
    throw new NotImplementedException('D5 实现');
  }

  async callback(_code: string, _state: string, _res: Response) {
    this.logger.warn('callback — D5 待实现');
    throw new NotImplementedException('D5 实现');
  }

  async bind(_dto: WechatBindDto, _req: Request) {
    this.logger.warn('bind — D5 待实现');
    throw new NotImplementedException('D5 实现');
  }

  async unbind(_req: Request) {
    this.logger.warn('unbind — D5 待实现');
    throw new NotImplementedException('D5 实现');
  }
}
