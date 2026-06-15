import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserRole, User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, randomBytes } from 'crypto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: UserRole;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async register(params: {
    email: string;
    password: string;
    role: UserRole;
    displayName: string;
    phone?: string;
    companyName?: string;
  }): Promise<{ user: User; tokens: TokenPair }> {
    const existing = await this.usersService.findByEmail(params.email);
    if (existing) {
      throw new ConflictException('该邮箱已被注册');
    }
    const passwordHash = await bcrypt.hash(params.password, 10);
    const user = await this.usersService.create({
      email: params.email,
      passwordHash,
      role: params.role,
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
    return { user, tokens };
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

  async validatePayload(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload?.sub) throw new UnauthorizedException();
    return payload;
  }

  private async issueTokens(user: User, userAgent: string): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
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