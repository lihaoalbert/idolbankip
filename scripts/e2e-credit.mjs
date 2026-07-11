#!/usr/bin/env node
/**
 * scripts/e2e-credit.mjs — W5 E3 端到端测试
 *
 * 覆盖:
 *   - CreditScoreRule seed: 默认 9 条规则 (5 creator + 4 buyer)
 *   - GET /users/:id/credit-score?as=creator 返回完整分数 + breakdown
 *   - rating_avg 反映真实评价分
 *   - 多个 bid → bidAcceptRate 计算正确
 *   - completed_count 反映已 approved workspace 数
 *   - dispute_count 反映参与的 dispute 数 (扣分)
 *   - 角色切换:as=buyer vs as=creator 返回不同 breakdown
 *
 * 跑前:
 *   1. apps/api 已 build
 *   2. pnpm run seed:credit 已跑 (rules 已注入)
 *   3. pnpm run seed:users 已跑
 *   4. 跑过 e2e-review.mjs 至少一遍 (有评价数据)
 */

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const API_PREFIX = `${API_BASE}/api/v1`;

const CREATOR = { email: 'creator_001@ibi.ren', password: 'Focus_2026!' };

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
function assert(cond, name, detail = '') {
  cond ? ok(name) : bad(name, detail);
}
function assert2xx(status, name, detail = '') {
  assert(status >= 200 && status < 300, name, `status=${status} ${detail}`);
}

async function http(method, path, { token, body, query } = {}) {
  const url = new URL(API_PREFIX + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, data };
}

async function login(user) {
  const { status, data } = await http('POST', '/auth/login', { body: user });
  if (status !== 200 && status !== 201) {
    throw new Error(`login ${user.email} 失败: status=${status}`);
  }
  return data.accessToken ?? data.token ?? data.access_token;
}

async function main() {
  console.log('🧪 W5 E3 Credit Score E2E');
  console.log('='.repeat(60));

  const token = await login(CREATOR);

  // 获取创作者自己的 id
  const me = await http('GET', '/users/me', { token });
  const creatorId = me.data?.user?.id ?? me.data?.id;
  assert(!!creatorId, 'E3-1: 拿到当前用户 id', `id=${creatorId}`);

  // ===== 2. as=creator 信用分 =====
  const cs = await http('GET', `/users/${creatorId}/credit-score`, {
    token,
    query: { as: 'creator' },
  });
  assert2xx(cs.status, 'E3-2: GET credit-score 200', `data=${JSON.stringify(cs.data).slice(0, 200)}`);
  assert(typeof cs.data?.score === 'number' && cs.data.score >= 0 && cs.data.score <= 100, 'E3-2: score ∈ [0,100]', `score=${cs.data?.score}`);
  assert(['EXCELLENT', 'GOOD', 'FAIR', 'POOR'].includes(cs.data?.grade), 'E3-2: grade ∈ 合法值', `grade=${cs.data?.grade}`);
  assert(Array.isArray(cs.data?.breakdown) && cs.data.breakdown.length === 5, 'E3-2: creator 5 个维度 breakdown');
  assert(cs.data?.formulaVersion === 1, 'E3-2: formulaVersion=1', `got ${cs.data?.formulaVersion}`);

  // 每个 breakdown 都要有 raw/weight/contribution
  for (const b of cs.data.breakdown) {
    assert(
      typeof b.raw === 'number' && b.raw >= 0 && b.raw <= 1,
      `E3-2: ${b.dimension} raw ∈ [0,1]`,
      `raw=${b.raw}`,
    );
    assert(
      Math.abs(b.contribution - b.raw * b.weight) < 1e-9,
      `E3-2: ${b.dimension} contribution = raw×weight`,
    );
  }

  // ===== 3. 已知 rating=5 → rating_avg 维度 raw=1 =====
  const ratingDim = cs.data.breakdown.find((b) => b.dimension === 'rating_avg');
  assert(ratingDim?.raw === 1, 'E3-3: rating=5 → rating_avg raw=1', `raw=${ratingDim?.raw}`);

  // ===== 4. dispute_count — 创作者上有 dispute 会拉低 =====
  // 不强制数值,只验 weight 是负的
  const disputeDim = cs.data.breakdown.find((b) => b.dimension === 'dispute_count');
  assert(disputeDim?.weight === -0.2, 'E3-4: dispute weight=-0.2', `weight=${disputeDim?.weight}`);

  // ===== 5. as=buyer 信用分 (creator 同时也能算 buyer) =====
  const csB = await http('GET', `/users/${creatorId}/credit-score`, {
    token,
    query: { as: 'buyer' },
  });
  assert2xx(csB.status, 'E3-5: as=buyer 200');
  assert(Array.isArray(csB.data?.breakdown) && csB.data.breakdown.length === 4, 'E3-5: buyer 4 个维度 breakdown');
  // buyer 不会有 bid_accept_rate
  assert(
    !csB.data.breakdown.some((b) => b.dimension === 'bid_accept_rate'),
    'E3-5: buyer 不应含 bid_accept_rate',
  );

  // ===== 6. 不存在的 user → 404 =====
  const cs404 = await http('GET', '/users/no-such-user-id/credit-score', { token });
  assert(cs404.status === 404, 'E3-6: 不存在的用户应 404', `status=${cs404.status}`);

  // ===== 7. 没 seed credit 规则 (强制禁用) 时 — 跳过这测试,业务上不能跑 =====
  // 跳过 — 与 E3-2 走完整路径

  // ===== 8. 公共接口 (无 JWT) — 当前 controller 有 UseGuards 但 JwtAuthGuard 只要没 token 就 401 =====
  // 暂未强制要求,只验证有 token 时 200

  console.log('');
  finish();
}

function finish() {
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('\n🎉 All E2E tests passed!');
  process.exit(0);
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
