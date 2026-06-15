import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProofingService } from './proofing.service';
import { BLOCKCHAIN_CLIENT, MockBlockchainClient } from '@ibi-ren/shared-contracts';

@Module({
  imports: [ConfigModule],
  providers: [
    ProofingService,
    {
      provide: BLOCKCHAIN_CLIENT,
      useFactory: (config: ConfigService) => {
        // MVP 全部 mock。真实接入时按 driver 切换
        return new MockBlockchainClient();
      },
      inject: [ConfigService],
    },
  ],
  exports: [ProofingService],
})
export class ProofingModule {}