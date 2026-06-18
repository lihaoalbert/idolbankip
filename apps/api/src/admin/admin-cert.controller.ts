import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { CertService } from '../cert/cert.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/util/roles.util';

class RejectCertDto {
  @IsString() @MinLength(5) reason!: string;
}

@ApiTags('admin-cert')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/cert')
export class AdminCertController {
  constructor(private readonly cert: CertService) {}

  /**
   * 待审核证书队列
   */
  @Get('queue')
  async queue() {
    const items = await this.cert.adminListQueue();
    return {
      items: items.map((c) => ({
        ...c,
        certFileSize: c.certFileSize?.toString(),
      })),
    };
  }

  /**
   * 通过 → cert.status=APPROVED, ip.status=OFFICIAL_REGISTERED
   */
  @Post(':id/approve')
  async approve(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const cert = await this.cert.adminApprove(id, u.id);
    return { cert: { ...cert, certFileSize: cert.certFileSize?.toString() } };
  }

  /**
   * 拒绝 → cert.status=REJECTED, ip.status=PENDING_REVIEW (创作者可重提)
   */
  @Post(':id/reject')
  async reject(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: RejectCertDto) {
    const cert = await this.cert.adminReject(id, u.id, body.reason);
    return { cert: { ...cert, certFileSize: cert.certFileSize?.toString() } };
  }
}
