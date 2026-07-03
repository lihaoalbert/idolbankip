/**
 * scripts/quality-eval-calibrate.ts — W2.5 D10-D12 校准脚本
 *
 * 目的: 校准 L1 (技术) + L2 (美学) + L4 (商业价值) 与人评的 Spearman Rank Correlation
 *
 * 不依赖 NestJS DI (ApplicationContext 模式下 ConfigService 注入失败,
 *  已知 NestJS 10.4.22 + @nestjs/config 3 的 bug).
 * 直接实例化 service + Anthropic client, 用 env 驱动.
 *
 * 输入: manifest.json (--manifest=path)
 *   每项: { id, briefDescription, deliverableDescription?, deliverableUrls[],
 *           thumbnailUrls[], humanScores: { l1, l2, l4 }, note? }
 *   humanScores 范围 0-1, 推荐 3 位评分人取中位数
 *
 * 输出: CSV (stdout 或 --out=path), 含 SRCC + Pearson + MAE
 *
 * 用法:
 *   cd apps/api && pnpm exec tsx ../../scripts/quality-eval-calibrate.ts \
 *     --manifest=../../scripts/quality-eval-calibrate.manifest.example.json \
 *     --out=/tmp/calib.csv
 *
 * 关联: docs/research/w25-calibration-2026-07.md
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';
import { AuditService } from '../apps/api/src/audit/audit.service';
import { L1TechnicalService } from '../apps/api/src/quality-eval/l1-technical.service';
import { L2AestheticService } from '../apps/api/src/quality-eval/l2-aesthetic.service';
import { L4CommercialService } from '../apps/api/src/quality-eval/l4-commercial.service';
import type { QualityEvalInput } from '../apps/api/src/quality-eval/types';

// ===================== CLI 参数 =====================

function arg(name: string, def?: string): string {
  const k = `--${name}=`;
  for (const a of process.argv) {
    if (a.startsWith(k)) return a.slice(k.length);
  }
  return def ?? '';
}

const manifestPath = arg('manifest');
const outPath = arg('out');
if (!manifestPath) {
  console.error('用法: tsx scripts/quality-eval-calibrate.ts --manifest=path [--out=result.csv]');
  process.exit(1);
}
const absManifest = path.resolve(manifestPath);
if (!fs.existsSync(absManifest)) {
  console.error(`❌ manifest 不存在: ${absManifest}`);
  process.exit(1);
}

// 加载 .env (cwd 必须在 apps/api)
dotenv.config({ path: '.env' });

// ===================== Manifest 类型 =====================

interface ManifestItem {
  id: string;
  briefDescription: string;
  deliverableDescription?: string;
  deliverableUrls: string[];
  thumbnailUrls: string[];
  creatorNote?: string;
  humanScores: { l1: number; l2: number; l4: number };
  note?: string;
}

// ===================== 统计函数 =====================

function rank(xs: number[]): number[] {
  const n = xs.length;
  const indexed = xs.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return NaN;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return NaN;
  return num / Math.sqrt(dx2 * dy2);
}

function spearman(xs: number[], ys: number[]): number {
  return pearson(rank(xs), rank(ys));
}

function mean(xs: number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function mae(ai: number[], human: number[]): number {
  if (ai.length !== human.length || ai.length === 0) return NaN;
  return mean(ai.map((v, i) => Math.abs(v - human[i])));
}

function pad(s: string, w = 7): string {
  return s.padStart(w, ' ');
}

// ===================== Mock ConfigService (满足 LLM client 读取) =====================

class EnvConfigService extends ConfigService {
  constructor(env: Record<string, string | undefined>) {
    super(undefined, { dotenv: { path: '.env' } });
    // 覆盖: 直接用 env 对象
    Object.assign(this as any, { internalConfig: env });
  }
  override get<T>(key: string): T | undefined {
    return process.env[key] as T | undefined;
  }
}

// ===================== Bootstrap (无 NestJS DI) =====================

async function main() {
  const log = new Logger('calibrate');
  log.log(`📊 加载 manifest: ${absManifest}`);
  const items: ManifestItem[] = JSON.parse(fs.readFileSync(absManifest, 'utf8'));
  log.log(`   共 ${items.length} 项`);

  log.log('🚀 实例化 service (绕过 NestJS DI)...');
  const prisma = new PrismaService();
  await prisma.$connect();
  const audit = new AuditService(prisma);
  const config = new EnvConfigService(process.env);

  // L2/L4 需要 LlmConfigService 接口; 用一个最小的 stub 满足 getActive()
  const llmStub = {
    async getActive() {
      return {
        configId: 'calibration-env',
        apiKey: process.env.MINIMAX_API_KEY || '',
        baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com',
        model: process.env.MINIMAX_MODEL || 'claude-sonnet-4-6',
      };
    },
  };

  const l1 = new L1TechnicalService();
  const l2 = new L2AestheticService(llmStub as any);
  const l4 = new L4CommercialService(llmStub as any);

  // 跑每一项
  const rows: Array<Record<string, string>> = [];
  let okCount = 0, errCount = 0;
  for (const item of items) {
    const input: QualityEvalInput = {
      briefId: `calib-${item.id}`,
      deliverableId: `calib-${item.id}`,
      briefDescription: item.briefDescription,
      deliverableDescription: item.deliverableDescription,
      deliverableUrls: item.deliverableUrls,
      thumbnailUrls: item.thumbnailUrls,
      creatorNote: item.creatorNote,
      triggeredBy: 'calibration',
    };
    try {
      log.log(`▶ ${item.id} 跑 L1/L2/L4 ...`);
      // L3 mock — 用默认值
      const firstVideo = item.deliverableUrls[0] || '';
      const l1Result = firstVideo
        ? await l1.score({ videoUrl: firstVideo, description: item.deliverableDescription })
        : // 没有视频 (海报/系列图): 给个中性分 0.65
          { score: 0.65, decision: 'PASS' as const, metrics: {}, evidence: [], deductions: [] };
      const [l2Result, l4Result] = await Promise.all([
        l2.score({
          thumbnailUrls: item.thumbnailUrls,
          description: item.deliverableDescription,
          creatorNote: item.creatorNote,
        }),
        l4.score({
          briefId: item.id,
          briefDescription: item.briefDescription,
          deliverableDescription: item.deliverableDescription,
          thumbnailUrls: item.thumbnailUrls,
        }),
      ]);
      // 闸门: L1<0.60 → composite < 0.50
      let composite: number;
      let gateReason = 'none';
      if (l1Result.score < 0.6) {
        composite = Math.min(0.4999, l1Result.score * 0.6 + l2Result.score * 0.1 + 0.7 * 0.15 + l4Result.score * 0.15);
        gateReason = 'technical_below_threshold';
      } else {
        composite = l1Result.score * 0.15 + l2Result.score * 0.30 + 0.7 * 0.25 + l4Result.score * 0.30;
      }
      okCount++;
      rows.push({
        id: item.id,
        l1_ai: l1Result.score.toFixed(4),
        l2_ai: l2Result.score.toFixed(4),
        l4_ai: l4Result.score.toFixed(4),
        l1_human: item.humanScores.l1.toFixed(4),
        l2_human: item.humanScores.l2.toFixed(4),
        l4_human: item.humanScores.l4.toFixed(4),
        l1_diff: (l1Result.score - item.humanScores.l1).toFixed(4),
        l2_diff: (l2Result.score - item.humanScores.l2).toFixed(4),
        l4_diff: (l4Result.score - item.humanScores.l4).toFixed(4),
        composite_ai: composite.toFixed(4),
        composite_human: (
          item.humanScores.l1 * 0.15 +
          item.humanScores.l2 * 0.30 +
          item.humanScores.l4 * 0.30 +
          0.7 * 0.25  // L3 mock pass = 0.7
        ).toFixed(4),
        note: item.note ?? '',
        error: '',
      });
      log.log(`  ✓ L1=${l1Result.score.toFixed(2)} L2=${l2Result.score.toFixed(2)} L4=${l4Result.score.toFixed(2)} composite=${composite.toFixed(3)} (${gateReason})`);
    } catch (e: any) {
      errCount++;
      log.error(`✗ ${item.id} 失败: ${e?.message ?? e}`);
      rows.push({
        id: item.id,
        l1_ai: '',
        l2_ai: '',
        l4_ai: '',
        l1_human: item.humanScores.l1.toFixed(4),
        l2_human: item.humanScores.l2.toFixed(4),
        l4_human: item.humanScores.l4.toFixed(4),
        l1_diff: '',
        l2_diff: '',
        l4_diff: '',
        composite_ai: '',
        composite_human: (
          item.humanScores.l1 * 0.15 +
          item.humanScores.l2 * 0.30 +
          item.humanScores.l4 * 0.30
        ).toFixed(4),
        note: item.note ?? '',
        error: String(e?.message ?? e).slice(0, 200),
      });
    }
  }

  await prisma.$disconnect();

  // 输出 CSV
  const headers = [
    'id', 'l1_ai', 'l2_ai', 'l4_ai',
    'l1_human', 'l2_human', 'l4_human',
    'l1_diff', 'l2_diff', 'l4_diff',
    'composite_ai', 'composite_human',
    'note', 'error',
  ];
  const csvLines = [headers.join(',')];
  for (const r of rows) {
    csvLines.push(headers.map((h) => {
      const v = r[h] ?? '';
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','));
  }
  const csv = csvLines.join('\n') + '\n';
  if (outPath) {
    fs.writeFileSync(outPath, csv);
    log.log(`💾 CSV 已写入: ${outPath}`);
  } else {
    process.stdout.write(csv);
  }

  // SRCC (跳过 error 项)
  const ok = rows.filter((r) => !r.error);
  if (ok.length < 5) {
    log.warn(`⚠️  有效项 ${ok.length} (< 5), SRCC 不可靠 (建议 ≥ 30)`);
  }
  const l1_ai = ok.map((r) => Number(r.l1_ai));
  const l2_ai = ok.map((r) => Number(r.l2_ai));
  const l4_ai = ok.map((r) => Number(r.l4_ai));
  const l1_h = ok.map((r) => Number(r.l1_human));
  const l2_h = ok.map((r) => Number(r.l2_human));
  const l4_h = ok.map((r) => Number(r.l4_human));
  const c_ai = ok.map((r) => Number(r.composite_ai));
  const c_h = ok.map((r) => Number(r.composite_human));

  const report = [
    ``,
    `═══════════════════════════════════════════════════════════`,
    `📊 校准报告 (n=${ok.length}, 失败 ${errCount})`,
    `═══════════════════════════════════════════════════════════`,
    `目标 SRCC ≥ 0.75 (W2.5 决策 #4, 跨 brief 可比)`,
    ``,
    `Layer │  SRCC    Pearson   MAE    AI μ±σ      Human μ±σ`,
    `──────┼──────────────────────────────────────────────────────`,
    `L1 技术│ ${pad(spearman(l1_ai, l1_h).toFixed(3))}  ${pad(pearson(l1_ai, l1_h).toFixed(3))}  ${pad(mae(l1_ai, l1_h).toFixed(3))}  ${pad(`${mean(l1_ai).toFixed(3)}±${stddev(l1_ai).toFixed(3)}`)}  ${mean(l1_h).toFixed(3)}±${stddev(l1_h).toFixed(3)}`,
    `L2 美学│ ${pad(spearman(l2_ai, l2_h).toFixed(3))}  ${pad(pearson(l2_ai, l2_h).toFixed(3))}  ${pad(mae(l2_ai, l2_h).toFixed(3))}  ${pad(`${mean(l2_ai).toFixed(3)}±${stddev(l2_ai).toFixed(3)}`)}  ${mean(l2_h).toFixed(3)}±${stddev(l2_h).toFixed(3)}`,
    `L4 商业│ ${pad(spearman(l4_ai, l4_h).toFixed(3))}  ${pad(pearson(l4_ai, l4_h).toFixed(3))}  ${pad(mae(l4_ai, l4_h).toFixed(3))}  ${pad(`${mean(l4_ai).toFixed(3)}±${stddev(l4_ai).toFixed(3)}`)}  ${mean(l4_h).toFixed(3)}±${stddev(l4_h).toFixed(3)}`,
    `综合分│ ${pad(spearman(c_ai, c_h).toFixed(3))}  ${pad(pearson(c_ai, c_h).toFixed(3))}  ${pad(mae(c_ai, c_h).toFixed(3))}  ${pad(`${mean(c_ai).toFixed(3)}±${stddev(c_ai).toFixed(3)}`)}  ${mean(c_h).toFixed(3)}±${stddev(c_h).toFixed(3)}`,
    ``,
    `判定:`,
    [l1_ai, l2_ai, l4_ai, c_ai].every((ai, idx) => {
      const h = [l1_h, l2_h, l4_h, c_h][idx];
      return spearman(ai, h) >= 0.75;
    })
      ? `✅ 所有 layer SRCC ≥ 0.75,校准通过,可上线`
      : `⚠️  至少 1 项 SRCC < 0.75,需检查 prompt 或评分维度`,
    ``,
  ].join('\n');
  console.log(report);
  if (outPath) {
    fs.appendFileSync(outPath, report);
  }
}

main().catch((e) => {
  console.error('💥 脚本崩溃:', e);
  process.exit(1);
});