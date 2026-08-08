/**
 * scripts/seed-honor.ts — 捏者荣誉系统规则种子
 *
 * 把所有业务规则 (奖励分值 / 等级阈值 / 徽章条件) upsert 到 DB,
 * 代码只读不写。修改规则 = 改这个文件 + 跑一次种子, 无需改代码逻辑。
 *
 * 跑法:
 *   bash scripts/seed-deploy.sh honor     # ECS
 *   cd apps/api && pnpm run seed:honor    # 本地
 */
import { PrismaClient, HonorAction, BadgeTier, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ===================== HonorRule (action → 奖励值) =====================

interface RuleSeed {
  action: HonorAction;
  delta: number;
  reason: string;
  maxPerDay?: number;
  maxPerUser?: number;
}

const RULES: RuleSeed[] = [
  // 上传类
  { action: HonorAction.UPLOAD_FACE, delta: 50, reason: '上传面部特写' },
  { action: HonorAction.UPLOAD_THREE_VIEW, delta: 30, reason: '上传三视图' },
  { action: HonorAction.UPLOAD_RENDER, delta: 30, reason: '上传立绘' },
  { action: HonorAction.UPLOAD_EXPRESSION, delta: 20, reason: '上传表情矩阵' },
  { action: HonorAction.UPLOAD_RECIPE, delta: 30, reason: '上传 LoRA 说明书' },

  // AI 辅助类
  { action: HonorAction.AI_RECOGNIZE, delta: 20, reason: '✨ AI 识别面部特征' },
  { action: HonorAction.AI_GEN_THREE_VIEW, delta: 20, reason: '✨ AI 生成三视图' },
  { action: HonorAction.AI_GEN_RENDER, delta: 20, reason: '✨ AI 生成立绘' },
  { action: HonorAction.AI_GEN_EXPRESSION, delta: 20, reason: '✨ AI 生成表情矩阵' },
  { action: HonorAction.AI_GEN_RECIPE, delta: 10, reason: '✨ AI 生成说明书' },

  // 发布类
  { action: HonorAction.IP_PUBLISH, delta: 200, reason: '发布 IP' },
  { action: HonorAction.IP_APPROVED, delta: 500, reason: 'IP 审核通过' },
  { action: HonorAction.IP_REJECTED, delta: -100, reason: 'IP 审核未通过' },

  // 互动类 — 防刷:每 IP 每日最多记 50 次
  { action: HonorAction.IP_VIEWED, delta: 1, reason: 'IP 被浏览', maxPerDay: 50 },
  { action: HonorAction.IP_FAVORITED, delta: 10, reason: 'IP 被收藏' },
  { action: HonorAction.IP_ORDERED, delta: 1000, reason: 'IP 产生订单 (基础奖)' },

  // 每日活跃
  { action: HonorAction.DAILY_LOGIN, delta: 5, reason: '每日登录' },
  { action: HonorAction.STREAK_3D, delta: 30, reason: '连续 3 天活跃', maxPerUser: 1 },
  { action: HonorAction.STREAK_7D, delta: 100, reason: '连续 7 天活跃', maxPerUser: 1 },
  { action: HonorAction.STREAK_30D, delta: 500, reason: '连续 30 天活跃', maxPerUser: 1 },

  // 审核类 (内部)
  { action: HonorAction.CONTENT_AUDITED, delta: 50, reason: '完成内容审核' },
  { action: HonorAction.CONTENT_REPORTED, delta: 200, reason: '有效举报违规' },

  // 系统事件
  { action: HonorAction.BADGE_EARNED, delta: 0, reason: '解锁徽章' },
];

// ===================== HonorLevel (等级表) =====================

interface LevelSeed {
  level: number;
  minPoints: number;
  title: string;
  icon: string;
  colorHex: string;
}

const LEVELS: LevelSeed[] = [
  { level: 1, minPoints: 0, title: '新人捏者', icon: '🌱', colorHex: '#9CA3AF' },
  { level: 2, minPoints: 200, title: '新手捏者', icon: '🌱', colorHex: '#9CA3AF' },
  { level: 3, minPoints: 500, title: '进阶捏者', icon: '🌱', colorHex: '#9CA3AF' },
  { level: 4, minPoints: 800, title: '潜力捏者', icon: '🌱', colorHex: '#9CA3AF' },
  { level: 5, minPoints: 1500, title: '合格捏者', icon: '🌱', colorHex: '#9CA3AF' },

  { level: 6, minPoints: 2500, title: '灵感捏者', icon: '✨', colorHex: '#CD7F32' },
  { level: 7, minPoints: 4000, title: '活跃捏者', icon: '✨', colorHex: '#CD7F32' },
  { level: 8, minPoints: 6000, title: '高产捏者', icon: '✨', colorHex: '#CD7F32' },
  { level: 9, minPoints: 9000, title: '勤奋捏者', icon: '✨', colorHex: '#CD7F32' },
  { level: 10, minPoints: 12000, title: '精英捏者', icon: '✨', colorHex: '#CD7F32' },

  { level: 11, minPoints: 16000, title: '匠心捏者', icon: '🎨', colorHex: '#C0C0C0' },
  { level: 15, minPoints: 30000, title: '资深捏者', icon: '🎨', colorHex: '#C0C0C0' },
  { level: 20, minPoints: 50000, title: '专家捏者', icon: '🎨', colorHex: '#C0C0C0' },
  { level: 25, minPoints: 80000, title: '高级专家', icon: '🎨', colorHex: '#C0C0C0' },
  { level: 30, minPoints: 120000, title: '资深专家', icon: '🎨', colorHex: '#C0C0C0' },

  { level: 35, minPoints: 180000, title: '大师捏者', icon: '🏆', colorHex: '#FFD700' },
  { level: 40, minPoints: 250000, title: '资深大师', icon: '🏆', colorHex: '#FFD700' },
  { level: 45, minPoints: 350000, title: '顶级大师', icon: '🏆', colorHex: '#FFD700' },
  { level: 50, minPoints: 500000, title: '殿堂大师', icon: '🏆', colorHex: '#FFD700' },

  { level: 60, minPoints: 800000, title: '传奇捏者', icon: '💎', colorHex: '#E5E4E2' },
  { level: 70, minPoints: 1200000, title: '超凡传奇', icon: '💎', colorHex: '#E5E4E2' },
  { level: 80, minPoints: 1800000, title: '神话传奇', icon: '💎', colorHex: '#E5E4E2' },
  { level: 90, minPoints: 2500000, title: '永恒传奇', icon: '💎', colorHex: '#E5E4E2' },
  { level: 100, minPoints: 5000000, title: '造物捏者', icon: '💎', colorHex: '#E5E4E2' },
];

// ===================== HonorBadge (徽章目录) =====================

interface BadgeSeed {
  code: string;
  name: string;
  desc: string;
  icon: string;
  tier: BadgeTier;
  /** null = 纯事件徽章 (e.g. "上传第一张脸" — 上传成功后直接给) */
  conditionJson?: Prisma.JsonObject;
  sortOrder: number;
}

const BADGES: BadgeSeed[] = [
  // 🆕 新手 (青铜)
  { code: 'FIRST_IP', name: '初出茅庐', desc: '发布第 1 个 IP', icon: '🌱', tier: BadgeTier.BRONZE, conditionJson: { type: 'TOTAL_IPS_GTE', threshold: 1 }, sortOrder: 100 },
  { code: 'FIRST_FACE', name: '第一张脸', desc: '上传第 1 张面部特写', icon: '📷', tier: BadgeTier.BRONZE, conditionJson: { type: 'TOTAL_FACE_UPLOADS_GTE', threshold: 1 }, sortOrder: 101 },
  { code: 'AI_PIONEER', name: 'AI 先锋', desc: '首次使用 ✨ AI 生成', icon: '🤖', tier: BadgeTier.BRONZE, conditionJson: { type: 'TOTAL_AI_GENS_GTE', threshold: 1 }, sortOrder: 102 },
  { code: 'FIRST_RECIPE', name: '知识沉淀', desc: '发布第 1 份 LoRA 说明书', icon: '📖', tier: BadgeTier.BRONZE, conditionJson: { type: 'TOTAL_RECIPES_GTE', threshold: 1 }, sortOrder: 103 },
  { code: 'STREAK_3', name: '三日不灭火', desc: '连续活跃 3 天', icon: '🔥', tier: BadgeTier.BRONZE, conditionJson: { type: 'STREAK_GTE', threshold: 3 }, sortOrder: 104 },

  // 📈 成长 (青铜 → 白银)
  { code: 'FIVE_IPS', name: '量产捏者', desc: '累计发布 5 个 IP', icon: '📚', tier: BadgeTier.BRONZE, conditionJson: { type: 'TOTAL_IPS_GTE', threshold: 5 }, sortOrder: 200 },
  { code: 'TEN_IPS', name: '工业化产出', desc: '累计发布 10 个 IP', icon: '🏭', tier: BadgeTier.SILVER, conditionJson: { type: 'TOTAL_IPS_GTE', threshold: 10 }, sortOrder: 201 },
  { code: 'VIEWS_1K', name: '千次浏览', desc: '全部 IP 总浏览 ≥ 1,000', icon: '👁', tier: BadgeTier.BRONZE, conditionJson: { type: 'TOTAL_VIEWS_GTE', threshold: 1000 }, sortOrder: 202 },
  { code: 'VIEWS_10K', name: '万人围观', desc: '全部 IP 总浏览 ≥ 10,000', icon: '💯', tier: BadgeTier.SILVER, conditionJson: { type: 'TOTAL_VIEWS_GTE', threshold: 10000 }, sortOrder: 203 },
  { code: 'FAV_100', name: '收藏家', desc: '全部 IP 总收藏 ≥ 100', icon: '⭐', tier: BadgeTier.SILVER, conditionJson: { type: 'TOTAL_FAVORITES_GTE', threshold: 100 }, sortOrder: 204 },
  { code: 'FIRST_ORDER', name: '首单成交', desc: '产生第 1 个订单', icon: '🛒', tier: BadgeTier.SILVER, conditionJson: { type: 'TOTAL_ORDERS_GTE', threshold: 1 }, sortOrder: 205 },

  // 🎨 手艺 (白银 → 黄金)
  { code: 'AI_50', name: 'AI 大师', desc: '累计 50 次 AI 生成', icon: '✨', tier: BadgeTier.SILVER, conditionJson: { type: 'TOTAL_AI_GENS_GTE', threshold: 50 }, sortOrder: 300 },
  { code: 'FIRST_TRY_APPROVED', name: '一次过审', desc: '首次提交即通过审核 (无拒绝记录)', icon: '📐', tier: BadgeTier.SILVER, conditionJson: { type: 'FIRST_TRY_APPROVED' }, sortOrder: 301 },
  { code: 'TEN_STREAK_APPROVED', name: '十连金', desc: '连续 10 个 IP 全部审核通过', icon: '🎯', tier: BadgeTier.GOLD, conditionJson: { type: 'CONSECUTIVE_APPROVED_GTE', threshold: 10 }, sortOrder: 302 },
  { code: 'FULL_KIT', name: '全套配齐', desc: '单个 IP 4 张图全到位', icon: '🖼', tier: BadgeTier.SILVER, conditionJson: { type: 'IP_FULL_KIT_GTE', threshold: 1 }, sortOrder: 303 },
  { code: 'FULL_STACK', name: '全能创作者', desc: '资产类型覆盖全部 5 类', icon: '🌟', tier: BadgeTier.GOLD, conditionJson: { type: 'ASSET_TYPES_COVERED_GTE', threshold: 5 }, sortOrder: 304 },
  { code: 'PRICE_100', name: '百元IP', desc: '单个 IP 售价 ≥ 100 元', icon: '💎', tier: BadgeTier.GOLD, conditionJson: { type: 'IP_PRICE_FEN_GTE', threshold: 10000 }, sortOrder: 305 },

  // 🔥 坚持 (白银)
  { code: 'STREAK_7', name: '一周不断', desc: '连续活跃 7 天', icon: '⏰', tier: BadgeTier.SILVER, conditionJson: { type: 'STREAK_GTE', threshold: 7 }, sortOrder: 400 },
  { code: 'STREAK_30', name: '满月', desc: '连续活跃 30 天', icon: '📅', tier: BadgeTier.SILVER, conditionJson: { type: 'STREAK_GTE', threshold: 30 }, sortOrder: 401 },
  { code: 'STREAK_100', name: '百日筑基', desc: '连续活跃 100 天', icon: '🗓', tier: BadgeTier.SILVER, conditionJson: { type: 'STREAK_GTE', threshold: 100 }, sortOrder: 402 },
  { code: 'STREAK_365', name: '年度常客', desc: '连续活跃 365 天', icon: '📆', tier: BadgeTier.GOLD, conditionJson: { type: 'STREAK_GTE', threshold: 365 }, sortOrder: 403 },

  // 🏆 声望 (白银 → 黄金)
  { code: 'LEADERBOARD_TOP10', name: '月度前十', desc: '月榜 Top 10', icon: '🏆', tier: BadgeTier.SILVER, conditionJson: { type: 'LEADERBOARD_TOP_N', threshold: 10 }, sortOrder: 500 },
  { code: 'LEADERBOARD_TOP1', name: '月度榜首', desc: '月榜 #1', icon: '👑', tier: BadgeTier.GOLD, conditionJson: { type: 'LEADERBOARD_TOP_N', threshold: 1 }, sortOrder: 501 },
  { code: 'CONSECUTIVE_TOP3', name: '连续三月前三', desc: '连续 3 个月月榜 Top 3', icon: '🎖', tier: BadgeTier.GOLD, conditionJson: { type: 'CONSECUTIVE_TOP3_GTE', threshold: 3 }, sortOrder: 502 },
  { code: 'REVENUE_10K', name: '万元俱乐部', desc: '累计订单金额 ≥ 10,000 元', icon: '💰', tier: BadgeTier.GOLD, conditionJson: { type: 'TOTAL_ORDER_FEN_GTE', threshold: 1000000 }, sortOrder: 503 },
  { code: 'IP_REVENUE_10K', name: '万元 IP', desc: '单个 IP 累计订单金额 ≥ 10,000 元', icon: '💍', tier: BadgeTier.GOLD, conditionJson: { type: 'IP_ORDER_FEN_GTE', threshold: 1000000 }, sortOrder: 504 },

  // 🎪 稀有 / 隐藏 (黄金) — 大多需要特殊检测, 留 evaluator 拓展点
  { code: 'NIGHT_OWL', name: '夜行者', desc: '凌晨 0-5 点发布 10 个 IP', icon: '🌙', tier: BadgeTier.GOLD, conditionJson: { type: 'NIGHT_PUBLISH_GTE', threshold: 10 }, sortOrder: 600 },
  { code: 'FLASH_HAND', name: '闪电手', desc: '1 分钟内完成 10 个有效操作', icon: '⚡', tier: BadgeTier.GOLD, conditionJson: { type: 'BURST_ACTIONS_GTE', threshold: 10 }, sortOrder: 601 },
  { code: 'BUG_HUNTER', name: '缺陷猎手', desc: '报告有效 bug/违规 → 被采纳', icon: '🐛', tier: BadgeTier.GOLD, conditionJson: { type: 'CONTENT_REPORTED_GTE', threshold: 1 }, sortOrder: 602 },
  { code: 'MENTOR', name: '伯乐', desc: '推荐新捏者, 该用户发布首个 IP', icon: '🎁', tier: BadgeTier.GOLD, conditionJson: { type: 'REFERRAL_SUCCESS_GTE', threshold: 1 }, sortOrder: 603 },
  { code: 'BETA_VETERAN', name: '内测元老', desc: '2026 年内注册的种子期用户', icon: '🧪', tier: BadgeTier.GOLD, conditionJson: { type: 'JOINED_BEFORE', threshold: '2027-01-01' }, sortOrder: 604 },
  { code: 'CROSS_DOMAIN', name: '跨域先驱', desc: '单个 IP 涵盖 ≥ 3 个 styleTags', icon: '🌍', tier: BadgeTier.GOLD, conditionJson: { type: 'IP_STYLETAGS_GTE', threshold: 3 }, sortOrder: 605 },

  // 💠 殿堂 (铂金)
  { code: 'HUNDRED_IPS', name: '百分达人', desc: '累计 100 个 IP', icon: '💯', tier: BadgeTier.PLATINUM, conditionJson: { type: 'TOTAL_IPS_GTE', threshold: 100 }, sortOrder: 700 },
  { code: 'IP_FAV_1K', name: '千 IP 收藏', desc: '单个 IP 收藏数 ≥ 1,000', icon: '👑', tier: BadgeTier.PLATINUM, conditionJson: { type: 'IP_FAVORITES_GTE', threshold: 1000 }, sortOrder: 701 },
  { code: 'ONE_YEAR', name: '百年老店', desc: '账号满 1 年', icon: '🏛', tier: BadgeTier.PLATINUM, conditionJson: { type: 'ACCOUNT_AGE_DAYS_GTE', threshold: 365 }, sortOrder: 702 },
];

// ===================== Main =====================

async function main() {
  console.log('🌱 seed-honor: 开始...');

  // 1. HonorRule
  let ruleCount = 0;
  for (const r of RULES) {
    await prisma.honorRule.upsert({
      where: { action: r.action },
      create: {
        action: r.action,
        delta: r.delta,
        reason: r.reason,
        maxPerDay: r.maxPerDay ?? null,
        maxPerUser: r.maxPerUser ?? null,
        enabled: true,
      },
      update: {
        delta: r.delta,
        reason: r.reason,
        maxPerDay: r.maxPerDay ?? null,
        maxPerUser: r.maxPerUser ?? null,
      },
    });
    ruleCount++;
  }
  console.log(`  ✅ HonorRule: ${ruleCount} 条`);

  // 2. HonorLevel
  let levelCount = 0;
  for (const l of LEVELS) {
    await prisma.honorLevel.upsert({
      where: { level: l.level },
      create: l,
      update: {
        minPoints: l.minPoints,
        title: l.title,
        icon: l.icon,
        colorHex: l.colorHex,
      },
    });
    levelCount++;
  }
  console.log(`  ✅ HonorLevel: ${levelCount} 级`);

  // 3. HonorBadge
  let badgeCount = 0;
  for (const b of BADGES) {
    await prisma.honorBadge.upsert({
      where: { code: b.code },
      create: {
        code: b.code,
        name: b.name,
        desc: b.desc,
        icon: b.icon,
        tier: b.tier,
        conditionJson: b.conditionJson ?? Prisma.JsonNull,
        sortOrder: b.sortOrder,
        enabled: true,
      },
      update: {
        name: b.name,
        desc: b.desc,
        icon: b.icon,
        tier: b.tier,
        conditionJson: b.conditionJson ?? Prisma.JsonNull,
        sortOrder: b.sortOrder,
      },
    });
    badgeCount++;
  }
  console.log(`  ✅ HonorBadge: ${badgeCount} 枚`);

  console.log('✅ seed-honor: 全部完成');
}

main()
  .catch((e) => {
    console.error('❌ seed-honor 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });