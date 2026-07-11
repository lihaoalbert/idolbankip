import { Module } from '@nestjs/common';
import { CreditScoreController } from './credit.controller';
import { CreditScoreService } from './credit.service';

@Module({
  controllers: [CreditScoreController],
  providers: [CreditScoreService],
  exports: [CreditScoreService],
})
export class CreditModule {}
