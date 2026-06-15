import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentService } from './payment.service';
import {
  PAYMENT_CLIENT,
  MockPaymentClient,
} from '@ibi-ren/shared-contracts';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    PaymentService,
    {
      provide: PAYMENT_CLIENT,
      useFactory: () => new MockPaymentClient(),
    },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}