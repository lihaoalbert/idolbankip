import { Body, Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { Response } from 'express';
import { ContractsService } from './contracts.service';
import { UploadService } from '../upload/upload.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/util/roles.util';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contracts: ContractsService,
    private readonly upload: UploadService,
  ) {}

  @Get(':id')
  async getDetail(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.contracts.getDetail(id, u.id);
  }

  /**
   * 下载合同 PDF — 买方(本合同的 owner)或 admin(法务线下签)可用
   * - 优先返回已签版本 (ossSignedKey), 没有则返回草稿 (ossTemplateKey)
   * - Content-Disposition: attachment + filename*=UTF-8'' 避开 Node ERR_INVALID_CHAR
   * - 私有 OSS 桶: SDK get 直读 buffer, 不用 signed URL (见 [[feedback_ali_oss_signed_url_signature_bug]])
   */
  @Get(':id/file')
  async download(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { contract, order } = await this.contracts.getDetail(id, u.id);
    // getDetail 已经过了 ownership / admin 检查, 这里不用再 verify
    const ossKey = contract.ossSignedKey || contract.ossTemplateKey;
    if (!ossKey) throw new NotFoundException('合同 PDF 尚未生成');
    const buf = await this.upload.getContractBuffer(ossKey);
    // R10 P0-3: brief 中标的订单 ip 为 null, 这种订单不走合同流程;此处 ip 为空直接兜底 brief 标题
    const ipCode = order.ip?.code ?? (order.brief ? `BRIEF-${order.brief.title.slice(0, 10)}` : 'ORDER');
    const baseName = `${ipCode}-${contract.templateCode}-${contract.id.slice(-6)}`;
    const safeName = baseName.replace(/[\\/:*?"<>|\r\n\t]/g, '_').slice(0, 200) + '.pdf';
    const encodedName = encodeURIComponent(safeName);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      'Content-Length': buf.length.toString(),
      'Cache-Control': 'private, max-age=60',
    });
    res.send(buf);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.BUYER)
  @Post(':id/buyer-sign')
  async buyerSign(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const contract = await this.contracts.buyerSign(id, u.id);
    return { contract };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/platform-sign')
  async platformSign(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const contract = await this.contracts.platformSign(id, u.id);
    return { contract };
  }
}