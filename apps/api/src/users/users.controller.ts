import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

class UpdateProfileDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() realName?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsUrl() avatarUrl?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() @MaxLength(500) bio?: string;
}

class ChangePasswordDto {
  @IsString() @MinLength(1) oldPassword!: string;
  // bcrypt 72 字节上限 — 超过会被截断;前端 minlength=8 已足够
  @IsString() @MinLength(8) @MaxLength(72) newPassword!: string;
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() jwt: JwtUser) {
    const user = await this.users.requireById(jwt.id);
    const { passwordHash, ...rest } = user;
    return { user: rest };
  }

  @Patch('me')
  async updateMe(@CurrentUser() jwt: JwtUser, @Body() body: UpdateProfileDto) {
    const user = await this.users.update(jwt.id, body);
    const { passwordHash, ...rest } = user;
    return { user: rest };
  }

  /**
   * 修改自己的密码
   * 校验当前密码 → bcrypt 新密码 → 清空所有 refresh token (强制其他设备重新登录)
   */
  @Post('me/change-password')
  async changePassword(@CurrentUser() jwt: JwtUser, @Body() body: ChangePasswordDto) {
    return this.users.changePassword(jwt.id, body.oldPassword, body.newPassword);
  }
}