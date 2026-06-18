import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminIpsController } from '../ips/ips.controller';
import { AdminKycController } from '../kyc/kyc.controller';
import { AdminCertController } from './admin-cert.controller';
import { IpsModule } from '../ips/ips.module';
import { KycModule } from '../kyc/kyc.module';
import { CertModule } from '../cert/cert.module';
import { HealthController } from '../health/health.controller';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [IpsModule, KycModule, CertModule, HealthModule],
  controllers: [AdminController, AdminIpsController, AdminKycController, AdminCertController, HealthController],
})
export class AdminModule {}