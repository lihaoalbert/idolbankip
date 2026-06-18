import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LicenseScope, Order, OrderStatus, OrderType } from '@prisma/client';
import { PaymentChannel } from '@ibi-ren/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IpsService } from '../ips/ips.service';
import { PaymentService } from '../payment/payment.service';
import { ContractsService } from '../contracts/contracts.service';

const PLATFORM_FEE_RATE = 0.15; // 15%

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ips: IpsService,
    private readonly payment: PaymentService,
    private readonly contracts: ContractsService,
    private readonly audit: AuditService,
  ) {}

  async create(params: {
    buyerId: string;
    ipId: string;
    orderType: OrderType;
    licenseScope?: LicenseScope;
    paymentChannel?: PaymentChannel;
  }): Promise<{ order: Order; charge: { chargeId: string; payUrl?: string; qrCode?: string } }> {
    const ip = await this.ips.requireById(params.ipId);
    if (ip.status !== 'PUBLIC_INTENT' && ip.status !== 'OFFICIAL_REGISTERED') {
      throw new BadRequestException('该 IP 当前不可购买');
    }
    if (params.orderType === 'FULL_LICENSE' && !params.licenseScope) {
      throw new BadRequestException('正式授权必须选择授权范围');
    }

    const amountFen = params.orderType === 'DEPOSIT_INTENT'
      ? ip.depositPriceFen
      : ip.fullLicensePriceFen;
    const platformFeeFen = params.orderType === 'DEPOSIT_INTENT'
      ? 0
      : Math.floor(amountFen * PLATFORM_FEE_RATE);

    const order = await this.prisma.order.create({
      data: {
        buyerId: params.buyerId,
        ipId: ip.id,
        orderType: params.orderType,
        licenseScope: params.licenseScope,
        amountFen,
        platformFeeFen,
        status: 'CREATED',
        copyrightEffective: ip.status === 'OFFICIAL_REGISTERED',
      },
    });

    // 创建支付单
    const charge = await this.payment.createCharge({
      orderId: order.id,
      buyerId: params.buyerId,
      amountFen,
      subject: `${ip.code} ${params.orderType === 'DEPOSIT_INTENT' ? '意向金' : '正式授权'} - ${ip.displayName}`,
      channel: params.paymentChannel || 'mock_alipay',
    });
    // 关联 chargeId 到 order.paymentRef (简化)
    await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentRef: charge.chargeId },
    });
    await this.audit.log({
      actorId: params.buyerId,
      action: 'ORDER_CREATED',
      targetType: 'Order',
      targetId: order.id,
      payload: { orderType: params.orderType, amountFen },
    });
    return { order, charge };
  }

  async pay(orderId: string, buyerId: string, channel: PaymentChannel): Promise<Order> {
    const order = await this.requireOrderById(orderId);
    if (order.buyerId !== buyerId) throw new ForbiddenException();
    if (order.status !== 'CREATED') throw new BadRequestException(`订单当前状态 ${order.status} 不允许支付`);

    const result = await this.payment.markPaid(order.paymentRef!, channel);
    if (!result.paid) throw new BadRequestException('支付失败');

    const ip = await this.ips.requireById(order.ipId);

    // 如果是 DEPOSIT_INTENT,需要买方接受附条件风险才能继续
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'CONTRACT_PENDING',
        paidAt: new Date(),
        paymentChannel: channel,
      },
    });

    // 自动生成合同
    await this.contracts.generateFromOrder(updated, ip);

    await this.audit.log({
      actorId: buyerId,
      action: 'ORDER_PAID',
      targetType: 'Order',
      targetId: orderId,
      payload: { amountFen: order.amountFen, channel },
    });
    return updated;
  }

  async acceptConditionalRisk(orderId: string, buyerId: string): Promise<Order> {
    const order = await this.requireOrderById(orderId);
    if (order.buyerId !== buyerId) throw new ForbiddenException();
    if (order.copyrightEffective) {
      throw new BadRequestException('该 IP 已登记版权,无需接受附条件风险');
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: { buyerAcceptedRisk: true },
    });
  }

  async listMine(buyerId: string, status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: { buyerId, status },
      orderBy: { createdAt: 'desc' },
      include: {
        ip: { select: { code: true, displayName: true, tagline: true, thumbnailKey: true } },
        contract: { select: { id: true, status: true, ossSignedKey: true } },
      },
    });
  }

  async requireOrderById(id: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  async getDetail(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        ip: true,
        contract: true,
      },
    });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }
}