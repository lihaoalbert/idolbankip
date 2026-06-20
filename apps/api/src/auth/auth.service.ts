import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { HonorAction, User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, randomBytes } from 'crypto';
import { UserRole, parseRoles, serializeRoles } from '../common/util/roles.util';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { HonorService } from '../honor/honor.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string; // userId
  email: string;
  roles: UserRole[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly honor: HonorService,
  ) {}

  async register(params: {
    email: string;
    password: string;
    roles: UserRole[];
    displayName: string;
    phone?: string;
    companyName?: string;
  }): Promise<{ user: User; tokens: TokenPair }> {
    const existing = await this.usersService.findByEmail(params.email);
    if (existing) {
      throw new ConflictException('该邮箱已被注册');
    }
    const passwordHash = await bcrypt.hash(params.password, 10);
    // 注册时必须至少勾选一个身份;否则默认 BUYER (单角色采购方)。
    const rolesToSet = params.roles.length > 0 ? params.roles : ['BUYER' as UserRole];
    const user = await this.usersService.create({
      email: params.email,
      passwordHash,
      roles: serializeRoles(rolesToSet),
      displayName: params.displayName,
      phone: params.phone,
      companyName: params.companyName,
    });
    const tokens = await this.issueTokens(user, '');
    return { user, tokens };
  }

  async login(email: string, password: string, userAgent: string): Promise<{ user: User; tokens: TokenPair }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('邮箱或密码错误');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('邮箱或密码错误');

    const tokens = await this.issueTokens(user, userAgent);

    // 荣誉流水 — 每日登录 +5 + 更新连续天数 + 里程碑发奖
    // 同步等: 让前端 /honor/me 第一次拉就能看到流水, 不需要前端 sleep 后再拉
    try {
      await this.recordLoginHonor(user.id);
    } catch (e: any) {
      // 荣誉写入失败不影响登录主流程
      this.logger.warn(`honor recordLoginHonor failed: ${e?.message ?? e}`);
    }

    return { user, tokens };
  }

  private async recordLoginHonor(userId: string): Promise<void> {
    // updateStreakOnLogin 内部已处理: 幂等 (UTC+8 日内只生效一次), 断签重置, 里程碑发奖
    await this.honor.updateStreakOnLogin(userId);
    // 单独记 DAILY_LOGIN 流水 (record 内部会跳过 maxPerUser 检查)
    // 先看 updateStreakOnLogin 是否已发奖 — 它不会发 DAILY_LOGIN, 只发 STREAK_*
    await this.honor.record(userId, HonorAction.DAILY_LOGIN, { skipBadgeEval: true });
  }

  async refresh(refreshToken: string, userAgent: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('refresh token 无效或已过期');
    }
    // 轮换 refresh token
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(record.user, userAgent);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async validatePayload(payload: JwtPayload): Promise<JwtUser> {
    if (!payload?.sub) throw new UnauthorizedException();
    return { id: payload.sub, email: payload.email, roles: payload.roles };
  }

  private async issueTokens(user: User, userAgent: string): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      roles: parseRoles(user.roles),
    });
    const refreshToken = randomBytes(48).toString('hex');
    const ttl = this.config.get<string>('JWT_REFRESH_TTL', '30d');
    const expiresAt = new Date(Date.now() + this.parseTtl(ttl));
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        userAgent: userAgent || 'unknown',
        expiresAt,
      },
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseTtl(this.config.get<string>('JWT_ACCESS_TTL', '15m')) / 1000,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseTtl(ttl: string): number {
    const m = /^(\d+)([smhd])$/.exec(ttl);
    if (!m) return 15 * 60 * 1000;
    const n = parseInt(m[1], 10);
    switch (m[2]) {
      case 's': return n * 1000;
      case 'm': return n * 60 * 1000;
      case 'h': return n * 3600 * 1000;
      case 'd': return n * 86400 * 1000;
      default: return n * 1000;
    }
  }
}