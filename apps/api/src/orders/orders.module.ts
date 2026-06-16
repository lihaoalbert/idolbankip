import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentModule } from '../payment/payment.module';
import { ContractsModule } from '../contracts/contracts.module';
import { IpsModule } from '../ips/ips.module';

@Module({
  imports: [PaymentModule, ContractsModule, IpsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}