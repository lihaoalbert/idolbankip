import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AgeBucket, AssetType, Ethnicity, Gender } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/util/roles.util';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { ApiKeyService } from './api-key.service';
import { AgentService } from './agent.service';

class CreateApiKeyDto {
  @IsString() @MinLength(1) label!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) scopes?: string[];
  @IsOptional() expiresAt?: string;
}

// #32 脸特征标签: 与 controller 的 FaceTagDto 结构一致
class AgentFaceTagDto {
  @IsString() category!: string;
  @IsString() value!: string;
}

class BatchIpItemDto {
  @IsString() displayName!: string;
  @IsOptional() @IsString() tagline?: string;
  @IsString() description!: string;
  @IsEnum(Gender) gender!: Gender;
  @IsEnum(AgeBucket) ageBucket!: AgeBucket;
  @IsOptional() @IsEnum(Ethnicity) ethnicity?: Ethnicity;
  @IsArray() @IsString({ each: true }) styleTags!: string[];
  @IsArray() @IsString({ each: true }) scenarioTags!: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AgentFaceTagDto)
  faceTags?: AgentFaceTagDto[];
  @IsOptional() @IsInt() @Min(0) depositPriceFen?: number;
  @IsInt() @Min(0) fullLicensePriceFen!: number;
  // #31 面部特写在文件上传 callback 时由 upload.service 自动指定为 faceCloseupFileId (首张)
  // agent 客户端只需确保至少传 1 张 FACE_CLOSEUP, 不用这里指定 index
}

class AgentUploadPolicyDto {
  @IsString() ipId!: string;
  @IsEnum(AssetType) assetType!: AssetType;
  @IsString() filename!: string;
  @IsInt() @Min(0) size!: number;
}

class BatchCreateIpsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => BatchIpItemDto)
  items!: BatchIpItemDto[];
}

/**
 * /creator/api-keys — 创作者自己管 API key (JWT 鉴权)
 */
@ApiTags('agent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CREATOR)
@Controller('creator/api-keys')
export class ApiKeyController {
  constructor(private readonly service: ApiKeyService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.listForUser(user.id);
  }

  @Post()
  async create(@CurrentUser() user: JwtUser, @Body() body: CreateApiKeyDto) {
    const created = await this.service.create({
      userId: user.id,
      label: body.label,
      scopes: body.scopes,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
    return created;
  }

  @Delete(':id')
  async revoke(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    await this.service.revoke(id, user.id);
    return { ok: true };
  }
}

/**
 * /agent/* — 第三方 agent 调用 (x-api-key 鉴权, 与 JWT 平行)
 * 设计: agent 调用不写 audit 日志 (量大), 但所有 IP 元数据进入正常审核流。
 */
@ApiTags('agent')
@UseGuards(ApiKeyGuard)
@Controller('agent')
export class AgentController {
  constructor(private readonly service: AgentService) {}

  @Get('whoami')
  whoami(@CurrentUser() user: any) {
    return {
      userId: user.id,
      scopes: user.apiKeyScopes,
      apiKeyId: user.apiKeyId,
    };
  }

  @Post('ips/batch')
  batchCreateIps(@CurrentUser() user: any, @Body() body: BatchCreateIpsDto) {
    return this.service.batchCreateIps(user.id, body.items);
  }

  @Post('ips/upload-policy')
  uploadPolicy(@CurrentUser() user: any, @Body() body: AgentUploadPolicyDto) {
    return this.service.generateUploadPolicy(user.id, body.ipId, body.assetType, body.filename, body.size);
  }
}
