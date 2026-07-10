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
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { UserRole } from '../common/util/roles.util';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { ASSET_TYPES, CreatorAssetsService } from './creator-assets.service';

class CreateAssetDto {
  @IsIn(ASSET_TYPES as unknown as string[]) type!: 'model' | 'prompt_template';
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsOptional() @IsString() ossKey?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fileSize?: number;
  @IsOptional() @IsString() mimeType?: string;
  @IsOptional() @IsString() @MaxLength(20000) content?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) tags?: string[];
}

class UpdateAssetDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(20000) content?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) tags?: string[];
}

class ListAssetQueryDto {
  @IsOptional() @IsIn(ASSET_TYPES as unknown as string[]) type?: 'model' | 'prompt_template';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) size?: number;
}

@ApiTags('creator-assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CREATOR)
@Controller('creator/assets')
export class CreatorAssetsController {
  constructor(private readonly assets: CreatorAssetsService) {}

  @Post()
  async create(@CurrentUser() u: JwtUser, @Body() body: CreateAssetDto) {
    const asset = await this.assets.create(u.id, body);
    return { asset };
  }

  @Get()
  async list(@CurrentUser() u: JwtUser, @Query() q: ListAssetQueryDto) {
    return this.assets.list(u.id, q);
  }

  @Get(':id')
  async detail(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const asset = await this.assets.findOne(id, u.id);
    return { asset };
  }

  @Patch(':id')
  async update(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Body() body: UpdateAssetDto,
  ) {
    const asset = await this.assets.update(id, u.id, body);
    return { asset };
  }

  @Delete(':id')
  async remove(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    await this.assets.remove(id, u.id);
    return { ok: true };
  }
}