import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CertFileType } from '@prisma/client';
import { CertService } from './cert.service';
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

@ApiTags('cert')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CREATOR)
@Controller('ips/:id/cert')
export class CertController {
  constructor(private readonly cert: CertService) {}

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
}
