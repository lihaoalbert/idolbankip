import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { OssCallbackController } from './oss-callback.controller';
import { WatermarkModule } from '../watermark/watermark.module';

@Module({
  imports: [ConfigModule, WatermarkModule],
  providers: [UploadService],
  controllers: [UploadController, OssCallbackController],
  exports: [UploadService],
})
export class UploadModule {}