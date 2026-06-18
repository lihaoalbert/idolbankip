import { Module } from '@nestjs/common';
import { CertController } from './cert.controller';
import { CertService } from './cert.service';
import { AuditModule } from '../audit/audit.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [AuditModule, UploadModule],
  controllers: [CertController],
  providers: [CertService],
  exports: [CertService],
})
export class CertModule {}
