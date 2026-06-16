import { Module } from '@nestjs/common';
import { DownloadService } from './download.service';
import { DownloadController } from './download.controller';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  providers: [DownloadService],
  controllers: [DownloadController],
  exports: [DownloadService],
})
export class DownloadModule {}