import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrationType } from '@prisma/client';

/**
 * 代办费解析器 — DB 优先,TS 兜底 (省版权局调价走 DB,代码不改即可生效).
 * 历史 snapshot 在 CopyrightRegistration.creatorAgentFeeFen 已固化,
 * 这里只用于"创作者当下看到的价格"和"新 submit 时的初始值".
 */
@Injectable()
export class CopyrightFeeResolver {
  private readonly logger = new Logger(CopyrightFeeResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  // 兜底默认值 (DB 查不到时用,只在内存里,不做持久化)
  private readonly FALLBACK_NATIONAL = 65000; // 650 元
  private readonly FALLBACK_PROVINCIAL: Record<string, number> = {
    北京市: 10000,
    上海市: 10000,
    广东省: 12000,
    浙江省: 8000,
    江苏省: 8000,
    四川省: 6000,
    福建省: 6000,
    山东省: 8000,
    湖北省: 8000,
    湖南省: 8000,
    河北省: 6000,
    河南省: 6000,
    山西省: 6000,
    安徽省: 6000,
    江西省: 6000,
    辽宁省: 6000,
    吉林省: 6000,
    黑龙江省: 6000,
    陕西省: 6000,
    甘肃省: 6000,
    青海省: 6000,
    宁夏回族自治区: 6000,
    新疆维吾尔自治区: 6000,
    内蒙古自治区: 6000,
    西藏自治区: 6000,
    广西壮族自治区: 6000,
    海南省: 6000,
    云南省: 6000,
    贵州省: 6000,
    重庆市: 8000,
    天津市: 8000,
  };

  /**
   * 解析代办费 (分). region 对 NATIONAL 可为空.
   */
  async resolve(level: RegistrationType, region?: string | null): Promise<number> {
    if (level === 'NATIONAL') {
      const row = await this.prisma.copyrightFeeConfig.findFirst({
        where: { level: 'NATIONAL', region: null, effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (row) return row.feeFen;
      return this.FALLBACK_NATIONAL;
    }

    if (!region) {
      throw new Error('PROVINCIAL 级别必须指定 region (省名)');
    }
    const row = await this.prisma.copyrightFeeConfig.findFirst({
      where: { level: 'PROVINCIAL', region, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (row) return row.feeFen;
    const fallback = this.FALLBACK_PROVINCIAL[region];
    if (fallback !== undefined) return fallback;
    // 未配置省份兜底 100 元
    this.logger.warn(`省份 ${region} 未配置代办费,使用兜底 10000 分`);
    return 10000;
  }

  /**
   * 返回前端表单用的完整价格表 (NATIONAL 单值 + PROVINCIAL 字典).
   */
  async getPublicConfig(): Promise<{
    national: number;
    provincial: Record<string, number>;
    fallback: { national: number; provincial: Record<string, number> };
  }> {
    const rows = await this.prisma.copyrightFeeConfig.findMany({
      where: { effectiveTo: null },
      orderBy: [{ level: 'asc' }, { region: 'asc' }],
    });
    const provincial: Record<string, number> = {};
    let national = this.FALLBACK_NATIONAL;
    for (const row of rows) {
      if (row.level === 'NATIONAL' && row.region === null) {
        national = row.feeFen;
      } else if (row.level === 'PROVINCIAL' && row.region) {
        provincial[row.region] = row.feeFen;
      }
    }
    return {
      national,
      provincial: { ...this.FALLBACK_PROVINCIAL, ...provincial },
      fallback: { national: this.FALLBACK_NATIONAL, provincial: this.FALLBACK_PROVINCIAL },
    };
  }
}