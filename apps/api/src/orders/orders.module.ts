import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentModule } from '../payment/payment.module';
import { ContractsModule } from '../contracts/contracts.module';

@Module({
  imports: [PaymentModule, ContractsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}