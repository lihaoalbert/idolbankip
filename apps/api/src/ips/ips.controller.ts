import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AgeBucket, Ethnicity, Gender, IpStatus } from '@prisma/client';
import { UserRole } from '../common/util/roles.util';
import { IpsService } from './ips.service';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

// #32 脸特征标签: {category, value} 多选
class FaceTagDto {
  @IsString() category!: string;  // e.g. "FaceShape" / "HairColor" / "Vibe"
  @IsString() value!: string;     // e.g. "OVAL" / "BLACK" / "COOL"
}

class CreateIpDto {
  @IsString() displayName!: string;
  @IsOptional() @IsString() tagline?: string;
  @IsString() description!: string;
  @IsEnum(Gender) gender!: Gender;
  @IsEnum(AgeBucket) ageBucket!: AgeBucket;
  @IsOptional() @IsEnum(Ethnicity) ethnicity?: Ethnicity;
  @IsArray() @IsString({ each: true }) styleTags!: string[];
  @IsArray() @IsString({ each: true }) scenarioTags!: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FaceTagDto)
  faceTags?: FaceTagDto[];
  @IsOptional() @IsInt() @Min(0) depositPriceFen?: number;
  @IsInt() @Min(0) fullLicensePriceFen!: number;
}

class UpdateIpDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() tagline?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsEnum(AgeBucket) ageBucket?: AgeBucket;
  @IsOptional() @IsEnum(Ethnicity) ethnicity?: Ethnicity;
  @IsOptional() @IsArray() @IsString({ each: true }) styleTags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) scenarioTags?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FaceTagDto) faceTags?: FaceTagDto[];
  @IsOptional() @IsInt() @Min(0) depositPriceFen?: number;
  @IsOptional() @IsInt() @Min(0) fullLicensePriceFen?: number;
}

class RegisterCertDto {
  @IsString() certNo!: string;
}

class BulkIdsDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}

class ListQueryDto {
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsEnum(AgeBucket) ageBucket?: AgeBucket;
  @IsOptional() @IsEnum(Ethnicity) ethnicity?: Ethnicity;
  @IsOptional() @IsString() style?: string;
  @IsOptional() @IsString() scenario?: string;
  @IsOptional() @IsEnum(IpStatus) status?: IpStatus;
  @IsOptional() @IsIn(['newest', 'popular']) sort?: 'newest' | 'popular';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) size?: number;
}

@ApiTags('ips')
@Controller('ips')
export class IpsController {
  constructor(private readonly ips: IpsService) {}

  @Public()
  @Get()
  async list(@Query() q: ListQueryDto) {
    return this.ips.listPublic(q);
  }

  @Public()
  @Get(':code')
  async detail(@Param('code') code: string) {
    return this.ips.getDetail(code);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Post()
  async create(@CurrentUser() user: JwtUser, @Body() body: CreateIpDto) {
    const ip = await this.ips.create({ ...body, creatorId: user.id });
    return { ip };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Patch(':id')
  async update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: UpdateIpDto) {
    const ip = await this.ips.update(id, user.id, body);
    return { ip };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Post('bulk/submit')
  async bulkSubmit(@CurrentUser() user: JwtUser, @Body() body: BulkIdsDto) {
    return this.ips.bulkSubmit(body.ids, user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Post('bulk/archive')
  async bulkArchive(@CurrentUser() user: JwtUser, @Body() body: BulkIdsDto) {
    return this.ips.bulkArchive(body.ids, user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Post(':id/submit')
  async submit(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const ip = await this.ips.submitForReview(id, user.id);
    return { ip };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Get('mine/list')
  async listMine(@CurrentUser() user: JwtUser) {
    const items = await this.ips.listMine(user.id);
    return { items };
  }

  /**
   * #33 创作者查看自己 IP 的全部 PROCESS_EVIDENCE (带 description + processStep)
   * admin 也可以通过 /admin/ips/:id/files 看到
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Get(':id/process-evidence')
  async processEvidence(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.ips.listProcessEvidence(id, user.id);
  }

  /**
   * #33 删除单条创作证据 — 释放累计空间
   * 鉴权: 创作者只能删自己 IP 的 PROCESS_EVIDENCE
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Delete(':id/process-evidence/:fileId')
  async deleteProcessEvidence(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ips.deleteProcessEvidence(id, fileId, user.id);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/ips')
export class AdminIpsController {
  constructor(private readonly ips: IpsService) {}

  @Get('queue')
  async queue(@Query('status') status?: IpStatus) {
    return this.ips.listPublic({ status, page: 1, size: 100 });
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.ips.adminGetDetail(id);
  }

  @Post(':id/approve')
  async approve(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const ip = await this.ips.adminApprove(id, u.id);
    return { ip };
  }

  @Post(':id/reject')
  async reject(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: { reason: string }) {
    const ip = await this.ips.adminReject(id, u.id, body.reason);
    return { ip };
  }

  @Post(':id/register-cert')
  async registerCert(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: RegisterCertDto) {
    const ip = await this.ips.adminRegisterCert(id, u.id, body.certNo);
    return { ip };
  }
}