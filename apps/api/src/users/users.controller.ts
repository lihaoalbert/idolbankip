import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

class UpdateProfileDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() realName?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsUrl() avatarUrl?: string;
  @IsOptional() @IsString() phone?: string;
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
}