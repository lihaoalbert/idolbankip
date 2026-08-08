#!/usr/bin/env node
/**
 * R11.1: 清理 buyer_001 / creator_001 名下 E2E 残留数据。
 *
 * 判定规则: brief.title 命中以下任一前缀 → 视为 E2E 残留
 *   W6- / E2E / smoke / test / R10- / R11-
 * 匹配 brief → 级联清理: order, bid, workspace, workspaceMessage, workspaceSubmission, deliverable
 *
 * 默认 dry-run(只打 ID, 不删); --apply 才真删。
 *
 * 用法(必须在 apps/api 目录跑, 那里 node_modules 有 @prisma/client):
 *   cd apps/api && node ../../scripts/clean-e2e-residue.mjs
 *   cd apps/api && node ../../scripts/clean-e2e-residue.mjs --apply
 *   cd apps/api && node ../../scripts/clean-e2e-residue.mjs --only=R10
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('/Users/app/ibi.ren/apps/api/node_modules/@prisma/client');

const prisma = new PrismaClient();

const PREFIXES = ['W6-', 'E2E', 'smoke', 'test', 'R10-', 'R11-', 'R6-', 'R7-', 'R8-', 'R9-'];
const SEED_USERS = {
  buyer: 'cmqysllow0000mbwjrio2tzhe',    // buyer_001@ibi.ren
  creator: 'cmqysllov0001mbwjfbp6c5xs',  // creator_001@ibi.ren
};
const APPLY = process.argv.includes('--apply');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const onlyPrefix = onlyArg ? [onlyArg.split('=')[1]] : PREFIXES;

function matchesE2E(title) {
  if (!title) return false;
  const t = title.toLowerCase();
  return onlyPrefix.some((p) => t.startsWith(p.toLowerCase()));
}

async function main() {
  console.log(`[clean] mode=${APPLY ? 'APPLY (删)' : 'DRY-RUN'} prefixes=${onlyPrefix.join('|')}`);

  // 1) 找出 seed 用户 + E2E 前缀的 brief
  const briefs = await prisma.brief.findMany({
    where: {
      buyerId: SEED_USERS.buyer,
      title: { startsWith: onlyPrefix.map((p) => p.replace(/-$/, '')).join('%') === onlyPrefix[0].replace(/-$/, '')
        ? undefined
        : undefined },
    },
    select: { id: true, title: true, buyerId: true },
  });
  const e2eBriefs = briefs.filter((b) => matchesE2E(b.title));

  console.log(`[clean] 扫描到 ${briefs.length} 条 seed_buyer brief, 其中 E2E 残留 ${e2eBriefs.length} 条`);

  if (e2eBriefs.length === 0) {
    console.log('[clean] 无残留, 退出');
    return;
  }

  // 2) 收集级联对象 ID
  const briefIds = e2eBriefs.map((b) => b.id);

  const orders = await prisma.order.findMany({ where: { briefId: { in: briefIds } }, select: { id: true, briefId: true } });
  const bids = await prisma.bid.findMany({ where: { briefId: { in: briefIds } }, select: { id: true, briefId: true } });
  const workspaces = await prisma.workspace.findMany({ where: { briefId: { in: briefIds } }, select: { id: true, briefId: true } });
  const reviews = await prisma.review.findMany({ where: { briefId: { in: briefIds } }, select: { id: true, briefId: true } });
  const submissions = workspaces.length
    ? await prisma.workspaceSubmission.findMany({ where: { workspaceId: { in: workspaces.map((w) => w.id) } }, select: { id: true } })
    : [];
  const messages = workspaces.length
    ? await prisma.workspaceMessage.findMany({ where: { workspaceId: { in: workspaces.map((w) => w.id) } }, select: { id: true } })
    : [];
  const gens = workspaces.length
    ? await prisma.aIGenerationRecord.findMany({ where: { workspaceId: { in: workspaces.map((w) => w.id) } }, select: { id: true } })
    : [];
  const deliverables = await prisma.deliverable.findMany({ where: { briefId: { in: briefIds } }, select: { id: true } });

  console.log('[clean] 级联对象计数:');
  console.log(`  brief:        ${e2eBriefs.length}`);
  console.log(`  order:        ${orders.length}`);
  console.log(`  bid:          ${bids.length}`);
  console.log(`  workspace:    ${workspaces.length}`);
  console.log(`  review:       ${reviews.length}`);
  console.log(`  submission:   ${submissions.length}`);
  console.log(`  message:      ${messages.length}`);
  console.log(`  aigen:        ${gens.length}`);
  console.log(`  deliverable:  ${deliverables.length}`);

  if (!APPLY) {
    console.log('\n[clean] DRY-RUN 完成 — 加 --apply 真删');
    console.log('  示例:');
    e2eBriefs.slice(0, 3).forEach((b) => console.log(`    brief: ${b.id}  ${b.title}`));
    return;
  }

  // 3) 真删(顺序: 依赖 → 主)
  console.log('[clean] 开始删除…');
  const orderIds = orders.map((o) => o.id);
  if (orderIds.length) {
    await prisma.contract.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.downloadGrant.deleteMany({ where: { orderId: { in: orderIds } } });
  }
  if (submissions.length) {
    await prisma.submissionComment.deleteMany({ where: { submissionId: { in: submissions.map((s) => s.id) } } });
    await prisma.workspaceSubmission.deleteMany({ where: { id: { in: submissions.map((s) => s.id) } } });
  }
  if (messages.length) await prisma.workspaceMessage.deleteMany({ where: { id: { in: messages.map((m) => m.id) } } });
  if (gens.length) await prisma.aIGenerationRecord.deleteMany({ where: { id: { in: gens.map((g) => g.id) } } });
  if (deliverables.length) {
    // 简化的 schema: Deliverable 直接挂在 brief 下,无子项
    await prisma.deliverable.deleteMany({ where: { id: { in: deliverables.map((d) => d.id) } } });
  }
  if (orders.length) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  if (bids.length) await prisma.bid.deleteMany({ where: { id: { in: bids.map((b) => b.id) } } });
  if (workspaces.length) await prisma.workspace.deleteMany({ where: { id: { in: workspaces.map((w) => w.id) } } });
  if (reviews.length) await prisma.review.deleteMany({ where: { id: { in: reviews.map((r) => r.id) } } });
  if (e2eBriefs.length) await prisma.brief.deleteMany({ where: { id: { in: briefIds } } });

  // 4) 通知(用户残留)
  const notifs = await prisma.notification.findMany({
    where: { userId: { in: [SEED_USERS.buyer, SEED_USERS.creator] } },
    select: { id: true, type: true, title: true },
  });
  const e2eNotifs = notifs.filter((n) => matchesE2E(n.title) || n.title?.includes('W6-') || n.title?.includes('E2E'));
  if (e2eNotifs.length) {
    await prisma.notification.deleteMany({ where: { id: { in: e2eNotifs.map((n) => n.id) } } });
    console.log(`[clean] 删 ${e2eNotifs.length} 条 E2E 残留通知`);
  }

  console.log('[clean] ✅ 删除完成');
}

main()
  .catch((e) => {
    console.error('[clean] ❌', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
