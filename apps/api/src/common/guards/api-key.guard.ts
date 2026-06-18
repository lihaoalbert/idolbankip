import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ApiKeyGuard — 与 JwtAuthGuard 平行,通过 x-api-key 头校验 long-lived API key。
 * 校验后把 user 写到 req.user (与 JwtAuthGuard 同 shape),让后续 @CurrentUser() 工作。
 * 见 [[project-post-mvp-backlog]] #24
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const headerVal: string | undefined = req.headers['x-api-key'];
    if (!headerVal) throw new UnauthorizedException('缺少 x-api-key 头');

    const keyHash = createHash('sha256').update(headerVal).digest('hex');
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: { select: { id: true, email: true, displayName: true, roles: true } } },
    });
    if (!apiKey) throw new UnauthorizedException('API key 无效');
    if (apiKey.revokedAt) throw new UnauthorizedException('API key 已撤销');
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) throw new UnauthorizedException('API key 已过期');

    // 异步更新 lastUsedAt (不 await — 不阻塞请求)
    this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => undefined);

    req.user = {
      id: apiKey.user.id,
      email: apiKey.user.email,
      displayName: apiKey.user.displayName,
      roles: apiKey.user.roles,
      apiKeyId: apiKey.id,
      apiKeyScopes: apiKey.scopes.split(',').filter(Boolean),
    };
    return true;
  }
}
