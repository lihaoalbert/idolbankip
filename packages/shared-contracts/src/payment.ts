export type PaymentChannel = 'mock_alipay' | 'mock_wechat' | 'mock_bank';

export interface PaymentCreateChargeInput {
  orderId: string;
  amountFen: number;
  subject: string;
  channel: PaymentChannel;
  buyerId: string;
}

export interface PaymentChargeInfo {
  chargeId: string;
  payUrl?: string;
  qrCode?: string;
  expiresAt: Date;
}

export interface PaymentStatus {
  paid: boolean;
  paidAt?: Date;
  channel?: PaymentChannel;
  refId?: string;
}

export interface PaymentClient {
  createCharge(input: PaymentCreateChargeInput): Promise<PaymentChargeInfo>;
  isPaid(chargeId: string): Promise<PaymentStatus>;
  markPaid(chargeId: string, channel: PaymentChannel): Promise<PaymentStatus>;
}

export const PAYMENT_CLIENT = Symbol('PAYMENT_CLIENT');