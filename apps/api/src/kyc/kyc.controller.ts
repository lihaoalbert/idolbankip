import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotImplementedException,
  Param,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { KycService } from './kyc.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/util/roles.util';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import type { PrismaService } from '../prisma/prisma.service';
import { OCR_CLIENT, OcrBusinessLicenseInput, OcrClient } from '@ibi-ren/shared-contracts';
import { UploadService } from '../upload/upload.service';

class SubmitKycDto {
  @IsString() realName!: string;
  @IsString() idNumber!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() livenessImageKey?: string;
}

class SubmitEnterpriseKycDto {
  // 营业执照 OSS key (private bucket,OCR 客户端会自己生成签名 URL)
  @IsString() licenseImageKey!: string;
  // 法人姓名 (由前端 OCR 预填 + 用户二次确认)
  @IsString() legalPersonName!: string;
  // 法人身份证号
  @IsString() legalPersonIdNumber!: string;
  // 联系人电话 (可选)
  @IsOptional() @IsString() phone?: string;
}

@ApiTags('kyc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(
    private readonly kyc: KycService,
    @Inject(OCR_CLIENT) private readonly ocr: OcrClient | null,
    private readonly upload: UploadService,
  ) {}

  @Post('submit')
  async submit(@CurrentUser() u: JwtUser, @Body() body: SubmitKycDto) {
    const submission = await this.kyc.submit(u.id, body);
    return { submission };
  }

  @Get('status')
  async status(@CurrentUser() u: JwtUser) {
    return this.kyc.getStatus(u.id);
  }

  /**
   * 营业执照 OCR — 上传后调这里识别,返回结构化字段供前端预填 + 用户核对
   *   1. 前端把营业执照图片 POST 到通用上传接口,拿到 OSS key
   *   2. 前端 POST /kyc/enterprise/ocr { licenseImageKey }
   *   3. 后端:生成签名 URL → 调阿里云 OCR → 返回字段
   */
  @Post('enterprise/ocr')
  async enterpriseOcr(@CurrentUser() u: JwtUser, @Body() body: { licenseImageKey: string }) {
    if (!this.ocr) {
      throw new ServiceUnavailableException('OCR 服务未配置 (OCR_DRIVER=aliyun)');
    }
    if (!body.licenseImageKey) {
      throw new BadRequestException('缺少 licenseImageKey');
    }

    // 生成 5 分钟有效的签名 URL (阿里云 OCR 要求公网可访问)
    const imageUrl = await this.upload.getSignedUrl(body.licenseImageKey, 300);
    const result = await this.ocr.recognizeBusinessLicense({ imageUrl } as OcrBusinessLicenseInput);
    return { result };
  }

  /**
   * 企业 KYC 提交 — 法人姓名+身份证号 (营业执照信息已在 OCR 阶段拿到,前端一并传过来便于审计)
   *   入参包含 OCR 结果 + 法人证件信息,后端先调 OCR 重核(防止 OCR 结果被前端篡改),
   *   然后用法人姓名+身份证号调 AliyunKycClient 二要素核验。
   */
  @Post('enterprise/submit')
  async enterpriseSubmit(@CurrentUser() u: JwtUser, @Body() body: SubmitEnterpriseKycDto) {
    if (!this.ocr) {
      throw new ServiceUnavailableException('OCR 服务未配置 (OCR_DRIVER=aliyun)');
    }
    const submission = await this.kyc.submitEnterprise(u.id, body);
    return { submission };
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