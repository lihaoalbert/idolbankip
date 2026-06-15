import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PAYMENT_CLIENT,
  PaymentChargeInfo,
  PaymentChannel,
  PaymentClient,
  PaymentCreateChargeInput,
  PaymentStatus,
} from '@ibi-ren/shared-contracts';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(@Inject(PAYMENT_CLIENT) private readonly client: PaymentClient) {}

  createCharge(input: PaymentCreateChargeInput): Promise<PaymentChargeInfo> {
    return this.client.createCharge(input);
  }

  isPaid(chargeId: string): Promise<PaymentStatus> {
    return this.client.isPaid(chargeId);
  }

  async markPaid(chargeId: string, channel: PaymentChannel): Promise<PaymentStatus> {
    const result = await this.client.markPaid(chargeId, channel);
    this.logger.log(`Charge ${chargeId} marked paid via ${channel}`);
    return result;
  }
}