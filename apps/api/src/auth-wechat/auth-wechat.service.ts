/**
 * AuthWechatService — W3 W1 D5 微信扫码登录全链路
 *
 * 端点:
 *   - getQrUrl: 生成 state + 落 WechatOAuthState + 返 driver.getQrUrl()
 *   - poll: 前端轮询扫码结果 (waiting/scanned/expired/ok)
 *   - exchange: code+state → driver.exchangeCode() → 拿 openid → 查 user
 *     · openid 已绑 user X → 直接 loginOrThrow
 *     · openid 未绑 → 创建临时状态 + 返 needBindPhone (前端跳 BindPhonePage)
 *   - callback: 微信直跳, 校验 state 后 302 到前端 /auth/wechat/callback?code=&state=
 *   - bind: 已登录用户绑微信 (BIND 流程); 或 LOGIN 流程补手机号创建账号
 *   - unbind: 解绑 (需有 password 或 phone, 至少保留一种登录方式)
 *
 * 决策:
 *   - 同 openid 多次扫码: poll/exchange/callback 都幂等
 *   - mock 模式: code='mock' 即视为扫码成功
 *   - poll 频率: 前端控制 (建议 2s/次), 后端不限流
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { SmsService } from '../sms/sms.service';
import { WechatOAuthService } from './wechat-oauth.service';
import { serializeRoles, type UserRole } from '../common/util/roles.util';
import * as bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import type { WechatExchangeDto } from './dto/exchange.dto';
import type { WechatBindDto } from './dto/bind.dto';

type Purpose = 'LOGIN' | 'BIND';

@Injectable()
export class AuthWechatService {
  private readonly logger = new Logger(AuthWechatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly sms: SmsService,
    private readonly wechat: WechatOAuthService,
    private readonly config: ConfigService,
  ) {}

  private getRedirectUri(): string {
    return this.config.get<string>('WECHAT_OAUTH_REDIRECT_URI', 'https://ibi.ren/api/v1/auth/wechat/callback');
  }

  private getFrontendCallbackUrl(): string {
    // 微信回调 → /api/v1/auth/wechat/callback → 302 → 前端 /auth/wechat/callback?code&state
    return this.config.get<string>('WECHAT_OAUTH_FRONTEND_CALLBACK', 'https://ibi.ren/auth/wechat/callback');
  }

  /**
   * 生成 32 字节随机 state + 落 WechatOAuthState (10min TTL)
   */
  private async createState(purpose: Purpose, userId?: string): Promise<string> {
    const state = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.wechatOAuthState.create({
      data: { state, purpose, userId: userId ?? null, expiresAt },
    });
    return state;
  }

  /**
   * GET /qr-url
   */
  async getQrUrl(_req: Request): Promise<{ url: string; state: string; expiresAt: string }> {
    const state = await this.createState('LOGIN');
    const { url } = this.wechat.getQrUrl(state, this.getRedirectUri());
    const row = await this.prisma.wechatOAuthState.findUnique({ where: { state } });
    return { url, state, expiresAt: row!.expiresAt.toISOString() };
  }

  /**
   * GET /poll?state=...
   * 前端轮询: waiting | ok(token) | expired
   */
  async poll(state: string): Promise<{ status: 'waiting' | 'expired' } | { status: 'ok'; token: string; user: any; isNewUser: boolean; needBindPhone?: boolean; bindToken?: string }> {
    const row = await this.prisma.wechatOAuthState.findUnique({ where: { state } });
    if (!row) {
      return { status: 'expired' };
    }
    if (row.expiresAt < new Date()) {
      await this.prisma.wechatOAuthState.delete({ where: { state } }).catch(() => {});
      return { status: 'expired' };
    }
    if (!row.openid) {
      return { status: 'waiting' };
    }
    // openid 已落 → 查 user
    const user = await this.users.findByWechatOpenId(row.openid);
    if (user) {
      const ua = 'wechat-scan';
      const { user: retUser, tokens } = await this.auth.loginOrThrow(user, ua);
      // 清理 state (一次性)
      await this.prisma.wechatOAuthState.delete({ where: { state } }).catch(() => {});
      return { status: 'ok', token: tokens.accessToken, user: retUser, isNewUser: false };
    }
    // openid 未绑 user → 返 bindToken 让前端跳 BindPhonePage
    const bindToken = this.signBindToken(row.openid);
    return { status: 'ok', token: '', user: null, isNewUser: true, needBindPhone: true, bindToken };
  }

  /**
   * POST /exchange { code, state }
   * 用 code 换 openid → 落 WechatOAuthState.openid → 等前端轮询
   */
  async exchange(dto: WechatExchangeDto): Promise<{ status: 'ok'; user?: any; tokens?: any; isNewUser?: boolean; needBindPhone?: boolean; bindToken?: string }> {
    const row = await this.prisma.wechatOAuthState.findUnique({ where: { state: dto.state } });
    if (!row || row.expiresAt < new Date()) {
      throw new BadRequestException('state 无效或已过期, 请重新扫码');
    }

    const { openid } = await this.wechat.exchangeCode(dto.code, this.getRedirectUri());
    await this.prisma.wechatOAuthState.update({
      where: { state: dto.state },
      data: { openid },
    });

    // 查 user, 命中则立即登录 (前端不用再 poll)
    const user = await this.users.findByWechatOpenId(openid);
    if (user) {
      const ua = 'wechat-exchange';
      const { user: retUser, tokens } = await this.auth.loginOrThrow(user, ua);
      await this.prisma.wechatOAuthState.delete({ where: { state: dto.state } }).catch(() => {});
      return { status: 'ok', user: retUser, tokens, isNewUser: false };
    }

    // 未绑 → 返 bindToken
    const bindToken = this.signBindToken(openid);
    return { status: 'ok', isNewUser: true, needBindPhone: true, bindToken };
  }

  /**
   * GET /callback?code=&state=
   * 微信直跳, 校验后 302 到前端
   */
  async callback(code: string, state: string, res: Response): Promise<void> {
    const row = await this.prisma.wechatOAuthState.findUnique({ where: { state } });
    if (!row || row.expiresAt < new Date()) {
      res.redirect(`${this.getFrontendCallbackUrl()}?error=invalid_state`);
      return;
    }
    // 直接转交, 让前端处理 (前端 /auth/wechat/callback 调 exchange)
    const frontendUrl = `${this.getFrontendCallbackUrl()}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    res.redirect(frontendUrl);
  }

  /**
   * POST /bind { wechatCode, state, phone?, phoneCode?, displayName?, role? }
   *   - 已登录用户绑微信 (BIND): 只传 wechatCode+state, user 从 JWT 拿
   *   - LOGIN 流程补手机号: 传 wechatCode+state+phone+phoneCode+displayName+role
   */
  async bind(dto: WechatBindDto, req: Request): Promise<{ user: any; isNewUser?: boolean; tokens?: any }> {
    const row = await this.prisma.wechatOAuthState.findUnique({ where: { state: dto.state } });
    if (!row || row.expiresAt < new Date()) {
      throw new BadRequestException('state 无效或已过期, 请重新扫码');
    }

    // 拿 openid (state 里没有就调 exchangeCode)
    let openid = row.openid;
    if (!openid) {
      const ex = await this.wechat.exchangeCode(dto.wechatCode, this.getRedirectUri());
      openid = ex.openid;
      await this.prisma.wechatOAuthState.update({
        where: { state: dto.state },
        data: { openid },
      });
    }

    // 已登录用户 (BIND) — userId 来自 JWT
    const authUserId = (req as any).user?.id as string | undefined;
    if (authUserId) {
      // 校验 openid 没被其他 user 占用
      const existing = await this.users.findByWechatOpenId(openid);
      if (existing && existing.id !== authUserId) {
        throw new ConflictException('该微信已绑定其他账号');
      }
      const updated = await this.prisma.user.update({
        where: { id: authUserId },
        data: { wechatOpenId: openid },
      });
      // 清理 state
      await this.prisma.wechatOAuthState.delete({ where: { state: dto.state } }).catch(() => {});
      return { user: updated };
    }

    // LOGIN 流程补手机号 — 必须有 phone + phoneCode
    if (!dto.phone || !dto.phoneCode) {
      throw new BadRequestException('缺少手机号或验证码');
    }

    // 校验手机验证码 (复用 phone service 的逻辑)
    const codeRow = await this.prisma.phoneVerifyCode.findFirst({
      where: {
        phone: dto.phone,
        purpose: 'LOGIN',
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!codeRow || codeRow.code !== dto.phoneCode) {
      if (codeRow) {
        await this.prisma.phoneVerifyCode.update({
          where: { id: codeRow.id },
          data: { attempts: { increment: 1 } },
        });
      }
      throw new UnauthorizedException('手机验证码无效');
    }

    // 查 user (同手机号 = 同账号, 决策 #4): phone 已存在 → 把 openid 写到那个 user
    let user = await this.users.findByPhone(dto.phone);
    let isNewUser = false;
    if (user) {
      // 检查 openid 是否绑了别的 user
      const existing = await this.users.findByWechatOpenId(openid);
      if (existing && existing.id !== user.id) {
        throw new ConflictException('该微信已绑定其他账号');
      }
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { wechatOpenId: openid },
      });
    } else {
      // 创建新 user
      if (!dto.displayName || !dto.role) {
        throw new BadRequestException('新用户需要 displayName + role');
      }
      const validRoles: UserRole[] = ['CREATOR', 'BUYER'];
      const role = validRoles.includes(dto.role as UserRole) ? (dto.role as UserRole) : 'BUYER';
      const placeholderEmail = `phone-${dto.phone}@ibi.ren.phone`;
      const placeholderHash = await bcrypt.hash(randomBytes(16).toString('hex'), 10);

      user = await this.users.create({
        email: placeholderEmail,
        passwordHash: placeholderHash,
        roles: serializeRoles([role]),
        displayName: dto.displayName,
        phone: dto.phone,
        wechatOpenId: openid,
      });
      isNewUser = true;
      this.logger.log(`wechat+phone user created: id=${user.id} phone=${dto.phone}`);
    }

    // 标记手机码已用
    await this.prisma.phoneVerifyCode.update({
      where: { id: codeRow.id },
      data: { usedAt: new Date() },
    });
    // 清理 state
    await this.prisma.wechatOAuthState.delete({ where: { state: dto.state } }).catch(() => {});

    // 发 token
    const ua = req.headers['user-agent'] || 'wechat-bind';
    const { user: retUser, tokens } = await this.auth.loginOrThrow(user, ua);
    return { user: retUser, isNewUser, tokens };
  }

  /**
   * POST /unbind
   * 需登录, 且必须有 password 或 phone (至少保留一种登录方式)
   */
  async unbind(req: Request): Promise<{ ok: true }> {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) throw new UnauthorizedException('未登录');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    if (!user.wechatOpenId) {
      throw new BadRequestException('当前账号未绑定微信');
    }
    const hasPassword = user.passwordHash && user.passwordHash.length > 0;
    const hasPhone = !!user.phone;
    if (!hasPassword && !hasPhone) {
      throw new BadRequestException('解绑微信前请先设置密码或绑定手机号');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { wechatOpenId: null },
    });
    return { ok: true };
  }

  /**
   * bindToken: 不透明 token, 实际就是 openid 本身 (state 里查不到, 这就是个 fallback 占位)
   * 真实生产应该用 HMAC 签名 + 短期有效, 但 MVP 简化
   */
  private signBindToken(openid: string): string {
    return Buffer.from(openid).toString('base64url');
  }
}