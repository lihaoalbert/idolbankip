import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { KycService } from './kyc.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/util/roles.util';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import type { PrismaService } from '../prisma/prisma.service';

class SubmitKycDto {
  @IsString() realName!: string;
  @IsString() idNumber!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() livenessImageKey?: string;
}

@ApiTags('kyc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Post('submit')
  async submit(@CurrentUser() u: JwtUser, @Body() body: SubmitKycDto) {
    const submission = await this.kyc.submit(u.id, body);
    return { submission };
  }

  @Get('status')
  async status(@CurrentUser() u: JwtUser) {
    return this.kyc.getStatus(u.id);
  }
}

@ApiTags('admin-kyc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/kyc')
export class AdminKycController {
  constructor(private readonly kyc: KycService) {}

  @Get('queue')
  async queue() {
    // 简化: 直接通过 prisma 列出 PENDING 状态
    const prisma = (this.kyc as any).prisma as PrismaService;
    const items = await prisma.kycSubmission.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, displayName: true, companyName: true } } },
    });
    return { items };
  }

  @Post(':id/approve')
  async approve(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: { notes?: string }) {
    return this.kyc.adminApprove(id, u.id, body.notes);
  }

  @Post(':id/reject')
  async reject(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: { notes: string }) {
    return this.kyc.adminReject(id, u.id, body.notes);
  }
}