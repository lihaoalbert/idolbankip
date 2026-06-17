import { BadRequestException, Body, Controller, ForbiddenException, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, Min } from 'class-validator';
import { AssetType, IpStatus } from '@prisma/client';
import { UploadService } from './upload.service';
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

class AutoFileDto {
  @IsEnum(AssetType) assetType!: AssetType;
  @IsString() content!: string;
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
}
