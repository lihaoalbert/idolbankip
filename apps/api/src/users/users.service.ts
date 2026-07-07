import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // W3 W1 D4: 手机号查 user
  findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async create(params: {
    email: string;
    passwordHash: string;
    roles: Prisma.InputJsonValue;
    displayName: string;
    phone?: string;
    companyName?: string;
  }): Promise<User> {
    return this.prisma.user.create({ data: params });
  }

  async update(id: string, data: Partial<Pick<User, 'displayName' | 'avatarUrl' | 'phone' | 'companyName' | 'realName' | 'bio'>>): Promise<User> {
    const user = await this.prisma.user.update({ where: { id }, data });
    return user;
  }

  async requireById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  /**
   * 修改密码
   * - 校验当前密码 (bcrypt.compare)
   * - 写新 hash (10 轮)
   * - 清空该用户所有 refresh token (强制其他设备重新登录)
   */
  async changePassword(userId: string, oldPwd: string, newPwd: string): Promise<{ ok: true }> {
    const user = await this.requireById(userId);
    const ok = await bcrypt.compare(oldPwd, user.passwordHash);
    if (!ok) throw new UnauthorizedException('当前密码不正确');
    const newHash = await bcrypt.hash(newPwd, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { ok: true };
  }
}