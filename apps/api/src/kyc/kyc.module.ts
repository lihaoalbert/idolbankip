import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { KYC_CLIENT, MockKycClient } from '@ibi-ren/shared-contracts';

@Module({
  imports: [ConfigModule],
  providers: [
    KycService,
    {
      provide: KYC_CLIENT,
      useClass: MockKycClient,
    },
  ],
  controllers: [KycController],
  exports: [KycService],
})
export class KycModule {}