import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { IpStatus } from '@prisma/client';
import { IpsService } from '../ips/ips.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/util/roles.util';

class UsersQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) size?: number;
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly ips: IpsService) {}

  @Get('stats')
  async stats() {
    const stats = await this.ips.adminStats();
    return { stats };
  }

  @Get('users')
  async users(@Query() q: UsersQueryDto) {
    const items = await this.ips.adminListUsers(q.page ?? 1, Math.min(q.size ?? 50, 200));
    return { items, total: items.length };
  }

  @Get('orders')
  async orders(@Query('status') status?: string) {
    const items = await this.ips.adminListAllOrders({ status });
    return { items };
  }

  @Get('ips/queue')
  async ipsQueue(@Query('status') status?: IpStatus) {
    const items = await this.ips.adminListIps(status);
    return { items };
  }

  // #32 形象库覆盖度 — gender × ageBucket × ethnicity 网格 (4×3×6=72 格)
  @Get('library/coverage')
  async libraryCoverage() {
    return this.ips.libraryCoverage();
  }
}
