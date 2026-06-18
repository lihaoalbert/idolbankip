import { BadRequestException, Body, Controller, ForbiddenException, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, Min } from 'class-validator';
import { AssetType, CertFileType, IpStatus } from '@prisma/client';
import { UploadService, CERT_LIMITS } from './upload.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/util/roles.util';
import { PrismaService } from '../prisma/prisma.service';

class DirectPostPolicyDto {
  @IsString() ipId!: string;
  @IsEnum(AssetType) assetType!: AssetType;
  @IsString() filename!: string;
  @IsInt() @Min(0) size!: number;
}

class CertPolicyDto {
  @IsString() ipId!: string;
  @IsEnum(CertFileType) certFileType!: CertFileType;
  @IsString() filename!: string;
  @IsInt() @Min(0) size!: number;
}

class AutoFileDto {
  @IsEnum(AssetType) assetType!: AssetType;
  @IsString() content!: string;
}

class SetFaceCloseupDto {
  @IsString() fileId!: string;
}

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CREATOR)
@Controller('upload')
export class UploadController {
  constructor(
    private readonly upload: UploadService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('policy')
  async policy(@Body() body: DirectPostPolicyDto) {
    return this.upload.generateDirectPostPolicy(body);
  }

  /**
   * 版权证书文件上传策略 (PDF/JPG/PNG, 100KB-20MB)
   * 路径: ips/{code}/cert/{ts}/{filename} — 与资产文件隔离
   * IP 必须属于该创作者 + status=PUBLIC_INTENT
   */
  @Post('cert-policy')
  async certPolicy(@CurrentUser() u: JwtUser, @Body() body: CertPolicyDto) {
    const ip = await this.prisma.ipAsset.findUnique({ where: { id: body.ipId } });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== u.id) throw new ForbiddenException('无权操作此资产');
    if (ip.status !== IpStatus.PUBLIC_INTENT) {
      throw new BadRequestException(`仅 PUBLIC_INTENT 状态可上传证书, 当前 ${ip.status}`);
    }
    const limit = CERT_LIMITS[body.certFileType];
    if (body.size < limit.minBytes || body.size > limit.maxBytes) {
      throw new BadRequestException(`${limit.label.split('(')[0].trim()} 大小 ${body.size} 越界, 期望 ${this.fmtSize(limit.minBytes)} - ${this.fmtSize(limit.maxBytes)}`);
    }
    return this.upload.generateCertPolicy({
      ipCode: ip.code,
      certFileType: body.certFileType,
      filename: body.filename,
      size: body.size,
    });
  }

  private fmtSize(b: number): string {
    if (b < 1024) return `${b}B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`;
    return `${(b / 1024 / 1024).toFixed(0)}MB`;
  }

  /**
   * 从 description 自动生成文本类资产 (BIO_TXT / RECIPE_TXT)
   * 避免创作者写两遍内容;若已存在同类型文件,会覆盖
   */
  @Post('ips/:id/auto-files')
  async autoFile(
    @Param('id') ipId: string,
    @Body() body: AutoFileDto,
    @CurrentUser() u: JwtUser,
  ) {
    const ip = await this.prisma.ipAsset.findUnique({ where: { id: ipId } });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== u.id) throw new ForbiddenException('无权操作此资产');
    if (ip.status !== IpStatus.PENDING_REVIEW) {
      throw new BadRequestException('已提交审核的 IP 不允许修改资产');
    }
    return this.upload.createAutoFile(ipId, u.id, body.assetType, body.content);
  }

  /**
   * 创作者指定/切换版权图 (IpAsset.faceCloseupFileId)
   * body: { fileId } — 必须是该 IP 下的一张 FACE_CLOSEUP IpFile
   * 见 [[project-post-mvp-backlog]] #31
   */
  @Post('ips/:id/face-closeup')
  async setFaceCloseup(
    @Param('id') ipId: string,
    @Body() body: SetFaceCloseupDto,
    @CurrentUser() u: JwtUser,
  ) {
    return this.upload.setFaceCloseup(ipId, body.fileId, u.id);
  }
}
