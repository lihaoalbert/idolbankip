import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CertFileType } from '@prisma/client';
import { CertService } from './cert.service';
import { UploadService } from '../upload/upload.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/util/roles.util';

class SubmitCertDto {
  @IsEnum(CertFileType) certFileType!: CertFileType;
  @IsString() certFileKey!: string;
  @IsString() certFileName!: string;
  @IsInt() @Min(1000) certFileSize!: number;
  @IsOptional() @IsString() selfCertNo?: string;
  @IsOptional() @IsDateString() selfIssuedAt?: string;
}

const CERT_CONTENT_TYPE: Record<CertFileType, string> = {
  PDF: 'application/pdf',
  JPG: 'image/jpeg',
  PNG: 'image/png',
};

@ApiTags('cert')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CREATOR)
@Controller('ips/:id/cert')
export class CertController {
  constructor(
    private readonly cert: CertService,
    private readonly upload: UploadService,
  ) {}

  /**
   * 创作者提交版权证书 (PUBLIC_INTENT 状态)
   * - 文件已通过 /upload/cert-policy + /upload/cert-callback 传到 OSS
   * - 这里只写 DB
   */
  @Post()
  async submit(
    @CurrentUser() u: JwtUser,
    @Param('id') ipId: string,
    @Body() body: SubmitCertDto,
  ) {
    const cert = await this.cert.createSubmission(ipId, u.id, {
      ...body,
      selfIssuedAt: body.selfIssuedAt ? new Date(body.selfIssuedAt) : undefined,
    });
    return { cert: { ...cert, certFileSize: cert.certFileSize?.toString() } };
  }

  /**
   * 创作者查自己 IP 的证书
   */
  @Get()
  async get(@CurrentUser() u: JwtUser, @Param('id') ipId: string) {
    const cert = await this.cert.getByIpIdForCreator(ipId, u.id);
    return { cert: cert ? { ...cert, certFileSize: cert.certFileSize?.toString() } : null };
  }

  /**
   * 创作者下载自己 IP 的版权证书 (OFFICIAL_REGISTERED 状态可用,APPROVED 才能下载)
   * - ownership check 在 CertService.getByIpIdForCreator 里
   * - 后端用 SDK get() 直接读 Buffer (避开 signed URL + response headers 的签名 bug)
   * - Content-Disposition 用 RFC 5987 filename* (中文 / 特殊字符不踩 ERR_INVALID_CHAR 坑)
   */
  @Get('file')
  async file(@CurrentUser() u: JwtUser, @Param('id') ipId: string, @Res() res: Response) {
    const cert = await this.cert.getByIpIdForCreator(ipId, u.id);
    if (!cert?.certFileKey || !cert.certFileType) {
      throw new NotFoundException('证书文件不存在');
    }
    if (cert.status !== 'APPROVED') {
      throw new BadRequestException(`证书未通过审核 (${cert.status}), 暂不可下载`);
    }
    if (!CERT_CONTENT_TYPE[cert.certFileType]) {
      throw new BadRequestException(`不支持的文件类型: ${cert.certFileType}`);
    }
    const buf = await this.upload.getCertBuffer(cert.certFileKey);
    // RFC 5987: filename*=UTF-8''<percent-encoded>
    // 不加 filename="..." 双写 — Node HTTP 对 inline/attachment 都会因 filename 含
    // 特殊字符 (emoji / control / 双字节) 抛 ERR_INVALID_CHAR,见 [[feedback_content_disposition_filename_trap]]
    // 现代浏览器 (Chrome/Firefox/Safari/Edge) 都支持 filename* 单独使用
    const safeName = (cert.certFileName || 'copyright-cert')
      .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
      .slice(0, 200) || 'copyright-cert';
    const encodedName = encodeURIComponent(safeName);
    res.set({
      'Content-Type': CERT_CONTENT_TYPE[cert.certFileType],
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      'Content-Length': buf.length.toString(),
      'Cache-Control': 'private, max-age=120',
    });
    res.send(buf);
  }
}
