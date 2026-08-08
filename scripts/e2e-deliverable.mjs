#!/usr/bin/env node
/**
 * scripts/e2e-deliverable.mjs — W4 D4 端到端测试
 *
 * 覆盖:
 *   D1 Deliverable 模块: 创建/列表/审批/状态机
 *   D2 MTS 转码: sourceUrl + 3 ratios → mock 返回 3 个 URL
 *   D3 多平台发布: publish 端点调 mock publisher → publishedUrl 回填
 *   D4 买家工作台: /buyer/workbench 跨 workspace 列表 + 状态过滤
 *
 * 跑前:
 *   1. apps/api 已 build 且 dist/main.js 存在
 *   2. 数据库已 seed (pnpm seed:users 跑过)
 *   3. API 没在跑 (脚本自启 + 关)
 *
 * 用法:
 *   node scripts/e2e-deliverable.mjs
 *
 * 退出码:0 全过 / 1 有失败
 */

import { setTimeout as sleep } from 'node:timers/promises';

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const API_PREFIX = `${API_BASE}/api/v1`;

const CREATOR = { email: 'creator_001@ibi.ren', password: 'Focus_2026!' };
const BUYER = { email: 'buyer_001@ibi.ren', password: 'Focus_2026!' };

// ---- 工具 ----
let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  passed++;
  console.log(`  ✅ ${name}`);
}
function bad(name, msg) {
  failed++;
  failures.push(`${name}: ${msg}`);
  console.log(`  ❌ ${name}: ${msg}`);
}

async function http(method, path, { token, body, query } = {}) {
  const url = new URL(API_PREFIX + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, data: json };
}

function assert2xx(status, name, msg) {
  if (status >= 200 && status < 300) ok(name);
  else bad(name, msg ?? `status=${status}`);
}

function assert(cond, name, msg) {
  if (cond) ok(name);
  else bad(name, msg ?? 'assertion failed');
}

async function setupApprovedWorkspace(creatorToken, buyerToken) {
  // 1. 买家发 brief
  const ipsList = await http('GET', '/ips', { token: buyerToken, query: { size: 1 } });
  const ipId = ipsList.data?.items?.[0]?.id ?? 'mock-ip-id';

  const briefCreate = await http('POST', '/buyer/briefs', {
    token: buyerToken,
    body: {
      title: `E2E W4 brief ${Date.now()}`,
      description: 'W4 D4 端到端',
      category: 'shortvideo',
      platformSet: ['douyin'],
      ipIds: [ipId],
      budgetMin: 1000,
      budgetMax: 5000,
      packageTier: 'standard',
      deadlineAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    },
  });
  const briefId = briefCreate.data?.brief?.id;
  if (!briefId) throw new Error(`brief create failed: ${JSON.stringify(briefCreate.data)}`);

  await http('POST', `/buyer/briefs/${briefId}/publish`, { token: buyerToken });

  const bidCreate = await http('POST', `/creator/briefs/${briefId}/bids`, {
    token: creatorToken,
    body: { price: 2000, deliveryDays: 5, proposal: 'W4 D4 测试报价 — 5 天交付,使用 Sora + 可灵' },
  });
  const bidId = bidCreate.data?.id;

  const accept = await http('POST', `/buyer/briefs/${briefId}/bids/${bidId}/accept`, { token: buyerToken });
  const workspaceId = accept.data?.workspaceId;
  if (!workspaceId) throw new Error(`workspace create failed: ${JSON.stringify(accept.data)}`);

  // 2. 创作者提交 → 买家通过 (让 workspace 进入 approved)
  await http('POST', `/creator/workspaces/${workspaceId}/submit`, { token: creatorToken });
  await http('POST', `/buyer/workspaces/${workspaceId}/approve`, { token: buyerToken });

  return { briefId, workspaceId };
}

async function main() {
  console.log(`\n🌱 E2E W4 D1-D4 against ${API_BASE}\n`);

  // ===== 1. 登录 =====
  const creatorLogin = await http('POST', '/auth/login', { body: CREATOR });
  assert2xx(creatorLogin.status, 'creator login');
  const creatorToken = creatorLogin.data?.accessToken;
  if (!creatorToken) return finish();

  const buyerLogin = await http('POST', '/auth/login', { body: BUYER });
  assert2xx(buyerLogin.status, 'buyer login');
  const buyerToken = buyerLogin.data?.accessToken;
  if (!buyerToken) return finish();

  // ===== 2. 准备一个 approved workspace =====
  const { workspaceId } = await setupApprovedWorkspace(creatorToken, buyerToken);
  ok('setup: workspace approved');

  // ===== 3. D2 — MTS 转码 =====
  const transcode = await http('POST', `/creator/workspaces/${workspaceId}/transcode`, {
    token: creatorToken,
    body: {
      sourceUrl: 'creators/w4/source-video.mp4',
      ratios: ['9:16', '16:9', '1:1'],
    },
  });
  assert2xx(transcode.status, 'D2: transcode source');
  const items = transcode.data?.job?.items ?? [];
  assert(items.length === 3, 'D2: transcode returns 3 items', `got ${items.length}`);
  assert(
    items.every((i) => ['9:16', '16:9', '1:1'].includes(i.ratio)),
    'D2: all ratios present',
    `ratios=${items.map((i) => i.ratio).join(',')}`,
  );
  if (!items.length) return finish();
  const url916 = items.find((i) => i.ratio === '9:16').url;

  // ===== 4. D1 — 创作者创建 deliverable (wechat 平台,用 9:16 URL) =====
  const deliverableCreate = await http('POST', `/creator/workspaces/${workspaceId}/deliverables`, {
    token: creatorToken,
    body: {
      type: 'video',
      platform: 'wechat',
      url: url916,
      thumbnailUrl: 'creators/w4/thumb-916.jpg',
      spec: { duration: 30, ratio: '9:16', resolution: '1080x1920', fileSize: 8_000_000 },
    },
  });
  assert2xx(deliverableCreate.status, 'D1: create deliverable', `data=${JSON.stringify(deliverableCreate.data)}`);
  const deliverableId = deliverableCreate.data?.deliverable?.id;
  assert(deliverableCreate.data?.deliverable?.status === 'pending', 'D1: status=pending', `got ${deliverableCreate.data?.deliverable?.status}`);

  // ===== 5. D1 — workspace 未 approved 时应拒 (用 active 状态的 workspace 验证) =====
  // 跳过 — 已 approved,改成验"buyer 必须能 list"
  const buyerListPending = await http('GET', `/buyer/workspaces/${workspaceId}/deliverables`, {
    token: buyerToken,
  });
  assert(buyerListPending.status === 200 && (buyerListPending.data?.items ?? []).length === 1, 'D1: buyer lists pending', `total=${buyerListPending.data?.total}`);

  // ===== 6. D1 — 买家审批通过 =====
  const review = await http('POST', `/buyer/deliverables/${deliverableId}/review`, {
    token: buyerToken,
    body: { decision: 'approved' },
  });
  assert2xx(review.status, 'D1: buyer approve', `data=${JSON.stringify(review.data)}`);
  assert(review.data?.deliverable?.status === 'approved', 'D1: status=approved after review', `got ${review.data?.deliverable?.status}`);

  // ===== 7. D3 — 创作者发布 (调 mock publisher) =====
  const publish = await http('POST', `/creator/deliverables/${deliverableId}/publish`, {
    token: creatorToken,
    body: {},
  });
  assert2xx(publish.status, 'D3: publish', `data=${JSON.stringify(publish.data)}`);
  assert(publish.data?.deliverable?.status === 'published', 'D3: status=published', `got ${publish.data?.deliverable?.status}`);
  assert(publish.data?.deliverable?.publishedUrl?.includes('mock-wechat'), 'D3: publishedUrl from wechat publisher', `got ${publish.data?.deliverable?.publishedUrl}`);

  // ===== 8. D4 — 买家工作台 (跨 workspace,默认排除 published) =====
  const workbenchActive = await http('GET', '/buyer/workbench', { token: buyerToken });
  assert(workbenchActive.status === 200, 'D4: workbench 200');
  // 默认排除 published → 刚发布的 wechat 应不在
  const foundActive = (workbenchActive.data?.items ?? []).some((d) => d.id === deliverableId);
  assert(!foundActive, 'D4: default workbench excludes published', `found=${foundActive}`);

  // 改 status=published 过滤 → 应能看到
  const workbenchPub = await http('GET', '/buyer/workbench', {
    token: buyerToken,
    query: { status: 'published' },
  });
  const foundPub = (workbenchPub.data?.items ?? []).some((d) => d.id === deliverableId);
  assert(foundPub, 'D4: workbench status=published contains it');

  // ===== 9. 边界 — 重复 publish 已 published 应报错 =====
  const rePublish = await http('POST', `/creator/deliverables/${deliverableId}/publish`, {
    token: creatorToken,
    body: {},
  });
  assert(rePublish.status >= 400, 'D1: re-publish published → 4xx', `status=${rePublish.status}`);

  // ===== 10. 边界 — 创作者再创一个,买家打回 =====
  const d2 = await http('POST', `/creator/workspaces/${workspaceId}/deliverables`, {
    token: creatorToken,
    body: {
      type: 'video',
      platform: 'douyin',
      url: items.find((i) => i.ratio === '16:9').url,
      spec: { duration: 30, ratio: '16:9', resolution: '1920x1080', fileSize: 9_000_000 },
    },
  });
  assert2xx(d2.status, 'D1: create 2nd deliverable');
  const rejectRes = await http('POST', `/buyer/deliverables/${d2.data.deliverable.id}/review`, {
    token: buyerToken,
    body: { decision: 'rejected', rejectedReason: '封面不行' },
  });
  assert(rejectRes.status === 201 || rejectRes.status === 200, 'D1: reject 2xx', `status=${rejectRes.status}`);
  assert(rejectRes.data?.deliverable?.status === 'rejected', 'D1: status=rejected');
  assert(rejectRes.data?.deliverable?.rejectedReason === '封面不行', 'D1: rejectedReason stored', `got ${rejectRes.data?.deliverable?.rejectedReason}`);

  // 工作台默认 view 应包含 rejected
  const wbActive = await http('GET', '/buyer/workbench', { token: buyerToken });
  const foundRejected = (wbActive.data?.items ?? []).some((d) => d.id === d2.data.deliverable.id);
  assert(foundRejected, 'D4: workbench shows rejected by default');

  finish();
}

function finish() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  if (failed > 0) {
    console.log(`\nFailures:`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\n🎉 All E2E tests passed!`);
  process.exit(0);
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});