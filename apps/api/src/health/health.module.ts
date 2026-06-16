import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}