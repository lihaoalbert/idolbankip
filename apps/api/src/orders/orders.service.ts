import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HonorAction, LicenseScope, Order, OrderStatus, OrderType } from '@prisma/client';
import { PaymentChannel } from '@ibi-ren/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IpsService } from '../ips/ips.service';
import { PaymentService } from '../payment/payment.service';
import { ContractsService } from '../contracts/contracts.service';
import { HonorService } from '../honor/honor.service';
import { NotificationsService } from '../notifications/notifications.service';

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
    private readonly honor: HonorService,
    private readonly notifications: NotificationsService,
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

    // R11.1 P0-1: brief 中标订单走不同分支 — 不生成合同,直接 DOWNLOAD_UNLOCKED,通知创作者
    if (order.briefId) {
      return this.payBriefOrder(order, buyerId, channel);
    }
    return this.payIpOrder(order, buyerId, channel);
  }

  /**
   * R11.1 P0-1: brief 中标订单支付 — 创作者在 bid.acceptBid 时建了 Order 但没建 charge,
   * 这里 lazy create charge → markPaid → status DOWNLOAD_UNLOCKED → 通知创作者。
   * 不生成合同(brief 协作走 workspace 内的 approval,不走 IP 授权合同)。
   */
  private async payBriefOrder(order: Order, buyerId: string, channel: PaymentChannel): Promise<Order> {
    let paymentRef = order.paymentRef;
    if (!paymentRef) {
      const brief = await this.prisma.brief.findUnique({
        where: { id: order.briefId! },
        select: { id: true, title: true },
      });
      const charge = await this.payment.createCharge({
        orderId: order.id,
        buyerId,
        amountFen: order.amountFen,
        subject: `发包协作定金 - ${brief?.title ?? 'brief'}`,
        channel,
      });
      paymentRef = charge.chargeId;
      await this.prisma.order.update({
        where: { id: order.id },
        data: { paymentRef },
      });
    }

    const paid = await this.payment.markPaid(paymentRef, channel);
    if (!paid.paid) throw new BadRequestException('支付失败');

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'DOWNLOAD_UNLOCKED',
        paidAt: new Date(),
        paymentChannel: channel,
      },
    });

    // 通知中标的创作者
    const workspace = await this.prisma.workspace.findUnique({
      where: { briefId: order.briefId! },
      select: { creatorId: true, id: true },
    });
    if (workspace) {
      const brief = await this.prisma.brief.findUnique({
        where: { id: order.briefId! },
        select: { title: true },
      });
      this.notifications.create({
        userId: workspace.creatorId,
        type: 'ORDER_DEPOSIT_PAID',
        title: '买家已支付定金',
        body: `${brief?.title ?? '你的中标发包'} — 协作已激活,可上传中间稿`,
        link: `/creator/workspace/${workspace.id}`,
      }).catch((e) =>
        this.logger.warn(`notify creator (ORDER_DEPOSIT_PAID) failed: ${e?.message ?? e}`),
      );
    }

    await this.audit.log({
      actorId: buyerId,
      action: 'ORDER_PAID',
      targetType: 'Order',
      targetId: order.id,
      payload: { orderType: 'BRIEF_DEPOSIT', amountFen: order.amountFen, channel },
    });

    return updated;
  }

  /**
   * 原有 IP 授权订单支付流: 走合同生成 + 创作者荣誉。
   */
  private async payIpOrder(order: Order, buyerId: string, channel: PaymentChannel): Promise<Order> {
    if (!order.ipId) throw new BadRequestException('订单缺少 IP 关联');
    const result = await this.payment.markPaid(order.paymentRef!, channel);
    if (!result.paid) throw new BadRequestException('支付失败');

    const ip = await this.ips.requireById(order.ipId);
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'CONTRACT_PENDING',
        paidAt: new Date(),
        paymentChannel: channel,
      },
    });

    await this.contracts.generateFromOrder(updated, ip);

    await this.audit.log({
      actorId: buyerId,
      action: 'ORDER_PAID',
      targetType: 'Order',
      targetId: order.id,
      payload: { amountFen: order.amountFen, channel },
    });

    this.honor.record(ip.creatorId, HonorAction.IP_ORDERED, {
      refType: 'Order',
      refId: order.id,
      monetaryValueFen: order.amountFen,
      metadata: { ipCode: ip.code, amountFen: order.amountFen, channel },
    }).catch((e) =>
      this.logger.warn(`honor record (IP_ORDERED) failed: ${e?.message ?? e}`),
    );

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
      where: { buyerId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        // R10 P0-3: brief 中标创建的 Order 没有 ip 关联,前端用 ip=null 兜底显示 brief 标题
        ip: { select: { code: true, displayName: true, tagline: true, thumbnailKey: true } },
        // R10 P0-3: 关联 brief 摘要,前端显示 brief 标题 + 「中标待付」徽标
        brief: { select: { id: true, title: true, status: true } },
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
        brief: { select: { id: true, title: true, status: true } },
        contract: true,
      },
    });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }
}