import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, Min } from 'class-validator';
import { AssetType } from '@prisma/client';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/util/roles.util';

class DirectPostPolicyDto {
  @IsString() ipId!: string;
  @IsEnum(AssetType) assetType!: AssetType;
  @IsString() filename!: string;
  @IsInt() @Min(0) size!: number;
}

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CREATOR)
@Controller('upload')
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  @Post('policy')
  async policy(@Body() body: DirectPostPolicyDto) {
    return this.upload.generateDirectPostPolicy(body);
  }
}