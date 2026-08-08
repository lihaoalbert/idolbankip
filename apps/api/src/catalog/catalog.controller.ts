import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CatalogService } from './catalog.service';

/**
 * #30.7.1 W2 #28 Catalog 公开端点 — 平台标准菜单
 *
 * 所有端点 @Public:买家发包前 / 创作者投标前 / 公开宣传页 都能访问
 * 平台公信力底层 — 菜单透明不可议价
 */
@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /**
   * 公开:列出 SKU 菜单(可按 category / tier 过滤)
   * GET /api/v1/catalog/skus
   * GET /api/v1/catalog/skus?category=shortvideo
   * GET /api/v1/catalog/skus?category=shortvideo&tier=standard
   */
  @Public()
  @Get('skus')
  async listSkus(@Query('category') category?: string, @Query('tier') tier?: string) {
    const items = await this.catalog.listSkus({ category, tier });
    return { items };
  }

  /**
   * 公开:单个 SKU 详情
   * GET /api/v1/catalog/skus/:id
   */
  @Public()
  @Get('skus/:id')
  async getSku(@Param('id') id: string) {
    return this.catalog.getSkuById(id);
  }

  /**
   * 公开:列出验收清单模板
   * GET /api/v1/catalog/templates
   */
  @Public()
  @Get('templates')
  async listTemplates(@Query('category') category?: string, @Query('tier') tier?: string) {
    const items = await this.catalog.listTemplates({ category, tier });
    return { items };
  }

  /**
   * 公开:单个验收模板详情
   * GET /api/v1/catalog/templates/:id
   */
  @Public()
  @Get('templates/:id')
  async getTemplate(@Param('id') id: string) {
    return this.catalog.getTemplateById(id);
  }
}
