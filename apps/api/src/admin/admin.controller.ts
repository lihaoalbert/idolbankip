import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { IpsService } from '../ips/ips.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

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
}
