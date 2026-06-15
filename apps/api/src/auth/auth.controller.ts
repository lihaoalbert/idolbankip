import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService, TokenPair } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsEnum(UserRole) role!: UserRole;
  @IsString() displayName!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() companyName?: string;
}
class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}
class RefreshDto {
  @IsString() refreshToken!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(201)
  async register(@Body() body: RegisterDto, @Headers('user-agent') ua: string) {
    const { user, tokens } = await this.auth.register({
      email: body.email,
      password: body.password,
      role: body.role,
      displayName: body.displayName,
      phone: body.phone,
      companyName: body.companyName,
    });
    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Headers('user-agent') ua: string) {
    const { user, tokens } = await this.auth.login(body.email, body.password, ua || '');
    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: RefreshDto, @Headers('user-agent') ua: string) {
    return this.auth.refresh(body.refreshToken, ua || '');
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() body: RefreshDto) {
    await this.auth.logout(body.refreshToken);
    return { ok: true };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: JwtUser) {
    return { user };
  }

  private sanitizeUser<T extends { passwordHash: string }>(u: T) {
    const { passwordHash, ...rest } = u;
    return rest;
  }
}