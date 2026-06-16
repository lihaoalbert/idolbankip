import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IpStatus } from '@prisma/client';
import { UserRole } from '../common/util/roles.util';
import { IpsService } from './ips.service';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

class CreateIpDto {
  @IsString() displayName!: string;
  @IsOptional() @IsString() tagline?: string;
  @IsString() description!: string;
  @IsString() gender!: string;
  @IsString() visualAgeBucket!: string;
  @IsArray() @IsString({ each: true }) styleTags!: string[];
  @IsArray() @IsString({ each: true }) scenarioTags!: string[];
  @IsOptional() @IsInt() @Min(0) depositPriceFen?: number;
  @IsInt() @Min(0) fullLicensePriceFen!: number;
}

class UpdateIpDto extends CreateIpDto {}

class RegisterCertDto {
  @IsString() certNo!: string;
}

class ListQueryDto {
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() visualAgeBucket?: string;
  @IsOptional() @IsString() style?: string;
  @IsOptional() @IsString() scenario?: string;
  @IsOptional() @IsEnum(IpStatus) status?: IpStatus;
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