import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MOCK_NI_JWT_SECRET } from './fixtures';

/**
 * Mock 鉴权 — 仅验 token 签名,不查 DB
 * 真接口时替换为标准 JwtAuthGuard(查 user + roles)
 *
 * why 自己写: 现有 JwtAuthGuard 会从 DB 查 user, mock 阶段没有真 user,
 *           复用会全部 401. 独立 guard 让 mock 跟生产 auth 解耦.
 */
@Injectable()
export class MockNiJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: {
          code: 'unauthorized',
          message: 'missing or malformed Authorization header',
          request_id: req.headers['x-request-id'] || null,
        },
      });
    }
    const token = auth.slice(7);
    try {
      const payload = this.jwtService.verify(token, {
        secret: MOCK_NI_JWT_SECRET,
      });
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException({
        error: {
          code: 'unauthorized',
          message: 'token invalid or expired',
          request_id: req.headers['x-request-id'] || null,
        },
      });
    }
  }
}
