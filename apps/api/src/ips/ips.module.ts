import { Module } from '@nestjs/common';
import { IpsController } from './ips.controller';
import { IpsService } from './ips.service';
import { ProofingModule } from '../proofing/proofing.module';

@Module({
  imports: [ProofingModule],
  controllers: [IpsController],
  providers: [IpsService],
  exports: [IpsService],
})
export class IpsModule {}