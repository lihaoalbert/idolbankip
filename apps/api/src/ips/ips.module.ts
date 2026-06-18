import { Module } from '@nestjs/common';
import { IpsController } from './ips.controller';
import { IpsService } from './ips.service';
import { ProofingModule } from '../proofing/proofing.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ProofingModule, NotificationsModule],
  controllers: [IpsController],
  providers: [IpsService],
  exports: [IpsService],
})
export class IpsModule {}