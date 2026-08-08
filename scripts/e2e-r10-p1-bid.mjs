#!/usr/bin/env node
/**
 * scripts/e2e-r10-p1-bid.mjs — R10.2 P1-4 + P1-5 撤回重投 + 表单校验 E2E
 *
 * 覆盖 2 个 P1 场景:
 *   1. P1-4: 创作者 withdraw → 重新投标(create 自动 update withdrawn → pending)
 *   2. P1-5: 提交超预算价格(后端校验)— 400 Bad Request
 */

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const API_PREFIX = `${API_BASE}/api/v1`;

const BUYER = { email: 'buyer_001@ibi.ren', password: 'Focus_2026!' };
const CREATOR = { email: 'creator_001@ibi.ren', password: 'Focus_2026!' };

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) { passed++; console.log(`  ✅ ${name}`); }
function bad(name, msg) { failed++; failures.push(`${name}: ${msg}`); console.log(`  ❌ ${name}: ${msg}`); }
function assert(cond, name, detail = '') { cond ? ok(name) : bad(name, detail); }
function assert2xx(status, name, detail = '') { assert(status >= 200 && status < 300, name, `status=${status} ${detail}`); }

async function http(method, path, { token, body, query } = {}) {
  const url = new URL(API_PREFIX + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { status: res.status, data };
}

async function login(user) {
  const { status, data } = await http('POST', '/auth/login', { body: user });
  if (status !== 200 && status !== 201) throw new Error(`login ${user.email} 失败: status=${status}`);
  return data.accessToken ?? data.token ?? data.access_token;
}

async function main() {
  console.log('🧪 R10.2 P1-4 + P1-5');
  console.log('='.repeat(60));

  const buyerToken = await login(BUYER);
  const creatorToken = await login(CREATOR);
  ok('login buyer + creator');

  // ===== 创建测试 brief =====
  const briefRes = await http('POST', '/buyer/briefs', {
    token: buyerToken,
    body: {
      title: 'R10.2 撤回重投测试',
      category: 'ad',
      platformSet: ['douyin'],
      budgetMin: 500,
      budgetMax: 1000,
      packageTier: 'standard',
      deadlineAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
  });
  assert2xx(briefRes.status, '创建 brief', `status=${briefRes.status}`);
  const briefId = briefRes.data.brief.id;
  await http('POST', `/buyer/briefs/${briefId}/publish`, { token: buyerToken });
  ok('发布 brief');

  // ===== 场景 1: P1-5 后端价格校验 =====
  const tooHigh = await http('POST', `/creator/briefs/${briefId}/bids`, {
    token: creatorToken,
    body: { price: 1500, deliveryDays: 7, proposal: '1500 元报价, 远超出 budgetMax=1000, 应被后端拒绝。' },
  });
  assert(tooHigh.status === 400, '1a: 超预算价格 1500 → 400', `status=${tooHigh.status}`);
  assert(/预算|报价/.test(tooHigh.data?.message ?? ''), '1b: 错误信息含"预算/报价"', `message=${tooHigh.data?.message}`);

  const tooLow = await http('POST', `/creator/briefs/${briefId}/bids`, {
    token: creatorToken,
    body: { price: 100, deliveryDays: 7, proposal: '100 元报价, 远低于 budgetMin=500, 应被后端拒绝。' },
  });
  assert(tooLow.status === 400, '1c: 过低价格 100 → 400', `status=${tooLow.status}`);

  const validBid = await http('POST', `/creator/briefs/${briefId}/bids`, {
    token: creatorToken,
    body: { price: 800, deliveryDays: 7, proposal: '首次报价 800, 7 天交付, 林雾工作室 30+ 短剧经验。' },
  });
  assert2xx(validBid.status, '1d: 合法价格 800 → 200', `status=${validBid.status}`);
  const bidId = validBid.data.id;
  assert(validBid.data.status === 'pending', '1e: 新 bid status=pending');

  // ===== 场景 2: P1-4 撤回 → 重新报价 (auto-update withdrawn → pending) =====
  const withdraw = await http('POST', `/creator/briefs/${briefId}/bids/${bidId}/withdraw`, {
    token: creatorToken,
  });
  assert2xx(withdraw.status, '2a: withdraw 200', `status=${withdraw.status}`);
  assert(withdraw.data?.status === 'withdrawn', '2b: status=withdrawn', `status=${withdraw.data?.status}`);

  // 重投 — 验证后端自动覆盖
  const reBid = await http('POST', `/creator/briefs/${briefId}/bids`, {
    token: creatorToken,
    body: { price: 900, deliveryDays: 5, proposal: '重新报价 900, 加急 5 天交付。' },
  });
  assert2xx(reBid.status, '2c: 撤回后重投 → 200 (不是 409)', `status=${reBid.status} data=${JSON.stringify(reBid.data)?.slice(0, 200)}`);
  assert(reBid.data?.id === bidId, '2d: 复用原 bid id (覆盖而非新建)', `old=${bidId} new=${reBid.data?.id}`);
  assert(reBid.data?.price === '900' || Number(reBid.data?.price) === 900, '2e: price 更新为 900', `price=${reBid.data?.price}`);
  assert(reBid.data?.deliveryDays === 5, '2f: deliveryDays 更新为 5', `days=${reBid.data?.deliveryDays}`);
  assert(reBid.data?.status === 'pending', '2g: status 回到 pending', `status=${reBid.data?.status}`);

  // ===== 场景 3: brief 关闭后不能重投 (竞态防护) =====
  // 关闭 brief
  await http('POST', `/buyer/briefs/${briefId}/close`, { token: buyerToken });
  // 试图再 withdraw (此时 bid 已 withdrawn? 不,刚刚 reBid 回到 pending)
  // 实际场景: brief 关闭后不能再报价 — create 应返 400
  const postClosed = await http('POST', `/creator/briefs/${briefId}/bids`, {
    token: creatorToken,
    body: { price: 850, deliveryDays: 6, proposal: 'brief 关闭后尝试重投,应被拒绝。' },
  });
  assert(postClosed.status === 400 || postClosed.status === 409, '3a: brief closed 后再投 → 4xx', `status=${postClosed.status} data=${JSON.stringify(postClosed.data)?.slice(0, 200)}`);

  console.log('='.repeat(60));
  console.log(`📊 R10.2 P1 测试: ✅ ${passed} 通过, ❌ ${failed} 失败`);
  if (failures.length > 0) {
    console.log('\n失败项:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('E2E 脚本崩溃:', e);
  process.exit(2);
});
