#!/usr/bin/env node
/**
 * scripts/e2e-workspace.mjs — W3 W2 D2-D6 端到端测试
 *
 * 跑前:
 *   1. apps/api 已 build 且 dist/main.js 存在
 *   2. 数据库已 seed (`pnpm seed:users` 跑过)
 *   3. API 没在跑 (脚本会自己启 + 关)
 *
 * 用法:
 *   node scripts/e2e-workspace.mjs                # 默认连 localhost:3000
 *   API_BASE=http://localhost:3001 node ...       # 自定义
 *
 * 退出码:0 全过 / 1 有失败
 */

import { spawn } from 'node:child_process';
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

// ---- 主流程 ----
async function main() {
  console.log(`\n🌱 E2E W3 W2 D2-D6 against ${API_BASE}\n`);

  // ===== 1. 登录 =====
  const creatorLogin = await http('POST', '/auth/login', { body: CREATOR });
  assert2xx(creatorLogin.status, 'creator login', JSON.stringify(creatorLogin.data));
  const creatorToken = creatorLogin.data?.accessToken;
  if (!creatorToken) {
    bad('creator token', `no accessToken in response: ${JSON.stringify(creatorLogin.data)}`);
    return finish();
  }

  const buyerLogin = await http('POST', '/auth/login', { body: BUYER });
  assert2xx(buyerLogin.status, 'buyer login', JSON.stringify(buyerLogin.data));
  const buyerToken = buyerLogin.data?.accessToken;
  if (!buyerToken) {
    bad('buyer token', 'no accessToken');
    return finish();
  }

  // ===== 2. 我的资产 — 创作者创建 prompt template =====
  const tplName = `e2e_tpl_${Date.now()}`;
  const tplCreate = await http('POST', '/creator/assets', {
    token: creatorToken,
    body: {
      type: 'prompt_template',
      name: tplName,
      content: '[{"scene":1,"desc":"开场咖啡厅","duration":3}]',
      tags: ['e2e', 'test'],
    },
  });
  assert2xx(tplCreate.status, 'create prompt template', `status=${tplCreate.status} data=${JSON.stringify(tplCreate.data)}`);

  // 列 assets 验证
  const tplList = await http('GET', '/creator/assets', {
    token: creatorToken,
    query: { type: 'prompt_template' },
  });
  const hasTpl = (tplList.data?.items ?? []).some((a) => a.name === tplName);
  assert(hasTpl, 'list assets contains new tpl', `total=${tplList.data?.total}`);

  // ===== 3. 买家发 brief =====
  // 先查一个 IP id (用列表第一页第一条)
  const ipsList = await http('GET', '/ips', { token: buyerToken, query: { size: 1 } });
  const firstIp = ipsList.data?.items?.[0];
  const ipId = firstIp?.id ?? 'mock-ip-id';

  const briefCreate = await http('POST', '/buyer/briefs', {
    token: buyerToken,
    body: {
      title: `E2E 测试 brief ${Date.now()}`,
      description: 'D2-D6 端到端',
      category: 'shortvideo',
      platformSet: ['douyin'],
      ipIds: [ipId],
      budgetMin: 1000,
      budgetMax: 5000,
      packageTier: 'standard',
      deadlineAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    },
  });
  assert2xx(briefCreate.status, 'create brief', `status=${briefCreate.status} data=${JSON.stringify(briefCreate.data)}`);
  const briefId = briefCreate.data?.brief?.id;
  if (!briefId) return finish();

  // 发布 → bidding
  const publish = await http('POST', `/buyer/briefs/${briefId}/publish`, { token: buyerToken });
  assert2xx(publish.status, 'publish brief → bidding', `status=${publish.status}`);

  // ===== 4. 创作者报价 =====
  const bidCreate = await http('POST', `/creator/briefs/${briefId}/bids`, {
    token: creatorToken,
    body: { price: 2000, deliveryDays: 5, proposal: 'E2E 测试报价 — 5 天交付,使用 Sora + 可灵双工具链' },
  });
  assert2xx(bidCreate.status, 'creator bid', `status=${bidCreate.status} data=${JSON.stringify(bidCreate.data)}`);
  const bidId = bidCreate.data?.id;
  if (!bidId) return finish();

  // ===== 5. 买家接受 bid → workspace 创建 =====
  const accept = await http('POST', `/buyer/briefs/${briefId}/bids/${bidId}/accept`, { token: buyerToken });
  assert2xx(accept.status, 'accept bid → workspace', `status=${accept.status} data=${JSON.stringify(accept.data)}`);
  const workspaceId = accept.data?.workspaceId;
  assert(typeof workspaceId === 'string' && workspaceId.length > 0, 'workspaceId returned', `got ${workspaceId}`);
  if (!workspaceId) return finish();

  // ===== 6. 创作者改 toolchain (勾选 sora + kling) =====
  const toolchainUpdate = await http('PATCH', `/creator/workspaces/${workspaceId}/toolchain`, {
    token: creatorToken,
    body: { toolchain: { sora: true, kling: true, jimeng: false, runway: false } },
  });
  assert(toolchainUpdate.status === 200, 'update toolchain', `status=${toolchainUpdate.status}`);

  // ===== 7. 成本预估 — 满配工具链 =====
  const costEst = await http('GET', `/creator/workspaces/${workspaceId}/toolchain/cost-estimate`, { token: creatorToken });
  assert(costEst.status === 200 && costEst.data?.totalCents > 0, 'toolchain cost estimate', `data=${JSON.stringify(costEst.data)}`);
  // sora 8s × 50c = 400 + kling 10s × 30c = 300 = 700
  const expectedTotal = 8 * 50 + 10 * 30;
  assert(costEst.data?.totalCents === expectedTotal, 'cost total = 700 cents', `got ${costEst.data?.totalCents}, expected ${expectedTotal}`);

  // ===== 8. 预检 — 单次调用 sora =====
  const preflight = await http('GET', `/creator/workspaces/${workspaceId}/tools/preflight`, {
    token: creatorToken,
    query: { toolName: 'sora', durationSec: 5 },
  });
  assert(preflight.status === 200 && preflight.data?.estimate?.costCents === 250, 'preflight sora 5s = 250c', `data=${JSON.stringify(preflight.data)}`);

  // ===== 9. 创作者调用 sora → 落库 =====
  const callSora = await http('POST', `/creator/workspaces/${workspaceId}/generate`, {
    token: creatorToken,
    body: { toolName: 'sora', prompt: '东亚-女-青年-苏清禾,在咖啡厅里微笑,镜头从特写拉远', durationSec: 5 },
  });
  assert2xx(callSora.status, 'call sora generate', `status=${callSora.status} data=${JSON.stringify(callSora.data)}`);
  const genRecord = callSora.data?.record;
  assert(genRecord?.costCents === 250, 'generation costCents = 250', `got ${genRecord?.costCents}`);
  assert(genRecord?.status === 'success', 'generation status = success', `got ${genRecord?.status}`);

  // 列 generations
  const listGen = await http('GET', `/creator/workspaces/${workspaceId}/generations`, { token: creatorToken });
  assert((listGen.data?.items ?? []).length >= 1, 'list generations', `total=${listGen.data?.total}`);

  // 买家也能看 generations (透明)
  const buyerGen = await http('GET', `/buyer/workspaces/${workspaceId}/generations`, { token: buyerToken });
  assert(buyerGen.status === 200 && (buyerGen.data?.items ?? []).length >= 1, 'buyer sees generations', `status=${buyerGen.status}`);

  // ===== 10. 中间稿 v1 =====
  const sub1 = await http('POST', `/creator/workspaces/${workspaceId}/submissions`, {
    token: creatorToken,
    body: { ossKeys: ['creators/me/v1-script.md', 'creators/me/v1-shot.mp4'], notes: '首版分镜 + 第一镜' },
  });
  assert(sub1.status === 201, 'upload submission v1', `status=${sub1.status} data=${JSON.stringify(sub1.data)}`);
  const subV1Id = sub1.data?.submission?.id;
  assert(sub1.data?.submission?.version === 1, 'submission v1 version=1', `got ${sub1.data?.submission?.version}`);

  // ===== 11. 买家评论 v1 =====
  const comment1 = await http('POST', `/submissions/${subV1Id}/comments`, {
    token: buyerToken,
    body: { content: '第一镜节奏不错,建议第二镜时长拉长到 5s' },
  });
  assert(comment1.status === 201, 'buyer comment on v1', `status=${comment1.status}`);

  // ===== 12. 上传 v2 (旧 v1 自动 superseded) =====
  const sub2 = await http('POST', `/creator/workspaces/${workspaceId}/submissions`, {
    token: creatorToken,
    body: { ossKeys: ['creators/me/v2-shot.mp4'], notes: '按买家意见调整了第二镜' },
  });
  assert(sub2.status === 201, 'upload submission v2', `status=${sub2.status}`);
  assert(sub2.data?.submission?.version === 2, 'submission v2 version=2', `got ${sub2.data?.submission?.version}`);

  // 查 v1 现在应是 superseded
  const subList = await http('GET', `/workspaces/${workspaceId}/submissions`, { token: creatorToken });
  const v1After = (subList.data?.items ?? []).find((s) => s.id === subV1Id);
  assert(v1After?.status === 'superseded', 'v1 auto superseded after v2 upload', `got ${v1After?.status}`);

  // ===== 13. 买家 approve v2 =====
  const approveSub = await http('POST', `/buyer/submissions/${sub2.data.submission.id}/status`, {
    token: buyerToken,
    body: { status: 'approved' },
  });
  assert2xx(approveSub.status, 'buyer approve v2', `status=${approveSub.status} data=${JSON.stringify(approveSub.data)}`);

  // ===== 14. 创作者发消息 =====
  const msg = await http('POST', `/creator/workspaces/${workspaceId}/messages`, {
    token: creatorToken,
    body: { content: '已按意见修改,请看 v2' },
  });
  assert2xx(msg.status, 'creator message', `status=${msg.status}`);

  // ===== 15. 创作者更新分镜 (引用模板) =====
  const scripts = await http('PATCH', `/creator/workspaces/${workspaceId}/scripts`, {
    token: creatorToken,
    body: { scripts: [{ scene: 1, desc: '咖啡厅开场', duration: 3, source: tplName }] },
  });
  assert(scripts.status === 200, 'update scripts', `status=${scripts.status}`);

  // ===== 16. 创作者提交 workspace =====
  const submit = await http('POST', `/creator/workspaces/${workspaceId}/submit`, { token: creatorToken });
  assert2xx(submit.status, 'creator submit workspace', `status=${submit.status}`);

  // ===== 17. 买家 approve workspace =====
  const approve = await http('POST', `/buyer/workspaces/${workspaceId}/approve`, { token: buyerToken });
  assert2xx(approve.status, 'buyer approve workspace', `status=${approve.status}`);
  assert(approve.data?.workspace?.status === 'approved', 'workspace status=approved', `got ${approve.data?.workspace?.status}`);

  // ===== 18. 我的资产 — 清理(删刚才建的模板) =====
  if (tplCreate.data?.asset?.id) {
    const del = await http('DELETE', `/creator/assets/${tplCreate.data.asset.id}`, { token: creatorToken });
    assert(del.status === 200, 'cleanup delete asset', `status=${del.status}`);
  }

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