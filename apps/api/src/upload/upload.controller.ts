import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { AssetType, CertFileType, IpStatus } from '@prisma/client';
import { PROCESS_STEPS, UploadService, CERT_LIMITS } from './upload.service';
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
  // #33 创作过程证据 — 可选, 仅 PROCESS_EVIDENCE 校验
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsIn(PROCESS_STEPS as unknown as string[]) processStep?: string;
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
    // #33 创作过程证据 — policy 阶段先校验 description/processStep, 避免无谓上传 OSS
    if (body.assetType === AssetType.PROCESS_EVIDENCE) {
      if (!body.processStep || !PROCESS_STEPS.includes(body.processStep as any)) {
        throw new BadRequestException(`PROCESS_EVIDENCE 必须传 processStep (${PROCESS_STEPS.join(', ')})`);
      }
    }
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

  /**
   * #30.6.15 AI 生成图下载 — 给创作者拿到原图二次修改
   * GET /upload/files/:fileId/download-url
   * - 验证 fileId 属于当前创作者的 IP (PENDING_REVIEW 状态可下载; 其它状态也可, 创作者总能下自己的)
   * - 返回 5min 有效 OSS 签名 URL (含 x-oss-force-download 触发浏览器下载)
   * - 前端 window.location.href = url 直接下载
   */
  @Get('files/:fileId/download-url')
  async getFileDownloadUrl(
    @Param('fileId') fileId: string,
    @CurrentUser() u: JwtUser,
  ) {
    const file = await this.prisma.ipFile.findUnique({
      where: { id: fileId },
      include: { ip: { select: { creatorId: true, code: true } } },
    });
    if (!file) throw new NotFoundException('文件不存在');
    if (file.ip.creatorId !== u.id) {
      throw new ForbiddenException('无权下载此文件');
    }
    const url = await this.upload.signDownloadUrl(file.ossKey, 'private', file.originalName);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    return { url, expiresAt, filename: file.originalName };
  }

  /**
   * #30.6.15 文件预览签名 URL — 给前端 <img :src=...> 用 (浏览器 GET 不带 Bearer, 走 OSS 签名)
   * GET /upload/files/:fileId/preview-url
   * - ownership check: 文件必须属于当前创作者的 IP (任何状态都允许, 创作者总能看自己的)
   * - 返回 1h 有效 OSS 签名 URL (含 response-content-disposition=inline 让浏览器直接渲染)
   * - 前端 <img :src="previewUrl"> 直接用, 浏览器拿这个 URL 去 OSS 拉图
   * - 比 /preview 端点的优势: <img> 标签不发 Authorization header, 用签名 URL 才能让浏览器拿到图
   */
  @Get('files/:fileId/preview-url')
  async getFilePreviewUrl(
    @Param('fileId') fileId: string,
    @CurrentUser() u: JwtUser,
  ) {
    const file = await this.prisma.ipFile.findUnique({
      where: { id: fileId },
      include: { ip: { select: { creatorId: true } } },
    });
    if (!file) throw new NotFoundException('文件不存在');
    if (file.ip.creatorId !== u.id) {
      throw new ForbiddenException('无权预览此文件');
    }
    // 1h 有效, 签名里带 response-content-disposition=inline 让浏览器渲染 (不下载)
    // 必须传 response 给 ali-oss.signatureUrl, 不能事后拼接 (会导致 SignatureDoesNotMatch)
    // ali-oss SDK 会自动给 key 加 "response-" 前缀, 所以传裸 key 即可 (不要写 "response-content-...")
    // 不加 content-type — OSS 不允许 query param 覆盖 content-type (报 InvalidRequest)
    const url = this.upload.signViewUrl(file.ossKey, 'private', 3600, {
      'content-disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`,
    });
    return { url, expiresIn: 3600 };
  }
}
