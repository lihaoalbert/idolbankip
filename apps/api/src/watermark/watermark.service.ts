import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { WATERMARK_CLIENT, WatermarkClient } from '@ibi-ren/shared-contracts';
import { Inject } from '@nestjs/common';

@Injectable()
export class WatermarkService {
  private readonly logger = new Logger(WatermarkService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WATERMARK_CLIENT) private readonly client: WatermarkClient,
  ) {}

  /**
   * 给缩略图 / 预览图打可视水印 (对角斜向文本)
   * MVP 实现: 用 sharp 直接合成
   */
  async applyVisible(imageBuffer: Buffer, text: string): Promise<Buffer> {
    try {
      const { width = 800, height = 800 } = await sharp(imageBuffer).metadata();
      const fontSize = Math.max(16, Math.floor(width / 30));
      // 用 SVG 叠加水印 (sharp 不支持中文,生产用 image-size + node-canvas)
      const svg = `
        <svg width="${width}" height="${height}">
          <style>
            .wm { font: bold ${fontSize}px sans-serif; fill: rgba(255,255,255,0.55); }
          </style>
          ${this.tiledText(width, height, fontSize, text)}
        </svg>`;
      return sharp(imageBuffer)
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch (err) {
      this.logger.warn(`Watermark failed, fallback to original: ${(err as Error).message}`);
      return imageBuffer;
    }
  }

  private tiledText(w: number, h: number, fontSize: number, text: string): string {
    const stepX = Math.max(180, fontSize * 10);
    const stepY = Math.max(120, fontSize * 7);
    const rows: string[] = [];
    for (let y = 0; y < h + stepY; y += stepY) {
      for (let x = -stepX; x < w + stepX; x += stepX) {
        rows.push(`<text x="${x}" y="${y}" class="wm" transform="rotate(-30 ${x} ${y})">${this.escape(text)}</text>`);
      }
    }
    return rows.join('');
  }

  private escape(s: string): string {
    return s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
  }

  async recordWatermark(params: {
    ipId: string;
    sourceFileId: string;
    outputFileId?: string;
    algorithm: string;
    payload: string;
  }) {
    return this.prisma.watermarkRecord.create({ data: params });
  }
}