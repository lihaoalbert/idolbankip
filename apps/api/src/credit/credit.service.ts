import { Injectable, NotFoundException } from '@nestjs/common';
import { CreditScoreRule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreditMetrics, evalDimension } from './evaluators';

/**
 * W5 E3 — 信用分计算服务 (config-driven)
 *
 * 数据流:
 *   1. 取 user
 *   2. 实时从 DB 聚合 metrics (rating/dispute/bid/completed)
 *   3. 取最新 version 的 enabled rules
 *   4. 遍历规则:对每个维度调 evaluator 算 [0,1],乘 weight,累加
 *   5. 加和 × 100, clamp 到 [0, 100],四舍五入取整
 *
 * 为什么 config-driven:
 *   - 调权重不用发版
 *   - 新维度加 evaluator + rule,不动 service 主体
 *   - 用 version 隔离迭代 (新版上线后,旧版 natural decay)
 */

export interface CreditScoreRow {
  dimension: string;
  raw: number;
  weight: number;
  contribution: number;
}

export interface CreditScoreResult {
  userId: string;
  displayName: string;
  score: number;
  grade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  formulaVersion: number;
  breakdown: CreditScoreRow[];
  metrics: CreditMetrics;
  computedAt: string;
}

@Injectable()
export class CreditScoreService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 计算用户信用分 — 输入 userId, 输出 score + breakdown
   * @param asRole — 'creator' / 'buyer' — 不同角色用不同规则 (规则表通过 role 字段过滤)
   */
  async compute(userId: string, asRole: 'creator' | 'buyer' = 'creator'): Promise<CreditScoreResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    const metrics = await this.aggregateMetrics(userId, asRole);
    const rules = await this.loadActiveRules(asRole);

    const breakdown: CreditScoreRow[] = [];
    let sum = 0;
    for (const rule of rules) {
      const raw = evalDimension(rule.dimension, metrics);
      const weight = Number(rule.weight);
      const contribution = raw * weight;
      breakdown.push({ dimension: rule.dimension, raw, weight, contribution });
      sum += contribution;
    }
    // 和 × 100, clamp 0~100,取整
    const score = Math.max(0, Math.min(100, Math.round(sum * 100)));
    const grade = gradeFromScore(score);
    const formulaVersion = rules.length > 0 ? rules[0].version : 0;

    return {
      userId,
      displayName: user.displayName ?? '未知',
      score,
      grade,
      formulaVersion,
      breakdown,
      metrics,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * 聚合用户指标 — 4 个简单查询
   */
  private async aggregateMetrics(userId: string, asRole: 'creator' | 'buyer'): Promise<CreditMetrics> {
    // 1. 收到的评价统计 (role 决定收的是哪边评的)
    const reviewRole: 'buyer_to_creator' | 'creator_to_buyer' =
      asRole === 'creator' ? 'buyer_to_creator' : 'creator_to_buyer';
    const reviewAgg = await this.prisma.review.aggregate({
      where: { toUserId: userId, role: reviewRole },
      _avg: { rating: true },
      _count: { _all: true },
    });

    // 2. 已交付订单数 (asCreator / asBuyer)
    const completedAsCreator = await this.prisma.workspace.count({
      where: { creatorId: userId, status: 'approved' },
    });
    const completedAsBuyer = await this.prisma.brief.count({
      where: { buyerId: userId, status: 'closed' },
    });

    // 3. 收到的争议数 — 该用户作为参与方出现的 dispute (buyer or workspace.creator)
    const disputeCount = await this.prisma.dispute.count({
      where: {
        OR: [
          { brief: { buyerId: userId } },
          { brief: { workspace: { creatorId: userId } } },
        ],
      },
    });

    // 4. bid 接受率 (创作者)
    const bidAgg = await this.prisma.bid.aggregate({
      where: { creatorId: userId },
      _count: { _all: true },
    });
    const bidAccepted = await this.prisma.bid.count({
      where: { creatorId: userId, status: 'accepted' },
    });
    const bidAcceptRate =
      bidAgg._count._all > 0 ? bidAccepted / bidAgg._count._all : null;

    return {
      ratingAvg: reviewAgg._avg.rating,
      ratingCount: reviewAgg._count._all,
      completedAsCreator,
      completedAsBuyer,
      disputeCount,
      bidAcceptRate,
    };
  }

  /**
   * 取最新版本 + enabled 的规则 (role 维度:'creator' / 'buyer' / 'any')
   */
  private async loadActiveRules(role: 'creator' | 'buyer'): Promise<CreditScoreRule[]> {
    const all = await this.prisma.creditScoreRule.findMany({
      where: { enabled: true, OR: [{ role }, { role: 'any' }] },
      orderBy: { version: 'desc' },
    });
    if (!all.length) return [];
    const latestVersion = all[0].version;
    return all.filter((r) => r.version === latestVersion);
  }
}

/**
 * 分数 → 等级
 * ≥85 EXCELLENT / 70-84 GOOD / 50-69 FAIR / <50 POOR
 */
export function gradeFromScore(score: number): CreditScoreResult['grade'] {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'GOOD';
  if (score >= 50) return 'FAIR';
  return 'POOR';
}

export const GRADE_LABEL: Record<CreditScoreResult['grade'], string> = {
  EXCELLENT: '极佳',
  GOOD: '良好',
  FAIR: '一般',
  POOR: '欠佳',
};
