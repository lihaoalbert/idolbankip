/**
 * 徽章条件 evaluator 注册表
 *
 * 业务规则表 `HonorBadge.conditionJson` 形如:
 *   { type: "TOTAL_VIEWS_GTE", threshold: 1000 }
 * 这里的 evaluator 把 JSON 描述符翻译成 Prisma 查询,
 * 返回 boolean (true = 解锁徽章)。
 *
 * 新增徽章条件 = 加一行 seed, 不需要改 honor.service.ts。
 */
import { PrismaClient, HonorAction } from '@prisma/client';

export interface BadgeCondition {
  type: string;
  threshold?: number;
  /** 部分 evaluator 用字符串阈值 (e.g. ISO 日期) */
  thresholdStr?: string;
  [key: string]: unknown;
}

export type BadgeEvaluator = (
  prisma: PrismaClient,
  userId: string,
  cond: BadgeCondition,
) => Promise<boolean>;

/** 总 IP 数 >= threshold */
const TOTAL_IPS_GTE: BadgeEvaluator = async (p, userId, c) => {
  const n = await p.ipAsset.count({ where: { creatorId: userId } });
  return n >= (c.threshold ?? 0);
};

/** 总面部特写上传数 >= threshold */
const TOTAL_FACE_UPLOADS_GTE: BadgeEvaluator = async (p, userId, c) => {
  const n = await p.ipFile.count({
    where: {
      ip: { creatorId: userId },
      assetType: 'FACE_CLOSEUP',
    },
  });
  return n >= (c.threshold ?? 0);
};

/** 总 AI 生成次数 (累加 AI_* action 的 ledger) >= threshold */
const TOTAL_AI_GENS_GTE: BadgeEvaluator = async (p, userId, c) => {
  const n = await p.honorLedger.count({
    where: {
      userId,
      action: {
        in: [
          HonorAction.AI_RECOGNIZE,
          HonorAction.AI_GEN_THREE_VIEW,
          HonorAction.AI_GEN_RENDER,
          HonorAction.AI_GEN_EXPRESSION,
          HonorAction.AI_GEN_RECIPE,
        ],
      },
    },
  });
  return n >= (c.threshold ?? 0);
};

/** 总 LoRA 说明书数 >= threshold */
const TOTAL_RECIPES_GTE: BadgeEvaluator = async (p, userId, c) => {
  const n = await p.ipFile.count({
    where: {
      ip: { creatorId: userId },
      assetType: 'RECIPE_TXT',
    },
  });
  return n >= (c.threshold ?? 0);
};

/** 总浏览数 (sum views across all user's IPs) >= threshold */
const TOTAL_VIEWS_GTE: BadgeEvaluator = async (p, userId, c) => {
  const r = await p.ipAsset.aggregate({
    where: { creatorId: userId },
    _sum: { viewCount: true },
  });
  return (r._sum.viewCount ?? 0) >= (c.threshold ?? 0);
};

/** 总收藏数 >= threshold */
const TOTAL_FAVORITES_GTE: BadgeEvaluator = async (p, userId, c) => {
  const r = await p.ipAsset.aggregate({
    where: { creatorId: userId },
    _sum: { favoriteCount: true },
  });
  return (r._sum.favoriteCount ?? 0) >= (c.threshold ?? 0);
};

/** 总订单数 (creator 维度) >= threshold */
const TOTAL_ORDERS_GTE: BadgeEvaluator = async (p, userId, c) => {
  const n = await p.order.count({
    where: { ip: { creatorId: userId } },
  });
  return n >= (c.threshold ?? 0);
};

/** 总订单金额 (分) >= threshold */
const TOTAL_ORDER_FEN_GTE: BadgeEvaluator = async (p, userId, c) => {
  const r = await p.order.aggregate({
    where: { ip: { creatorId: userId }, status: 'PAID' },
    _sum: { amountFen: true },
  });
  return (r._sum?.amountFen ?? 0) >= (c.threshold ?? 0);
};

/** 单个 IP 订单金额 >= threshold */
const IP_ORDER_FEN_GTE: BadgeEvaluator = async (p, userId, c) => {
  const ips = await p.ipAsset.findMany({
    where: { creatorId: userId },
    select: { id: true },
  });
  if (ips.length === 0) return false;
  const r = await p.order.groupBy({
    by: ['ipId'],
    where: { ipId: { in: ips.map((i) => i.id) }, status: 'PAID' },
    _sum: { amountFen: true },
  });
  return r.some((g) => (g._sum?.amountFen ?? 0) >= (c.threshold ?? 0));
};

/** 连续活跃天数 >= threshold */
const STREAK_GTE: BadgeEvaluator = async (p, userId, c) => {
  const s = await p.honorStreak.findUnique({ where: { userId } });
  return (s?.currentStreak ?? 0) >= (c.threshold ?? 0);
};

/** 首次提交即通过审核 (用户没有 IP_REJECTED 记录) */
const FIRST_TRY_APPROVED: BadgeEvaluator = async (p, userId) => {
  const rejected = await p.honorLedger.count({
    where: { userId, action: HonorAction.IP_REJECTED },
  });
  const approved = await p.honorLedger.count({
    where: { userId, action: HonorAction.IP_APPROVED },
  });
  return rejected === 0 && approved >= 1;
};

/** 连续 N 个 IP 全部审核通过 (无拒绝记录且已通过 >= threshold) */
const CONSECUTIVE_APPROVED_GTE: BadgeEvaluator = async (p, userId, c) => {
  const rejected = await p.honorLedger.count({
    where: { userId, action: HonorAction.IP_REJECTED },
  });
  const approved = await p.honorLedger.count({
    where: { userId, action: HonorAction.IP_APPROVED },
  });
  return rejected === 0 && approved >= (c.threshold ?? 0);
};

/** 单个 IP 4 张图全到位 (FACE + THREE + RENDER + EXPRESSION) 计数 >= threshold */
const IP_FULL_KIT_GTE: BadgeEvaluator = async (p, userId, c) => {
  const ips = await p.ipAsset.findMany({
    where: { creatorId: userId },
    select: {
      id: true,
      files: { select: { assetType: true } },
    },
  });
  let fullCount = 0;
  for (const ip of ips) {
    const types = new Set(ip.files.map((f) => f.assetType));
    if (
      types.has('FACE_CLOSEUP') &&
      types.has('THREE_VIEW') &&
      types.has('TRANSPARENT_RENDER') &&
      types.has('EXPRESSION_GRID')
    ) {
      fullCount++;
    }
  }
  return fullCount >= (c.threshold ?? 0);
};

/** 用户使用过的资产类型数 >= threshold (1-5) */
const ASSET_TYPES_COVERED_GTE: BadgeEvaluator = async (p, userId, c) => {
  const r = await p.ipFile.findMany({
    where: { ip: { creatorId: userId } },
    select: { assetType: true },
    distinct: ['assetType'],
  });
  return r.length >= (c.threshold ?? 0);
};

/** 单个 IP 售价 (priceFen) >= threshold */
const IP_PRICE_FEN_GTE: BadgeEvaluator = async (p, userId, c) => {
  const ip = await p.ipAsset.findFirst({
    where: { creatorId: userId, depositPriceFen: { gte: c.threshold ?? 0 } },
    select: { id: true },
  });
  return ip !== null;
};

/** 举报被采纳次数 >= threshold */
const CONTENT_REPORTED_GTE: BadgeEvaluator = async (p, userId, c) => {
  const n = await p.honorLedger.count({
    where: { userId, action: HonorAction.CONTENT_REPORTED },
  });
  return n >= (c.threshold ?? 0);
};

/** 账号注册时间早于 thresholdStr (ISO 日期) */
const JOINED_BEFORE: BadgeEvaluator = async (p, userId, c) => {
  const u = await p.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  if (!u) return false;
  return u.createdAt < new Date(c.thresholdStr ?? '2099-01-01');
};

/** 账号年龄 (天) >= threshold */
const ACCOUNT_AGE_DAYS_GTE: BadgeEvaluator = async (p, userId, c) => {
  const u = await p.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  if (!u) return false;
  const days = Math.floor((Date.now() - u.createdAt.getTime()) / 86_400_000);
  return days >= (c.threshold ?? 0);
};

/** 单个 IP 收藏数 >= threshold */
const IP_FAVORITES_GTE: BadgeEvaluator = async (p, userId, c) => {
  const ip = await p.ipAsset.findFirst({
    where: { creatorId: userId, favoriteCount: { gte: c.threshold ?? 0 } },
    select: { id: true },
  });
  return ip !== null;
};

/** 单个 IP 涵盖 >= threshold 个 styleTags */
const IP_STYLETAGS_GTE: BadgeEvaluator = async (p, userId, c) => {
  const ips = await p.ipAsset.findMany({
    where: { creatorId: userId },
    select: { styleTags: true },
  });
  return ips.some((ip) => {
    const tags = Array.isArray(ip.styleTags) ? (ip.styleTags as unknown[]) : [];
    return tags.length >= (c.threshold ?? 0);
  });
};

// ============= 复杂 evaluator — MVP 先 no-op, 后续实现 =============

/** 月榜 Top N — 需要月榜查询, MVP 暂跳过 */
const LEADERBOARD_TOP_N: BadgeEvaluator = async () => false;
const CONSECUTIVE_TOP3_GTE: BadgeEvaluator = async () => false;
const NIGHT_PUBLISH_GTE: BadgeEvaluator = async () => false;
const BURST_ACTIONS_GTE: BadgeEvaluator = async () => false;
const REFERRAL_SUCCESS_GTE: BadgeEvaluator = async () => false;

/**
 * Evaluator 注册表 — 新增徽章条件只需要:
 *   1. seed-honor.ts 加一行 (conditionJson.type = "X")
 *   2. 在这里加一个 evaluator
 * 改了 seed 或 evaluator 才需要重新部署。
 */
export const EVALUATORS: Record<string, BadgeEvaluator> = {
  TOTAL_IPS_GTE,
  TOTAL_FACE_UPLOADS_GTE,
  TOTAL_AI_GENS_GTE,
  TOTAL_RECIPES_GTE,
  TOTAL_VIEWS_GTE,
  TOTAL_FAVORITES_GTE,
  TOTAL_ORDERS_GTE,
  TOTAL_ORDER_FEN_GTE,
  IP_ORDER_FEN_GTE,
  STREAK_GTE,
  FIRST_TRY_APPROVED,
  CONSECUTIVE_APPROVED_GTE,
  IP_FULL_KIT_GTE,
  ASSET_TYPES_COVERED_GTE,
  IP_PRICE_FEN_GTE,
  CONTENT_REPORTED_GTE,
  JOINED_BEFORE,
  ACCOUNT_AGE_DAYS_GTE,
  IP_FAVORITES_GTE,
  IP_STYLETAGS_GTE,
  LEADERBOARD_TOP_N,
  CONSECUTIVE_TOP3_GTE,
  NIGHT_PUBLISH_GTE,
  BURST_ACTIONS_GTE,
  REFERRAL_SUCCESS_GTE,
};