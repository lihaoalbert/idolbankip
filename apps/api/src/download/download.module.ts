import { Module } from '@nestjs/common';
import { DownloadService } from './download.service';
import { DownloadController } from './download.controller';

@Module({
  providers: [DownloadService],
  controllers: [DownloadController],
  exports: [DownloadService],
})
export class DownloadModule {}