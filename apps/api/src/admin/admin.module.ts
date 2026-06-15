import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminIpsController } from '../ips/ips.controller';
import { AdminKycController } from '../kyc/kyc.controller';
import { IpsModule } from '../ips/ips.module';
import { KycModule } from '../kyc/kyc.module';
import { HealthController } from '../health/health.controller';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [IpsModule, KycModule, HealthModule],
  controllers: [AdminController, AdminIpsController, AdminKycController, HealthController],
})
export class AdminModule {}