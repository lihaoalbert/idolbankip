import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Contract, ContractStatus, IpAsset, Order } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UploadService } from '../upload/upload.service';
import {
  ESIGN_CLIENT,
  ESignClient,
} from '@ibi-ren/shared-contracts';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
    private readonly audit: AuditService,
    @Inject(ESIGN_CLIENT) private readonly esign: ESignClient,
  ) {}

  /**
   * 根据订单生成合同 PDF,调电子签创建 flow
   */
  async generateFromOrder(order: Order, ip: IpAsset): Promise<Contract> {
    const buyer = await this.prisma.user.findUniqueOrThrow({ where: { id: order.buyerId } });
    const creator = await this.prisma.user.findUniqueOrThrow({ where: { id: ip.creatorId } });

    const variables = {
      ipCode: ip.code,
      ipName: ip.displayName,
      buyerCompany: buyer.companyName || buyer.displayName,
      buyerRealName: buyer.realName || buyer.displayName,
      creatorName: creator.displayName,
      orderType: order.orderType,
      licenseScope: order.licenseScope || 'N/A',
      amountFen: order.amountFen,
      amountCny: (order.amountFen / 100).toFixed(2),
      paidAt: new Date().toISOString(),
      copyrightEffective: order.copyrightEffective,
      blockchainTxId: ip.blockchainTxId || '',
      officialCertNo: ip.officialCertNo || '',
    };
    const templateCode = order.orderType === 'DEPOSIT_INTENT'
      ? 'DEPOSIT_INTENT_V1'
      : 'FULL_LICENSE_V1';

    // 生成 PDF
    const pdfBuffer = await this.renderContractPdf(variables, templateCode);

    // 上传到 OSS
    const ossKey = `contracts/${order.id}/draft-${Date.now()}.pdf`;
    await this.upload.uploadPrivate(ossKey, pdfBuffer).catch(() => {
      // 没配 OSS 时跳过,落到 contracts 桶
      return this.upload.uploadPrivate(ossKey, pdfBuffer);
    });

    // 创建电子签 flow
    const flow = await this.esign.createFlow({
      templateCode,
      contractTitle: `${ip.code} ${order.orderType === 'DEPOSIT_INTENT' ? '意向授权书' : '版权授权书'}`,
      variables,
      signers: [
        { role: 'BUYER', name: buyer.displayName, phone: buyer.phone || undefined },
        { role: 'PLATFORM', name: 'ibi.ren 平台', phone: '4000000000' },
      ],
    });

    // 写库
    const contract = await this.prisma.contract.create({
      data: {
        orderId: order.id,
        templateCode,
        ossTemplateKey: ossKey,
        variablesJson: variables,
        esignProvider: 'mock_fadada',
        esignFlowId: flow.flowId,
        status: 'AWAITING_BUYER_SIGN',
      },
    });

    await this.audit.log({
      actorId: order.buyerId,
      action: 'CONTRACT_GENERATED',
      targetType: 'Contract',
      targetId: contract.id,
      payload: { orderId: order.id, templateCode, flowId: flow.flowId },
    });

    return contract;
  }

  /**
   * 买方签署
   */
  async buyerSign(contractId: string, buyerId: string): Promise<Contract> {
    const c = await this.requireById(contractId);
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: c.orderId } });
    if (order.buyerId !== buyerId) throw new ForbiddenException();
    if (c.status !== 'AWAITING_BUYER_SIGN') {
      throw new ForbiddenException(`合同当前状态 ${c.status} 不允许买方签署`);
    }
    await this.esign.markSigned(c.esignFlowId!, 'BUYER');
    const updated = await this.prisma.contract.update({
      where: { id: c.id },
      data: { status: 'AWAITING_PLATFORM_SIGN', buyerSignedAt: new Date() },
    });
    await this.audit.log({
      actorId: buyerId,
      action: 'CONTRACT_BUYER_SIGNED',
      targetType: 'Contract',
      targetId: c.id,
    });
    return updated;
  }

  /**
   * 平台签署
   */
  async platformSign(contractId: string, actorId: string): Promise<Contract> {
    const c = await this.requireById(contractId);
    if (c.status !== 'AWAITING_PLATFORM_SIGN') {
      throw new ForbiddenException(`合同当前状态 ${c.status} 不允许平台签署`);
    }
    await this.esign.markSigned(c.esignFlowId!, 'PLATFORM');

    // 生成最终签署版 PDF
    const variables = c.variablesJson as Record<string, unknown>;
    const finalPdf = await this.renderSignedPdf(variables, c.templateCode);
    const signedKey = `contracts/${c.orderId}/signed-${Date.now()}.pdf`;
    await this.upload.uploadPrivate(signedKey, finalPdf);

    const updated = await this.prisma.contract.update({
      where: { id: c.id },
      data: {
        status: 'FULLY_SIGNED',
        platformSignedAt: new Date(),
        fullySignedAt: new Date(),
        ossSignedKey: signedKey,
      },
    });

    // 触发订单 DOWNLOAD_UNLOCKED
    await this.prisma.order.update({
      where: { id: c.orderId },
      data: { status: 'DOWNLOAD_UNLOCKED' },
    });

    await this.audit.log({
      actorId,
      action: 'CONTRACT_FULLY_SIGNED',
      targetType: 'Contract',
      targetId: c.id,
    });
    return updated;
  }

  async getDetail(contractId: string, requesterId: string) {
    const c = await this.requireById(contractId);
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: c.orderId } });
    if (order.buyerId !== requesterId) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: requesterId } });
      if (user.role !== 'ADMIN') throw new ForbiddenException();
    }
    return { contract: c };
  }

  async requireById(id: string): Promise<Contract> {
    const c = await this.prisma.contract.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('合同不存在');
    return c;
  }

  // =============== PDF 生成 (MVP) ===============

  private async renderContractPdf(vars: Record<string, any>, templateCode: string): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const title = templateCode === 'DEPOSIT_INTENT_V1' ? 'AI 虚拟人形象意向授权书' : 'AI 虚拟人形象版权授权书';
    page.drawText(title, { x: 50, y: 780, size: 18, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

    const lines = [
      '',
      `IP 编号:    ${vars.ipCode}`,
      `IP 名称:    ${vars.ipName}`,
      `买方企业:   ${vars.buyerCompany}`,
      `授权方:     ${vars.creatorName}`,
      `授权类型:   ${vars.orderType === 'DEPOSIT_INTENT' ? '意向金 / 测试期使用权' : '正式授权'}`,
      `授权范围:   ${vars.licenseScope}`,
      `金额:       ¥${vars.amountCny}`,
      `支付时间:   ${vars.paidAt}`,
      '',
      '一、版权状态说明',
      `本合同签订时,该 AI 虚拟人形象正在版权登记流程中。`,
      `平台已将该形象的关键元数据通过区块链存证,交易编号: ${vars.blockchainTxId}。`,
      `版权登记号: ${vars.officialCertNo || '(待下发)'}。`,
      '',
      '二、附条件生效条款',
      '若在版权正式下发前,发生第三方就该形象主张权利的纠纷,',
      '平台 ibi.ren 承诺:',
      '  1. 无条件全额退款;或',
      '  2. 为买方免费更换等值的其他 IP。',
      '',
      '三、买方承诺',
      '买方承诺合法使用该形象,不得用于违法、违规场景。',
      '',
      '四、平台与买方电子签章以本 PDF + 区块链存证为准。',
    ];
    let y = 740;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 10, font, color: rgb(0.15, 0.15, 0.15) });
      y -= 18;
    }

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }

  private async renderSignedPdf(vars: Record<string, any>, templateCode: string): Promise<Buffer> {
    const base = await this.renderContractPdf(vars, templateCode);
    const pdf = await PDFDocument.load(base);
    const page = pdf.getPages()[0];
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    page.drawText('[SIGNED] Buyer + Platform', {
      x: 50,
      y: 30,
      size: 10,
      font,
      color: rgb(0.8, 0.1, 0.1),
    });
    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }
}