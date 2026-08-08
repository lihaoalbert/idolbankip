/**
 * QualityEvalRolloutService — W2.5 D13-D14 A/B 切流策略
 *
 * 单行 DB 配置 (singleton),控制 AI 自动评分的发布策略:
 * - mode='off': 完全关闭 (默认)
 * - mode='shadow': 跑评分落库,但不影响下游决策 (用于校准对比)
 * - mode='active': 跑评分落库,且 AI decision 写入下游
 *
 * rolloutPct 0-100: 触发概率 (按 deliverableId hash 模 100 取桶)
 * 同一 deliverable 始终同组,避免 A/B 反复横跳。
 *
 * 关联: docs/research/w25-calibration-2026-07.md §7
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type RolloutMode = 'off' | 'shadow' | 'active';

export interface RolloutConfig {
  mode: RolloutMode;
  rolloutPct: number;
  note: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
}

const SINGLETON_ID = 'default';

@Injectable()
export class QualityEvalRolloutService {
  private readonly logger = new Logger(QualityEvalRolloutService.name);
  private cache: { value: RolloutConfig; expiresAt: number } | null = null;
  private static readonly CACHE_TTL_MS = 30_000; // 30s 缓存, 平衡实时性 vs DB 负载

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<RolloutConfig> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.value;
    let row = await this.prisma.qualityEvalRollout.findUnique({ where: { id: SINGLETON_ID } });
    if (!row) {
      // 首次访问 → 落默认行 (off + 0%)
      row = await this.prisma.qualityEvalRollout.create({
        data: { id: SINGLETON_ID, mode: 'off', rolloutPct: 0 },
      });
    }
    const value: RolloutConfig = {
      mode: row.mode as RolloutMode,
      rolloutPct: row.rolloutPct,
      note: row.note,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt,
    };
    this.cache = { value, expiresAt: now + QualityEvalRolloutService.CACHE_TTL_MS };
    return value;
  }

  async update(input: { mode?: RolloutMode; rolloutPct?: number; note?: string; updatedBy: string }): Promise<RolloutConfig> {
    if (input.mode !== undefined && !['off', 'shadow', 'active'].includes(input.mode)) {
      throw new BadRequestException(`mode 必须是 off | shadow | active`);
    }
    if (input.rolloutPct !== undefined) {
      if (!Number.isInteger(input.rolloutPct) || input.rolloutPct < 0 || input.rolloutPct > 100) {
        throw new BadRequestException(`rolloutPct 必须是 0-100 的整数`);
      }
    }
    await this.prisma.qualityEvalRollout.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        mode: input.mode ?? 'off',
        rolloutPct: input.rolloutPct ?? 0,
        note: input.note,
        updatedBy: input.updatedBy,
      },
      update: {
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
        ...(input.rolloutPct !== undefined ? { rolloutPct: input.rolloutPct } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        updatedBy: input.updatedBy,
      },
    });
    this.invalidate();
    this.logger.log(
      `rollout 更新: mode=${input.mode ?? '(unchanged)'} pct=${input.rolloutPct ?? '(unchanged)'} by=${input.updatedBy}`,
    );
    return this.get();
  }

  invalidate() {
    this.cache = null;
  }

  /**
   * 决定给定 deliverableId 是否应触发 AI 评分 (按 hash 分桶)
   * @returns true = 跑评分 (shadow 或 active 都跑); false = 跳过
   */
  async shouldEvaluate(deliverableId: string | null): Promise<{ run: boolean; mode: RolloutMode }> {
    const cfg = await this.get();
    if (cfg.mode === 'off' || cfg.rolloutPct === 0) {
      return { run: false, mode: cfg.mode };
    }
    if (!deliverableId) {
      // 无 deliverableId (ad-hoc 跑) → 仍允许 (admin 主动触发的, 不走 A/B)
      return { run: true, mode: cfg.mode };
    }
    // 简单 hash: 取 deliverableId char code 总和 mod 100
    let sum = 0;
    for (let i = 0; i < deliverableId.length; i++) sum = (sum + deliverableId.charCodeAt(i)) % 100;
    const inBucket = sum < cfg.rolloutPct;
    return { run: inBucket, mode: cfg.mode };
  }
}