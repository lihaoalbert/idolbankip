import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotImplementedException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthWechatService } from './auth-wechat.service';
import { WechatExchangeDto } from './dto/exchange.dto';
import { WechatBindDto } from './dto/bind.dto';

/**
 * AuthWechatController — W3 W1 D3 骨架
 *
 * 端点:
 *   GET  /qr-url              — 拿扫码 URL + state
 *   GET  /poll?state          — 前端轮询扫码结果
 *   POST /exchange            — 前端拿 code+state 换 token
 *   GET  /callback            — 微信 302 直跳, 校验后 302 到前端
 *   POST /bind                — 已登录用户绑微信 或 LOGIN 流程补手机号
 *   POST /unbind              — 解绑 (需有 password 或 phone)
 */
@Controller('auth/wechat')
export class AuthWechatController {
  constructor(private readonly service: AuthWechatService) {}

  @Get('qr-url')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async getQrUrl(@Req() req: Request) {
    return this.service.getQrUrl(req);
  }

  @Get('poll')
  async poll(@Query('state') state: string) {
    return this.service.poll(state);
  }

  @Post('exchange')
  @HttpCode(200)
  async exchange(@Body() dto: WechatExchangeDto) {
    return this.service.exchange(dto);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    return this.service.callback(code, state, res);
  }

  @Post('bind')
  @HttpCode(200)
  async bind(@Body() dto: WechatBindDto, @Req() req: Request) {
    return this.service.bind(dto, req);
  }

  @Post('unbind')
  @HttpCode(200)
  async unbind(@Req() req: Request) {
    return this.service.unbind(req);
  }
}
