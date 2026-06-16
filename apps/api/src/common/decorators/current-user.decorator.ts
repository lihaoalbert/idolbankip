import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../util/roles.util';

export interface JwtUser {
  id: string;
  email: string;
  roles: UserRole[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);