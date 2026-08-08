/**
 * scripts/seed-credit.ts — W5 E3 信用分规则种子
 *
 * 把所有信用分维度的权重 saturate 阈值写入 CreditScoreRule 表,
 * 服务端只读不写(evaluators.ts 是纯函数,纯逻辑)。
 * 修改权重 = 改这个文件 + 跑一次种子,无需发版。
 *
 * 版本机制:
 *   - 每次想调权重,新建一行(version++) 而不是覆盖
 *   - 服务端自动用最新启用版本
 *   - 失败回滚:把新版 disabled=true, 自动回旧版
 *
 * 跑法:
 *   cd apps/api && pnpm run seed:credit
 *   bash scripts/seed-deploy.sh credit    # ECS(暂未集成,先本机)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const VERSION = 1;

/**
 * Dimension 列表 (必须与 credit/evaluators.ts 的 evalDimension switch 对齐)
 * role:
 *   - 'creator' — 仅创作者维度
 *   - 'buyer'   — 仅买家维度
 *   - 'any'     — 两边都计
 *
 * weight 范围: -1 ~ 1,负值=扣分项
 * 起步版本:5 个核心维度,合计 weight ≈ 1.0 (creator)
 *   - rating_avg × 0.40  (主质量信号)
 *   - rating_count × 0.20  (样本量)
 *   - completed_count × 0.25  (产能)
 *   - dispute_count × -0.20  (倒扣,负权重)
 *   - bid_accept_rate × 0.15  (需求匹配)
 *   = 0.80 (剩余 0.20 留给后续 v2 新增维度)
 */
interface Rule {
  dimension: string;
  role: 'creator' | 'buyer' | 'any';
  weight: number;
  enabled?: boolean;
}

const RULES: Rule[] = [
  // creator 维度 — 5 项
  { dimension: 'rating_avg', role: 'creator', weight: 0.40 },
  { dimension: 'rating_count', role: 'creator', weight: 0.20 },
  { dimension: 'completed_count', role: 'creator', weight: 0.25 },
  { dimension: 'dispute_count', role: 'creator', weight: -0.20 },
  { dimension: 'bid_accept_rate', role: 'creator', weight: 0.15 },

  // buyer 维度 — 3 项 (买家不接 bid,只看评分 + 完成 + 投诉)
  { dimension: 'rating_avg', role: 'buyer', weight: 0.40 },
  { dimension: 'rating_count', role: 'buyer', weight: 0.20 },
  { dimension: 'completed_as_buyer_count', role: 'buyer', weight: 0.20 },
  { dimension: 'dispute_count', role: 'buyer', weight: -0.20 },
];

async function main() {
  console.log(`🚚 Seeding CreditScoreRule v${VERSION}...`);
  console.log(`  · ${RULES.length} rules`);

  let created = 0;
  let updated = 0;
  for (const r of RULES) {
    const existing = await prisma.creditScoreRule.findFirst({
      where: { dimension: r.dimension, role: r.role, version: VERSION },
    });
    if (existing) {
      await prisma.creditScoreRule.update({
        where: { id: existing.id },
        data: {
          weight: r.weight,
          enabled: r.enabled ?? true,
        },
      });
      updated++;
    } else {
      await prisma.creditScoreRule.create({
        data: {
          dimension: r.dimension,
          role: r.role,
          weight: r.weight,
          version: VERSION,
          enabled: r.enabled ?? true,
        },
      });
      created++;
    }
  }

  console.log(`  · created=${created}, updated=${updated}`);
  console.log('✅ Credit rule seed done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
