import { Injectable, NotFoundException } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
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

  async create(params: {
    email: string;
    passwordHash: string;
    role: UserRole;
    displayName: string;
    phone?: string;
    companyName?: string;
  }): Promise<User> {
    return this.prisma.user.create({ data: params });
  }

  async update(id: string, data: Partial<Pick<User, 'displayName' | 'avatarUrl' | 'phone' | 'companyName' | 'realName'>>): Promise<User> {
    const user = await this.prisma.user.update({ where: { id }, data });
    return user;
  }

  async requireById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }
}