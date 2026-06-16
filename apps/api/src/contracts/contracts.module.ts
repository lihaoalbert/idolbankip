import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { UploadModule } from '../upload/upload.module';
import {
  ESIGN_CLIENT,
  MockFadadaClient,
} from '@ibi-ren/shared-contracts';

@Module({
  imports: [ConfigModule, UploadModule],
  providers: [
    ContractsService,
    {
      provide: ESIGN_CLIENT,
      useFactory: () => new MockFadadaClient(),
    },
  ],
  controllers: [ContractsController],
  exports: [ContractsService],
})
export class ContractsModule {}