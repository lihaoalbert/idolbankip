import { customAlphabet } from 'nanoid';
import type {
  PaymentChargeInfo,
  PaymentChannel,
  PaymentClient,
  PaymentCreateChargeInput,
  PaymentStatus,
} from '../payment';

const nano = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 16);

interface MockCharge {
  orderId: string;
  amountFen: number;
  subject: string;
  channel: PaymentChannel;
  paid: boolean;
  paidAt?: Date;
  refId?: string;
}

/**
 * Mock 支付: 不接真实支付宝/微信,商户扫码后调 markPaid() 直接置 PAID。
 */
export class MockPaymentClient implements PaymentClient {
  private charges = new Map<string, MockCharge>();

  async createCharge(input: PaymentCreateChargeInput): Promise<PaymentChargeInfo> {
    const chargeId = `mock-charge-${nano()}`;
    this.charges.set(chargeId, {
      orderId: input.orderId,
      amountFen: input.amountFen,
      subject: input.subject,
      channel: input.channel,
      paid: false,
    });
    return {
      chargeId,
      payUrl: `https://mock.pay.local/checkout/${chargeId}`,
      qrCode: `mock://qr/${chargeId}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  }

  async isPaid(chargeId: string): Promise<PaymentStatus> {
    const c = this.charges.get(chargeId);
    if (!c) {
      return { paid: false };
    }
    return {
      paid: c.paid,
      paidAt: c.paidAt,
      channel: c.channel,
      refId: c.refId,
    };
  }

  async markPaid(chargeId: string, channel: PaymentChannel): Promise<PaymentStatus> {
    const c = this.charges.get(chargeId);
    if (!c) throw new Error(`Charge ${chargeId} not found`);
    c.paid = true;
    c.paidAt = new Date();
    c.refId = `mock-tx-${nano()}`;
    c.channel = channel;
    return {
      paid: true,
      paidAt: c.paidAt,
      channel: c.channel,
      refId: c.refId,
    };
  }
}