import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { Request } from 'express';
import { DownloadService } from './download.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

class TokenRequestDto {
  @IsString() orderId!: string;
  @IsString() fileId!: string;
}

@ApiTags('download')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('download')
export class DownloadController {
  constructor(private readonly download: DownloadService) {}

  @Get('list')
  async list(@CurrentUser() u: JwtUser, @Query('orderId') orderId: string) {
    return this.download.list(orderId, u.id);
  }

  @Post('token')
  async token(
    @CurrentUser() u: JwtUser,
    @Body() body: TokenRequestDto,
    @Req() req: Request,
  ) {
    return this.download.generateSignedUrl({
      orderId: body.orderId,
      fileId: body.fileId,
      requesterId: u.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}