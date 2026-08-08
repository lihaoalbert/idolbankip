/**
 * Credit score evaluators — W5 E3 (pure functions, 无副作用)
 *
 * 命名约定: `eval<Dimension>` 返回 [0, 1] 的标准化值
 * - 0 = 最差 / 1 = 最好
 * - 负权重规则 (e.g. dispute_count) 由规则 weight = -0.1 表达,evaluator 仍返 [0,1]
 *
 * 输入 `CreditMetrics`: 由 CreditService 实时从 DB 聚合
 */

export interface CreditMetrics {
  /** 收到的评价平均分 (1-5), null=无评价 */
  ratingAvg: number | null;
  /** 收到的评价条数 */
  ratingCount: number;
  /** 已交付订单数 (workspace.status=approved) — 作为创作者角色 */
  completedAsCreator: number;
  /** 已交付订单数 (brief.status=closed via buyer) — 作为买家角色 */
  completedAsBuyer: number;
  /** 收到的争议/投诉数 (Dispute 状态 != resolved_buyer) */
  disputeCount: number;
  /** bid 接受率 (accepted / submitted), null=无 bid */
  bidAcceptRate: number | null;
}

/** star rating 1-5 → [0,1], 5 星=1, 3 星=0.5, 1 星=0 */
export function evalRatingAvg(ratingAvg: number | null): number {
  if (ratingAvg === null) return 0.5; // 无评价 = 中性默认 (避免冷启动扣分)
  // 1→0, 3→0.5, 5→1 (linear)
  return Math.max(0, Math.min(1, (ratingAvg - 1) / 4));
}

/** 评价条数饱和到 1 (≥20 条 = 1), 中小数量时按 sqrt 增长 */
export function evalRatingCount(ratingCount: number): number {
  // 1 → 0.22, 5 → 0.5, 20 → 1.0  (sqrt based)
  return Math.min(1, Math.sqrt(ratingCount) / Math.sqrt(20));
}

/** 已交付订单数, 饱和到 30 单 = 1 */
export function evalCompletedCount(count: number): number {
  return Math.min(1, Math.sqrt(count) / Math.sqrt(30));
}

/** 投诉数, 0=1, 1=0.7, 3=0.4, ≥5=0 (倒扣分逻辑由权重为负实现) */
export function evalDisputeCount(disputeCount: number): number {
  return Math.max(0, 1 - disputeCount * 0.2);
}

/** bid 接受率 (0-1), null=无 bid (创作者从未投标 → 0.5 中性) */
export function evalBidAcceptRate(rate: number | null): number {
  if (rate === null) return 0.5;
  return Math.max(0, Math.min(1, rate));
}

/**
 * 主调用入口: 根据 dimension 字符串转发到对应 evaluator
 * 未注册的 dimension 返 0 (保守 + 安全 + 不抛错)
 */
export function evalDimension(
  dimension: string,
  metrics: CreditMetrics,
): number {
  switch (dimension) {
    case 'rating_avg':
      return evalRatingAvg(metrics.ratingAvg);
    case 'rating_count':
      return evalRatingCount(metrics.ratingCount);
    case 'completed_count':
      return evalCompletedCount(metrics.completedAsCreator);
    case 'completed_as_buyer_count':
      return evalCompletedCount(metrics.completedAsBuyer);
    case 'dispute_count':
      return evalDisputeCount(metrics.disputeCount);
    case 'bid_accept_rate':
      return evalBidAcceptRate(metrics.bidAcceptRate);
    default:
      // 未知维度不抛错 — 跳过返 0
      return 0;
  }
}
