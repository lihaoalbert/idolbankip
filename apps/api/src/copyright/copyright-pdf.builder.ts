import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { PDFDocument, PDFFont, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { IpFile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';

/**
 * 著作权登记 PDF 申请包 — 4 页 A4 布局:
 *   P1: 人脸特写 hero (版权登记核心证据)
 *   P2: 三视图 (front / side / back, 横排)
 *   P3: 表情矩阵
 *   P4: 立绘图
 *
 * 字体复用 ContractsService 的 CJK 配置路径 (assets/fonts/NotoSansSC-*.gb2312.ttf),
 * 但本服务独立加载 (避免循环依赖; 后续可抽 PdfFontProvider,YAGNI 现在不抽).
 */
@Injectable()
export class CopyrightPdfBuilder implements OnModuleInit {
  private readonly logger = new Logger(CopyrightPdfBuilder.name);
  private fontRegularBytes: Buffer | null = null;
  private fontBoldBytes: Buffer | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
  ) {}

  async onModuleInit() {
    // 相对脚本位置而非 process.cwd(), 因为生产 systemd WorkingDirectory 是 apps/api,
    // 但本地可能从 monorepo 根跑 — 两种都覆盖 (优先 dist/../assets, 再 fallback cwd)
    const candidates = [
      path.resolve(__dirname, '..', '..', 'assets', 'fonts'),
      path.resolve(__dirname, '..', 'assets', 'fonts'),
      path.join(process.cwd(), 'assets', 'fonts'),
    ];
    for (const fontDir of candidates) {
      const regPath = path.join(fontDir, 'NotoSansSC-Regular.gb2312.ttf');
      const boldPath = path.join(fontDir, 'NotoSansSC-Bold.gb2312.ttf');
      try {
        if (fs.existsSync(regPath) && fs.existsSync(boldPath)) {
          this.fontRegularBytes = fs.readFileSync(regPath);
          this.fontBoldBytes = fs.readFileSync(boldPath);
          this.logger.log(`CopyrightPdfBuilder CJK fonts loaded from ${fontDir}`);
          return;
        }
      } catch { /* try next */ }
    }
    this.logger.error('CJK font load FAILED: 三个候选路径都找不到 fonts 目录; PDF 中文将无法正确渲染');
  }

  private async embedFonts(pdf: PDFDocument): Promise<{ reg: PDFFont; bold: PDFFont }> {
    pdf.registerFontkit(fontkit);
    if (this.fontRegularBytes && this.fontBoldBytes) {
      const reg = await pdf.embedFont(this.fontRegularBytes, { subset: false });
      const bold = await pdf.embedFont(this.fontBoldBytes, { subset: false });
      return { reg, bold };
    }
    const { StandardFonts } = await import('pdf-lib');
    const reg = await pdf.embedFont(StandardFonts.Helvetica);
    return { reg, bold: reg };
  }

  /**
   * 计算 IP 素材 material hash — 当 IpFile 列表变化时触发 PDF 重生成.
   * sha256(排序后 IpFile.id + updatedAt) — 任何文件被替换/删除/新增都会变.
   */
  async computeMaterialHash(ipId: string): Promise<string> {
    const crypto = await import('crypto');
    const files = await this.prisma.ipFile.findMany({
      where: {
        ipId,
        validated: true,
        assetType: { in: ['FACE_CLOSEUP', 'THREE_VIEW', 'EXPRESSION_GRID', 'TRANSPARENT_RENDER'] },
      },
      select: { id: true, uploadedAt: true },
      orderBy: { id: 'asc' },
    });
    return crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  }

  /**
   * 生成 PDF 申请包 (Buffer). 失败 throw BadRequestException.
   */
  async generatePdf(ipId: string): Promise<Buffer> {
    const ip = await this.prisma.ipAsset.findUnique({
      where: { id: ipId },
      include: {
        creator: { select: { displayName: true, realName: true } },
        faceCloseupFile: true,
      },
    });
    if (!ip) throw new BadRequestException('IP 不存在');
    if (!ip.faceCloseupFile) throw new BadRequestException('IP 还没有面部特写');

    // 收集各类型素材
    const threeViews = await this.prisma.ipFile.findMany({
      where: { ipId, validated: true, assetType: 'THREE_VIEW' },
      orderBy: { uploadedAt: 'asc' },
      take: 3,
    });
    const expression = await this.prisma.ipFile.findMany({
      where: { ipId, validated: true, assetType: 'EXPRESSION_GRID' },
      orderBy: { uploadedAt: 'asc' },
      take: 1,
    });
    const transparent = await this.prisma.ipFile.findMany({
      where: { ipId, validated: true, assetType: 'TRANSPARENT_RENDER' },
      orderBy: { uploadedAt: 'asc' },
      take: 1,
    });

    const pdf = await PDFDocument.create();
    const { reg: font, bold: fontBold } = await this.embedFonts(pdf);

    // A4: 595 x 842 pt
    const W = 595, H = 842;

    // === P1: 面部特写 hero ===
    const p1 = pdf.addPage([W, H]);
    this.drawHeader(p1, font, fontBold, ip.code, ip.displayName);
    await this.drawHeroImage(p1, ip.faceCloseupFile);
    this.drawFooter(p1, font, ip.creator.displayName, ip.creator.realName, 1);

    // === P2: 三视图 ===
    if (threeViews.length > 0) {
      const p2 = pdf.addPage([W, H]);
      this.drawSectionTitle(p2, fontBold, '三视图 · THREE VIEWS', 'front / side / back');
      await this.drawThreeViewGrid(p2, threeViews, ip.faceCloseupFile, font);
      this.drawFooter(p2, font, ip.creator.displayName, ip.creator.realName, 2);
    }

    // === P3: 表情矩阵 ===
    if (expression.length > 0) {
      const p3 = pdf.addPage([W, H]);
      this.drawSectionTitle(p3, fontBold, '表情矩阵 · EXPRESSION GRID', '');
      await this.drawSingleImage(p3, expression[0]);
      this.drawFooter(p3, font, ip.creator.displayName, ip.creator.realName, 3);
    }

    // === P4: 立绘图 ===
    if (transparent.length > 0) {
      const p4 = pdf.addPage([W, H]);
      this.drawSectionTitle(p4, fontBold, '立绘图 · TRANSPARENT RENDER', 'PNG (alpha)');
      await this.drawSingleImage(p4, transparent[0]);
      this.drawFooter(p4, font, ip.creator.displayName, ip.creator.realName, 4);
    }

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }

  // ---- helpers ----

  private drawHeader(page: any, font: PDFFont, bold: PDFFont, code: string, name: string) {
    page.drawText('ibi.ren · 著作权登记申请包', {
      x: 40, y: 800, size: 10, font: bold, color: rgb(0.7, 0.6, 0.3),
    });
    page.drawText(`编号 ${code}`, { x: 40, y: 780, size: 14, font: bold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`作品名称:${name}`, { x: 40, y: 758, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawLine({ start: { x: 40, y: 745 }, end: { x: 555, y: 745 }, thickness: 0.5, color: rgb(0.7, 0.6, 0.3) });
  }

  private drawFooter(page: any, font: PDFFont, creatorName: string, realName: string | null, pageNo: number) {
    const totalText = `捏者:${creatorName}${realName ? ` (${realName})` : ''} · ibi.ren 自动生成`;
    page.drawText(totalText, { x: 40, y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
    page.drawText(`第 ${pageNo} 页`, { x: 520, y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  }

  private drawSectionTitle(page: any, bold: PDFFont, title: string, sub: string) {
    page.drawText(title, { x: 40, y: 800, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
    if (sub) {
      page.drawText(sub, { x: 40, y: 778, size: 9, font: bold, color: rgb(0.5, 0.5, 0.5) });
    }
    page.drawLine({ start: { x: 40, y: 770 }, end: { x: 555, y: 770 }, thickness: 0.5, color: rgb(0.7, 0.6, 0.3) });
  }

  /** P1 — 大图 (face closeup) — 最大 ~500pt 高,居中 */
  private async drawHeroImage(page: any, file: IpFile) {
    try {
      const img = await this.embedImage(page.doc, file);
      const maxW = 480, maxH = 600;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * scale, h = img.height * scale;
      const x = (595 - w) / 2, y = 100;
      page.drawImage(img, { x, y, width: w, height: h });
    } catch (e: any) {
      page.drawText(`[面部特写图加载失败: ${file.originalName}]`, {
        x: 40, y: 400, size: 12, color: rgb(0.7, 0, 0),
      });
    }
  }

  /** P2 — 三视图 (3 张横排) */
  private async drawThreeViewGrid(page: any, files: IpFile[], fallback: IpFile, font: PDFFont) {
    const labels = ['front 正面', 'side 侧面', 'back 背面'];
    const cellW = 165, cellH = 460, gap = 10;
    const startX = (595 - cellW * 3 - gap * 2) / 2;
    const startY = 280;

    for (let i = 0; i < 3; i++) {
      const file = files[i] ?? fallback;
      const x = startX + (cellW + gap) * i;
      try {
        const img = await this.embedImage(page.doc, file);
        const scale = Math.min(cellW / img.width, cellH / img.height);
        const w = img.width * scale, h = img.height * scale;
        const cx = x + (cellW - w) / 2;
        const cy = startY + (cellH - h) / 2;
        page.drawImage(img, { x: cx, y: cy, width: w, height: h });
      } catch {
        page.drawText(`[图 ${i + 1} 加载失败]`, { x: x + 10, y: startY + cellH / 2, size: 9, font, color: rgb(0.7, 0, 0) });
      }
      // 边框 + 标签
      page.drawRectangle({ x, y: startY, width: cellW, height: cellH, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
      page.drawText(labels[i], { x: x + 8, y: startY - 18, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
    }
  }

  /** P3/P4 — 单张图占满中部 */
  private async drawSingleImage(page: any, file: IpFile) {
    try {
      const img = await this.embedImage(page.doc, file);
      const maxW = 480, maxH = 600;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * scale, h = img.height * scale;
      const x = (595 - w) / 2, y = 90;
      page.drawImage(img, { x, y, width: w, height: h });
    } catch (e: any) {
      page.drawText(`[图加载失败: ${file.originalName}]`, { x: 40, y: 400, size: 12, color: rgb(0.7, 0, 0) });
    }
  }

  private async embedImage(pdf: PDFDocument, file: IpFile): Promise<any> {
    // 通过 OSS private client 直接拿 buffer (参考 contracts.getCertBuffer 模式)
    const buf = await this.upload.getFileBuffer(file.ossKey);
    const mime = file.mimeType?.toLowerCase() || '';
    if (mime.includes('png')) {
      return pdf.embedPng(buf);
    }
    // 默认按 jpg 处理 (兼容 mimeType 为空/老数据)
    return pdf.embedJpg(buf);
  }
}