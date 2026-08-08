import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogSku, AcceptanceTemplate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * #30.7.1 W2 #28 Catalog 服务 — 平台标准 SKU 菜单 + 验收模板
 *
 * SKU 是"不可议价"的标准服务单元,加价/加项走另外通道(Brief.bumpPrice / Brief.addOns)
 * 15 SKU = 5 品类 × 3 档(essential / standard / premium)
 * 每个 SKU 配 1 份默认 acceptanceChecklist 模板
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 公开:列出所有启用的 SKU(平台菜单 /studio/catalog)
   * 可选按 category / tier 过滤
   */
  async listSkus(filter: { category?: string; tier?: string } = {}): Promise<CatalogSku[]> {
    const where: any = { enabled: true };
    if (filter.category) where.category = filter.category;
    if (filter.tier) where.tier = filter.tier;
    return this.prisma.catalogSku.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { tier: 'asc' }],
    });
  }

  async getSkuById(id: string): Promise<CatalogSku> {
    const sku = await this.prisma.catalogSku.findUnique({ where: { id } });
    if (!sku) throw new NotFoundException(`SKU ${id} 不存在`);
    return sku;
  }

  async getSkuByCode(code: string): Promise<CatalogSku | null> {
    return this.prisma.catalogSku.findUnique({ where: { code } });
  }

  /**
   * 公开:列出所有启用的验收模板
   */
  async listTemplates(filter: { category?: string; tier?: string } = {}): Promise<AcceptanceTemplate[]> {
    const where: any = { enabled: true };
    if (filter.category) where.category = filter.category;
    if (filter.tier) where.tier = filter.tier;
    return this.prisma.acceptanceTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { tier: 'asc' }],
    });
  }

  async getTemplateById(id: string): Promise<AcceptanceTemplate> {
    const tpl = await this.prisma.acceptanceTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException(`验收模板 ${id} 不存在`);
    return tpl;
  }
}
