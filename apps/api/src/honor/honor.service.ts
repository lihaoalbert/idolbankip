/**
 * HonorService — 捏脸币核心服务
 *
 * 设计原则 (config-driven, 见 [[feedback-config-driven]]):
 * - 所有 action → 分值从 HonorRule 读, 不写死
 * - 所有等级 → 称号从 HonorLevel 读
 * - 所有徽章 → 条件从 HonorBadge.conditionJson 读
 * - 这里只有 evaluator / interpreter, 没有任何业务常量
 *
 * 写入流程:
 *   upload/ai/ips/orders/users → honor.record(userId, action, ref?)
 *     → 查 HonorRule (delta / maxPerDay / maxPerUser)
 *     → 写 HonorLedger
 *     → 调 evaluateBadges(userId) (新增徽章 + 写 BADGE_EARNED 流水)
 *
 * 读取流程:
 *   GET /honor/me               → 当前用户的 积分/等级/称号/连续/最近流水
 *   GET /users/:id/profile      → 个人主页公开数据
 *   GET /users/:id/badges       → 已获徽章
 *   GET /honor/leaderboard      → 排行榜 top N
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HonorAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { publicOssUrl } from '../upload/oss.util';
import { EVALUATORS, BadgeCondition } from './badge-evaluators';

const LEDGER_CACHE_TTL_MS = 30_000; // HonorRule 内存缓存 30s
const RECENT_LEDGER_LIMIT = 10;

export interface RecordOptions {
  refType?: string;
  refId?: string;
  monetaryValueFen?: number;
  metadata?: Prisma.InputJsonValue;
  /** 跳过 maxPerDay 检查, 比如系统发奖 */
  skipLimits?: boolean;
  /** 外部事件已确认, 不再评估徽章 (避免循环) */
  skipBadgeEval?: boolean;
}

export interface RecordResult {
  recorded: boolean;
  delta: number;
  reason: string;
  newTotal: number;
  skippedReason?: 'RULE_DISABLED' | 'LIMIT_PER_DAY' | 'LIMIT_PER_USER' | 'DELTA_ZERO';
}

@Injectable()
export class HonorService {
  private readonly log = new Logger(HonorService.name);
  private ruleCache = new Map<HonorAction, { at: number; rule: any }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ===================== record (写入流水 + 触发徽章评估) =====================

  /**
   * 记录一次荣誉事件。
   * - 自动按 maxPerDay / maxPerUser 限流
   * - 自动触发徽章评估 (异步, 不阻塞主流程)
   */
  async record(
    userId: string,
    action: HonorAction,
    opts: RecordOptions = {},
  ): Promise<RecordResult> {
    const rule = await this.getRule(action);
    if (!rule || !rule.enabled) {
      return {
        recorded: false,
        delta: 0,
        reason: rule?.reason ?? action,
        newTotal: await this.getTotalPoints(userId),
        skippedReason: 'RULE_DISABLED',
      };
    }

    if (rule.delta === 0 && !opts.skipLimits) {
      return {
        recorded: false,
        delta: 0,
        reason: rule.reason,
        newTotal: await this.getTotalPoints(userId),
        skippedReason: 'DELTA_ZERO',
      };
    }

    if (!opts.skipLimits) {
      const limited = await this.checkLimits(userId, action, rule);
      if (limited) {
        return {
          recorded: false,
          delta: 0,
          reason: rule.reason,
          newTotal: await this.getTotalPoints(userId),
          skippedReason: limited,
        };
      }
    }

    const created = await this.prisma.honorLedger.create({
      data: {
        userId,
        action,
        delta: rule.delta,
        reason: rule.reason,
        refType: opts.refType,
        refId: opts.refId,
        monetaryValueFen: opts.monetaryValueFen ?? 0,
        metadata: opts.metadata ?? Prisma.JsonNull,
      },
    });

    const newTotal = await this.getTotalPoints(userId);

    this.log.log(
      `💰 ${userId.slice(-6)} ${action} ${rule.delta > 0 ? '+' : ''}${rule.delta} (total=${newTotal})`,
    );

    // 异步评估徽章 (不 await, 失败也不影响主流程)
    if (!opts.skipBadgeEval) {
      this.evaluateBadges(userId, action).catch((e) =>
        this.log.warn(`badge eval failed for ${userId}: ${e?.message}`),
      );
    }

    return {
      recorded: true,
      delta: rule.delta,
      reason: rule.reason,
      newTotal,
    };
  }

  private async getRule(action: HonorAction) {
    const cached = this.ruleCache.get(action);
    if (cached && Date.now() - cached.at < LEDGER_CACHE_TTL_MS) return cached.rule;
    const rule = await this.prisma.honorRule.findUnique({ where: { action } });
    if (rule) this.ruleCache.set(action, { at: Date.now(), rule });
    return rule;
  }

  /** 检查 maxPerDay / maxPerUser */
  private async checkLimits(
    userId: string,
    action: HonorAction,
    rule: { maxPerDay: number | null; maxPerUser: number | null },
  ): Promise<'LIMIT_PER_DAY' | 'LIMIT_PER_USER' | null> {
    if (rule.maxPerUser !== null) {
      const total = await this.prisma.honorLedger.count({
        where: { userId, action },
      });
      if (total >= rule.maxPerUser) return 'LIMIT_PER_USER';
    }
    if (rule.maxPerDay !== null) {
      const since = this.startOfDayUtc8();
      const today = await this.prisma.honorLedger.count({
        where: { userId, action, createdAt: { gte: since } },
      });
      if (today >= rule.maxPerDay) return 'LIMIT_PER_DAY';
    }
    return null;
  }

  private startOfDayUtc8(): Date {
    // UTC+8 凌晨 = UTC 16:00 前一天
    const now = new Date();
    const utc8Ms = now.getTime() + 8 * 3600 * 1000;
    const utc8 = new Date(utc8Ms);
    utc8.setUTCHours(0, 0, 0, 0);
    return new Date(utc8.getTime() - 8 * 3600 * 1000);
  }

  // ===================== streak (连续活跃) =====================

  /**
   * 更新用户连续活跃天数, 并按里程碑发奖 (3/7/30 天)
   * - 幂等: 同一 UTC+8 日内重复调用只生效一次
   * - 断签: 当前 streak > 0 且 lastActiveDate 不是昨天 → 重置 streak = 1
   */
  async updateStreakOnLogin(userId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    isNewDay: boolean;
    triggeredMilestone?: HonorAction;
  }> {
    const today = this.startOfDayUtc8();
    const yesterday = new Date(today.getTime() - 86_400_000);

    const existing = await this.prisma.honorStreak.findUnique({ where: { userId } });
    const isNewDay =
      !existing?.lastActiveDate || existing.lastActiveDate.getTime() < today.getTime();

    if (!isNewDay) {
      return {
        currentStreak: existing?.currentStreak ?? 0,
        longestStreak: existing?.longestStreak ?? 0,
        isNewDay: false,
      };
    }

    // 断签判断: lastActiveDate 是昨天之前 (不是昨天也不是今天) → 重置
    let nextStreak = 1;
    if (existing?.lastActiveDate && existing.lastActiveDate.getTime() >= yesterday.getTime()) {
      nextStreak = (existing.currentStreak ?? 0) + 1;
    }

    const longest = Math.max(existing?.longestStreak ?? 0, nextStreak);

    await this.prisma.honorStreak.upsert({
      where: { userId },
      create: {
        userId,
        currentStreak: nextStreak,
        longestStreak: longest,
        lastActiveDate: today,
        totalActiveDays: 1,
      },
      update: {
        currentStreak: nextStreak,
        longestStreak: longest,
        lastActiveDate: today,
        totalActiveDays: { increment: 1 },
      },
    });

    // 里程碑发奖 — 跳过 maxPerUser 检查 (这些 action 本来就是 maxPerUser=1)
    let triggered: HonorAction | undefined;
    if (nextStreak === 3) triggered = HonorAction.STREAK_3D;
    else if (nextStreak === 7) triggered = HonorAction.STREAK_7D;
    else if (nextStreak === 30) triggered = HonorAction.STREAK_30D;

    if (triggered) {
      await this.record(userId, triggered, { skipBadgeEval: true });
    }

    return {
      currentStreak: nextStreak,
      longestStreak: longest,
      isNewDay: true,
      triggeredMilestone: triggered,
    };
  }

  // ===================== evaluateBadges (新增徽章) =====================

  /**
   * 评估用户可解锁的徽章, 自动写入 HonorBadgeGrant。
   * 每次 record 后会异步调一次, 也可以外部 cron 兜底重跑。
   */
  async evaluateBadges(userId: string, _hintAction?: HonorAction): Promise<string[]> {
    const [allBadges, grants] = await Promise.all([
      this.prisma.honorBadge.findMany({
        where: { enabled: true, conditionJson: { not: Prisma.JsonNull } },
      }),
      this.prisma.honorBadgeGrant.findMany({
        where: { userId },
        select: { badgeId: true },
      }),
    ]);
    const grantedIds = new Set(grants.map((g) => g.badgeId));
    const newBadges: string[] = [];

    for (const badge of allBadges) {
      if (grantedIds.has(badge.id)) continue;
      const cond = (badge.conditionJson ?? null) as BadgeCondition | null;
      if (!cond || !cond.type) continue;
      const evaluator = EVALUATORS[cond.type];
      if (!evaluator) {
        this.log.warn(`unknown badge evaluator type: ${cond.type} (badge=${badge.code})`);
        continue;
      }
      let ok = false;
      try {
        ok = await evaluator(this.prisma as any, userId, cond);
      } catch (e: any) {
        this.log.warn(`evaluator ${cond.type} threw for user ${userId}: ${e?.message}`);
        continue;
      }
      if (ok) {
        await this.prisma.honorBadgeGrant.create({
          data: { userId, badgeId: badge.id },
        });
        newBadges.push(badge.code);
        this.log.log(`🏅 ${userId.slice(-6)} unlocked ${badge.code}`);
      }
    }

    return newBadges;
  }

  // ===================== getMe / getProfile / leaderboard =====================

  /**
   * 当前用户的荣誉面板: 积分 + 等级 + 称号 + 连续 + 最近流水
   */
  async getMe(userId: string) {
    const [total, level, streak, recent, badgeCount, ipCount] = await Promise.all([
      this.getTotalPoints(userId),
      this.getLevelForUser(userId),
      this.prisma.honorStreak.findUnique({ where: { userId } }),
      this.prisma.honorLedger.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: RECENT_LEDGER_LIMIT,
      }),
      this.prisma.honorBadgeGrant.count({ where: { userId } }),
      this.prisma.ipAsset.count({ where: { creatorId: userId } }),
    ]);

    return {
      totalPoints: total,
      level,
      streak: streak
        ? {
            current: streak.currentStreak,
            longest: streak.longestStreak,
            totalDays: streak.totalActiveDays,
          }
        : { current: 0, longest: 0, totalDays: 0 },
      badgesEarned: badgeCount,
      ipsCreated: ipCount,
      recentLedger: recent.map((r) => ({
        id: r.id,
        action: r.action,
        delta: r.delta,
        reason: r.reason,
        createdAt: r.createdAt,
      })),
      nextLevel: await this.getNextLevel(level.level),
    };
  }

  /**
   * 公开个人主页数据
   */
  async getProfile(userId: string) {
    const [user, total, level, streak, badgeGrants, ips, aggregate] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          createdAt: true,
          roles: true,
        },
      }),
      this.getTotalPoints(userId),
      this.getLevelForUser(userId),
      this.prisma.honorStreak.findUnique({ where: { userId } }),
      this.prisma.honorBadgeGrant.findMany({
        where: { userId },
        orderBy: { grantedAt: 'desc' },
        take: 12,
        include: { badge: true },
      }),
      this.prisma.ipAsset.findMany({
        where: { creatorId: userId },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true,
          code: true,
          displayName: true,
          status: true,
          depositPriceFen: true,
          viewCount: true,
          favoriteCount: true,
          thumbnailKey: true,
          styleTags: true,
          createdAt: true,
        },
      }),
      this.prisma.ipAsset.aggregate({
        where: { creatorId: userId },
        _sum: { viewCount: true, favoriteCount: true },
        _count: true,
      }),
    ]);

    if (!user) return null;

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        createdAt: user.createdAt,
      },
      honor: {
        totalPoints: total,
        level,
        streak: streak
          ? {
              current: streak.currentStreak,
              longest: streak.longestStreak,
              totalDays: streak.totalActiveDays,
            }
          : { current: 0, longest: 0, totalDays: 0 },
      },
      stats: {
        ipCount: aggregate._count,
        totalViews: aggregate._sum?.viewCount ?? 0,
        totalFavorites: aggregate._sum?.favoriteCount ?? 0,
      },
      badges: badgeGrants.map((g) => ({
        code: g.badge.code,
        name: g.badge.name,
        desc: g.badge.desc,
        icon: g.badge.icon,
        tier: g.badge.tier,
        grantedAt: g.grantedAt,
      })),
      ips: ips.map((ip) => ({
        id: ip.id,
        code: ip.code,
        name: ip.displayName,
        status: ip.status,
        priceFen: ip.depositPriceFen,
        viewCount: ip.viewCount,
        favoriteCount: ip.favoriteCount,
        thumbUrl: ip.thumbnailKey
          ? publicOssUrl(
              this.config.get<string>('OSS_BUCKET_PUBLIC', 'ibi-ren-dev-public'),
              this.config.get<string>('OSS_REGION', 'oss-cn-hangzhou'),
              ip.thumbnailKey,
            )
          : null,
        styleTags: ip.styleTags,
        createdAt: ip.createdAt,
      })),
    };
  }

  async getUserBadges(userId: string) {
    const grants = await this.prisma.honorBadgeGrant.findMany({
      where: { userId },
      orderBy: { grantedAt: 'desc' },
      include: { badge: true },
    });
    return grants.map((g) => ({
      code: g.badge.code,
      name: g.badge.name,
      desc: g.badge.desc,
      icon: g.badge.icon,
      tier: g.badge.tier,
      grantedAt: g.grantedAt,
    }));
  }

  /**
   * 排行榜 top N
   * period:
   *   - week:  最近 7 天 ledger sum
   *   - month: 最近 30 天 ledger sum
   *   - all:   全部 ledger sum
   */
  async leaderboard(period: 'week' | 'month' | 'all', limit = 50) {
    let since: Date | undefined;
    if (period === 'week') since = new Date(Date.now() - 7 * 86_400_000);
    else if (period === 'month') since = new Date(Date.now() - 30 * 86_400_000);

    const grouped = await this.prisma.honorLedger.groupBy({
      by: ['userId'],
      where: since ? { createdAt: { gte: since } } : undefined,
      _sum: { delta: true },
      orderBy: { _sum: { delta: 'desc' } },
      take: limit,
    });

    const userIds = grouped.map((g) => g.userId);
    const [users, streaks] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, avatarUrl: true, roles: true },
      }),
      this.prisma.honorStreak.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, currentStreak: true },
      }),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const streakMap = new Map(streaks.map((s) => [s.userId, s.currentStreak]));

    const ranked = await Promise.all(
      grouped.map(async (g, i) => {
        const level = await this.getLevelForPoints(g._sum.delta ?? 0);
        const u = userMap.get(g.userId);
        return {
          rank: i + 1,
          userId: g.userId,
          displayName: u?.displayName ?? '匿名捏脸师',
          avatarUrl: u?.avatarUrl ?? null,
          roles: u?.roles ?? null,
          periodPoints: g._sum.delta ?? 0,
          level,
          streak: streakMap.get(g.userId) ?? 0,
        };
      }),
    );
    return ranked;
  }

  // ===================== level / total 计算 =====================

  async getTotalPoints(userId: string): Promise<number> {
    const r = await this.prisma.honorLedger.aggregate({
      where: { userId },
      _sum: { delta: true },
    });
    return r._sum.delta ?? 0;
  }

  /**
   * 根据当前总积分, 找出对应等级 (>= minPoints 的最大 level)
   */
  async getLevelForUser(userId: string) {
    const total = await this.getTotalPoints(userId);
    return this.getLevelForPoints(total);
  }

  async getLevelForPoints(points: number) {
    const lvl = await this.prisma.honorLevel.findFirst({
      where: { minPoints: { lte: points } },
      orderBy: { minPoints: 'desc' },
    });
    if (!lvl) {
      return { level: 1, minPoints: 0, title: '新人捏脸师', icon: '🌱', colorHex: '#9CA3AF' };
    }
    return {
      level: lvl.level,
      minPoints: lvl.minPoints,
      title: lvl.title,
      icon: lvl.icon,
      colorHex: lvl.colorHex,
    };
  }

  async getNextLevel(currentLevel: number) {
    const next = await this.prisma.honorLevel.findFirst({
      where: { level: { gt: currentLevel } },
      orderBy: { level: 'asc' },
    });
    if (!next) return null;
    return {
      level: next.level,
      minPoints: next.minPoints,
      title: next.title,
      icon: next.icon,
      colorHex: next.colorHex,
    };
  }
}