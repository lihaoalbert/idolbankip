/**
 * AuthPhoneService — W3 W1 D4 手机验证码登录全链路
 *
 * 流程:
 *   1. sendCode(phone): 校验 throttle (60s 同号 1 条 + 日 10 条) → 生成 6 位码 → 写
 *      PhoneVerifyCode → 调 SmsService.sendLoginCode (mock/aliyun driver)
 *   2. login(dto): 校验码 (attempts<5) → 查 phone 唯一 → 命中 → 调 AuthService.loginOrThrow;
 *      未命中且带 role+displayName → 创建 user + phone → loginOrThrow; 未命中且缺 → 返 needRegister
 *
 * 决策:
 *   - phone login 创建的 user.email 填 placeholder (phone-${phone}@ibi.ren.phone),
 *     passwordHash 填 bcrypt(randomBytes), 后续用户可在 settings 补 email+设密码
 *   - 同手机号 = 同账号 (决策 #4): phone unique, 已存在 user 直接登录
 *   - mock 模式: SMS_DRIVER=mock 时 SmsService 自动走日志输出 code
 */
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { serializeRoles, type UserRole } from '../common/util/roles.util';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';
import type { PhoneLoginDto } from './dto/login.dto';

@Injectable()
export class AuthPhoneService {
  private readonly logger = new Logger(AuthPhoneService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 发送手机验证码
   */
  async sendCode(phone: string, _req: Request): Promise<{ ok: true; ttlSec: number }> {
    const throttleSec = this.config.get<number>('SMS_THROTTLE_SECONDS', 60);
    const maxDaily = this.config.get<number>('SMS_MAX_DAILY_PER_PHONE', 10);
    const ttl = this.config.get<number>('SMS_CODE_TTL_SECONDS', 300);
    const codeLen = this.config.get<number>('SMS_CODE_LENGTH', 6);

    // 同号 throttle: 最近 throttleSec 内有未过期未用的码就 429
    const since = new Date(Date.now() - throttleSec * 1000);
    const recent = await this.prisma.phoneVerifyCode.findFirst({
      where: {
        phone,
        createdAt: { gte: since },
        usedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const waitSec = Math.ceil((recent.createdAt.getTime() + throttleSec * 1000 - Date.now()) / 1000);
      throw new HttpException(`请求太频繁, 请 ${waitSec} 秒后再试`, HttpStatus.TOO_MANY_REQUESTS);
    }

    // 日 10 条上限: 当天 0 点起累计
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayCount = await this.prisma.phoneVerifyCode.count({
      where: {
        phone,
        createdAt: { gte: startOfToday },
      },
    });
    if (todayCount >= maxDaily) {
      throw new HttpException(`今日发送已达上限 (${maxDaily} 条), 明日再试`, HttpStatus.TOO_MANY_REQUESTS);
    }

    // 生成 6 位数字码
    const code = this.generateCode(codeLen);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await this.prisma.phoneVerifyCode.create({
      data: {
        phone,
        code,
        purpose: 'LOGIN',
        expiresAt,
      },
    });

    // 调 SMS driver 发码 (mock 在日志输出)
    const result = await this.sms.sendLoginCode(phone, code);
    if (!result.ok) {
      // 发送失败: 不删记录 (避免重试洪水), 让它自然过期
      this.logger.warn(`sendLoginCode failed: phone=${phone} message=${result.message}`);
      throw new BadRequestException(`短信发送失败: ${result.message || '未知'}`);
    }

    return { ok: true, ttlSec: ttl };
  }

  /**
   * 手机号 + 验证码登录/注册
   * 命中 user → 登录; 未命中 + 带 role+displayName → 创建; 未命中 + 缺 → 返 needRegister
   */
  async login(
    dto: PhoneLoginDto,
    req: Request,
  ): Promise<
    | { user: any; tokens: any; isNewUser: boolean }
    | { needRegister: true }
  > {
    const maxAttempts = this.config.get<number>('SMS_MAX_ATTEMPTS', 5);

    // 查最新一条未用未过期的码
    const record = await this.prisma.phoneVerifyCode.findFirst({
      where: {
        phone: dto.phone,
        purpose: 'LOGIN',
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      throw new UnauthorizedException('验证码无效或已过期, 请重新获取');
    }

    if (record.attempts >= maxAttempts) {
      throw new UnauthorizedException(`验证码错太多次, 请重新获取`);
    }

    if (record.code !== dto.code) {
      await this.prisma.phoneVerifyCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      const left = maxAttempts - record.attempts - 1;
      throw new UnauthorizedException(
        `验证码错误${left > 0 ? `, 还剩 ${left} 次` : ', 已锁定'}`,
      );
    }

    // 查 user (同手机号 = 同账号, 决策 #4)
    let user = await this.users.findByPhone(dto.phone);
    let isNewUser = false;

    if (!user) {
      // 未注册: 必传 role + displayName 才创建 — 此时**不**消耗 code,
      // 让用户回来填完身份后用同一码完成注册 (LoginPage → RegisterPage 回跳流程)
      if (!dto.role || !dto.displayName) {
        return { needRegister: true };
      }
      // 角色白名单
      const validRoles: UserRole[] = ['CREATOR', 'BUYER'];
      const role = validRoles.includes(dto.role as UserRole) ? (dto.role as UserRole) : 'BUYER';
      const roles: UserRole[] = [role];

      // 占位 email + password (用户后续可补)
      const placeholderEmail = `phone-${dto.phone}@ibi.ren.phone`;
      const placeholderHash = await bcrypt.hash(randomBytes(16).toString('hex'), 10);

      user = await this.users.create({
        email: placeholderEmail,
        passwordHash: placeholderHash,
        roles: serializeRoles(roles),
        displayName: dto.displayName,
        phone: dto.phone,
      });
      isNewUser = true;
      this.logger.log(`phone user created: id=${user.id} phone=${dto.phone} role=${role}`);
    } else if (dto.displayName && user.displayName !== dto.displayName) {
      // 已注册用户带 displayName — 同步更新 (友好, 跟现有 register 行为一致)
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { displayName: dto.displayName },
      });
    }

    // 走到这一步说明 code 已被消费 (即将发 token) — mark usedAt
    await this.prisma.phoneVerifyCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    // 共用 token + honor 流水
    const userAgent = req.headers['user-agent'] || 'unknown';
    const { user: retUser, tokens } = await this.auth.loginOrThrow(user, userAgent);

    return { user: retUser, tokens, isNewUser };
  }

  private generateCode(len: number): string {
    const max = 10 ** len;
    const n = Math.floor(Math.random() * max);
    return n.toString().padStart(len, '0');
  }
}
