import { Module } from '@nestjs/common';
import { IpsController } from './ips.controller';
import { IpsService } from './ips.service';
import { ProofingModule } from '../proofing/proofing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadModule } from '../upload/upload.module';
import { HonorModule } from '../honor/honor.module';

@Module({
  imports: [ProofingModule, NotificationsModule, UploadModule, HonorModule],
  controllers: [IpsController],
  providers: [IpsService],
  exports: [IpsService],
})
export class IpsModule {}