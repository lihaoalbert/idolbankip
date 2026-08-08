import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NiApiService } from './ni-api.service';
import { MockNiJwtGuard } from './mock-jwt.guard';
import { LoginDto } from './dto/login.dto';

@Controller('v1')
export class NiApiController {
  constructor(private readonly niApi: NiApiService) {}

  // OAuth 2.0 password grant(简化版,mock 阶段任何 email/password 都过)
  @Post('auth/login')
  login(@Body() body: LoginDto) {
    return this.niApi.login(body.email, body.password);
  }

  @UseGuards(MockNiJwtGuard)
  @Get('ips')
  listIps(
    @Query('page') pageRaw?: string,
    @Query('page_size') pageSizeRaw?: string,
    @Query('status') status?: string,
  ) {
    const page = Math.max(1, parseInt(pageRaw ?? '1', 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(pageSizeRaw ?? '20', 10) || 20),
    );
    return this.niApi.listIps(page, pageSize, status);
  }

  @UseGuards(MockNiJwtGuard)
  @Get('ips/:id')
  getDetail(@Param('id') id: string) {
    return this.niApi.getDetail(id);
  }

  @UseGuards(MockNiJwtGuard)
  @Get('ips/:id/license')
  getLicense(@Param('id') id: string) {
    return this.niApi.getLicense(id);
  }

  @UseGuards(MockNiJwtGuard)
  @Get('ips/:id/signed-url')
  getSignedUrl(@Param('id') id: string, @Query('asset') asset?: string) {
    if (!asset) {
      throw new BadRequestException({
        error: {
          code: 'invalid_request',
          message:
            'asset query param required (preview_2k|preview_4k|voice_sample|expression_set)',
          request_id: null,
        },
      });
    }
    return this.niApi.getSignedUrl(id, asset);
  }
}