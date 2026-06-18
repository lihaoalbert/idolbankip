import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CertFileType } from '@prisma/client';
import { IsString, MinLength } from 'class-validator';
import { CertService } from '../cert/cert.service';
import { UploadService } from '../upload/upload.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/util/roles.util';

class RejectCertDto {
  @IsString() @MinLength(5) reason!: string;
}

const CERT_CONTENT_TYPE: Record<CertFileType, string> = {
  PDF: 'application/pdf',
  JPG: 'image/jpeg',
  PNG: 'image/png',
};

@ApiTags('admin-cert')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/cert')
export class AdminCertController {
  constructor(
    private readonly cert: CertService,
    private readonly upload: UploadService,
  ) {}

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
   * 预览证书文件 (inline 渲染)
   * - 后端用 SDK get() 直接读 Buffer (避开 signed URL + response headers 的签名 bug)
   * - 用 Content-Disposition: inline 让浏览器直接渲染 PDF / 图片
   */
  @Get(':id/file')
  async file(@Param('id') id: string, @Res() res: Response) {
    const cert = await this.cert.adminGetById(id);
    if (!cert.certFileKey || !cert.certFileType) {
      throw new NotFoundException('证书文件不存在');
    }
    if (!CERT_CONTENT_TYPE[cert.certFileType]) {
      throw new BadRequestException(`不支持的文件类型: ${cert.certFileType}`);
    }
    const buf = await this.upload.getCertBuffer(cert.certFileKey);
    res.set({
      'Content-Type': CERT_CONTENT_TYPE[cert.certFileType],
      'Content-Disposition': `inline; filename="${(cert.certFileName || 'cert').replace(/[\\"\n\r]/g, '_')}"`,
      'Content-Length': buf.length.toString(),
      'Cache-Control': 'private, max-age=120',
    });
    res.send(buf);
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