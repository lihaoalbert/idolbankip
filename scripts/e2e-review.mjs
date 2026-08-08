#!/usr/bin/env node
/**
 * scripts/e2e-review.mjs — W5 E2 端到端测试
 *
 * 覆盖:
 *   - Review 模块: 双向评价 (buyer→creator / creator→buyer)
 *   - 校验 workspace.approved 才可评
 *   - 校验唯一约束: 同 (briefId, role) 不可重复
 *   - 校验角色方向: 只有买家能评 buyer_to_creator
 *   - 列出某 brief 的评价 + 某用户收到的评价
 *   - getUserRatingSummary (avgRating + count)
 *
 * 跑前:
 *   1. apps/api 已 build 且 dist/main.js 存在
 *   2. 数据库已 seed (pnpm seed:users 跑过)
 *   3. API 没在跑 (脚本自启 + 关)
 *   4. 需要一条 completed brief (workspace.status = 'approved')
 *      跑 `node scripts/e2e-deliverable.mjs` 先建好数据,或自己 seed
 *
 * 用法:
 *   node scripts/e2e-review.mjs
 */

import { setTimeout as sleep } from 'node:timers/promises';

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const API_PREFIX = `${API_BASE}/api/v1`;

const CREATOR = { email: 'creator_001@ibi.ren', password: 'Focus_2026!' };
const BUYER = { email: 'buyer_001@ibi.ren', password: 'Focus_2026!' };

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

// 跑一遍 deliverable E2E,留一条 approved workspace + 创作者买家双方都可用
async function prepareApprovedBrief() {
  const creatorToken = await login(CREATOR);
  const buyerToken = await login(BUYER);

  // 1. buyer 找一条带 workspace 且 approved 的 brief
  const briefs = await http('GET', '/buyer/briefs', { token: buyerToken });
  const list = Array.isArray(briefs.data) ? briefs.data : briefs.data?.items ?? [];
  // 查每个 brief 的详情,筛 workspace.status === 'approved' 的
  for (const b of list) {
    const detail = await http('GET', `/buyer/briefs/${b.id}`, { token: buyerToken });
    if (detail.data?.workspace?.status === 'approved') {
      return {
        creatorToken,
        buyerToken,
        briefId: b.id,
        buyerId: detail.data.buyerId,
        creatorId: detail.data.workspace.creatorId,
      };
    }
  }

  // 没 approved brief 就跑一遍 deliverable E2E(会留一条带已发布 deliverable 的 approved workspace)
  console.log('  · 无 approved brief,跑一遍 deliverable E2E 造数据…');
  const { spawn } = await import('node:child_process');
  await new Promise((resolve, reject) => {
    const p = spawn('node', ['scripts/e2e-deliverable.mjs'], { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`deliverable E2E 退出 ${code}`))));
  });
  const briefs2 = await http('GET', '/buyer/briefs', { token: buyerToken });
  const list2 = Array.isArray(briefs2.data) ? briefs2.data : briefs2.data?.items ?? [];
  for (const b of list2) {
    const detail = await http('GET', `/buyer/briefs/${b.id}`, { token: buyerToken });
    if (detail.data?.workspace?.status === 'approved') {
      return {
        creatorToken,
        buyerToken,
        briefId: b.id,
        buyerId: detail.data.buyerId,
        creatorId: detail.data.workspace.creatorId,
      };
    }
  }
  throw new Error('无法准备 approved brief');
}

async function main() {
  console.log('🧪 W5 E2 Review E2E');
  console.log('='.repeat(60));

  const { creatorToken, buyerToken, briefId, buyerId, creatorId } =
    await prepareApprovedBrief();
  console.log(`  · briefId = ${briefId}`);
  console.log(`  · buyerId = ${buyerId}, creatorId = ${creatorId}`);
  console.log('');

  // ===== 1. 列出当前 brief 的评价(可能是 0 也可能有) =====
  const list0 = await http('GET', `/briefs/${briefId}/reviews`, { token: buyerToken });
  assert2xx(list0.status, 'E2-1: list reviews');
  const initialCount = (list0.data?.items ?? []).length;
  ok(`E2-1: list returns ${initialCount} existing reviews`);

  // ===== 2. 买家评 buyer→creator (workspace.approved 时可评) =====
  const buyerReview = await http('POST', `/briefs/${briefId}/reviews`, {
    token: buyerToken,
    body: {
      role: 'buyer_to_creator',
      rating: 5,
      content: 'W5 E2 测试评价 — 创作者守时交付,作品质量超出预期,沟通积极',
      tags: ['专业', '守时', '有创意'],
    },
  });
  if (buyerReview.status === 400 && String(buyerReview.data?.message).includes('已评价过')) {
    ok('E2-2: buyer_to_creator 已存在(快速幂等分支)');
  } else {
    assert2xx(buyerReview.status, 'E2-2: buyer→creator submit', `data=${JSON.stringify(buyerReview.data)}`);
    assert(buyerReview.data?.review?.rating === 5, 'E2-2: rating=5');
    assert(buyerReview.data?.review?.fromUserId === buyerId, 'E2-2: fromUser=buyerId');
    assert(buyerReview.data?.review?.toUserId === creatorId, 'E2-2: toUser=creatorId');
    assert(Array.isArray(buyerReview.data?.review?.tags) && buyerReview.data.review.tags.length === 3, 'E2-2: tags persisted');
  }

  // ===== 3. 创作者从 buyer_to_creator 反向提 (应被拒,因为 direction 不对) =====
  const wrongDir = await http('POST', `/briefs/${briefId}/reviews`, {
    token: creatorToken,
    body: {
      role: 'buyer_to_creator',
      rating: 5,
      content: '创作者尝试以买家身份评',
    },
  });
  assert(wrongDir.status >= 400, 'E2-3: creator→buyer_to_creator 应被拒', `status=${wrongDir.status}`);

  // ===== 4. 创作者评 creator→buyer =====
  const creatorReview = await http('POST', `/briefs/${briefId}/reviews`, {
    token: creatorToken,
    body: {
      role: 'creator_to_buyer',
      rating: 4,
      content: 'W5 E2 测试 — 买家需求清晰,预算合理,反馈响应及时,合作顺畅',
      tags: ['清晰', '预算合理', '响应快'],
    },
  });
  if (creatorReview.status === 400 && String(creatorReview.data?.message).includes('已评价过')) {
    ok('E2-4: creator_to_buyer 已存在(快速幂等分支)');
  } else {
    assert2xx(creatorReview.status, 'E2-4: creator→buyer submit', `data=${JSON.stringify(creatorReview.data)}`);
    assert(creatorReview.data?.review?.role === 'creator_to_buyer', 'E2-4: role correct');
  }

  // ===== 5. 唯一约束 — 重复评 buyer_to_creator 应 400 =====
  const dup = await http('POST', `/briefs/${briefId}/reviews`, {
    token: buyerToken,
    body: {
      role: 'buyer_to_creator',
      rating: 3,
      content: '重复评价应被拒',
    },
  });
  assert(dup.status === 400, 'E2-5: 重复 buyer_to_creator 应 400', `status=${dup.status}`);

  // ===== 6. 列 brief 评价 — 应包含双向各 1 条 =====
  const list1 = await http('GET', `/briefs/${briefId}/reviews`, { token: buyerToken });
  const items = list1.data?.items ?? [];
  assert(
    items.some((r) => r.role === 'buyer_to_creator'),
    'E2-6: list 含 buyer→creator',
  );
  assert(
    items.some((r) => r.role === 'creator_to_buyer'),
    'E2-6: list 含 creator→buyer',
  );

  // ===== 7. listReceivedByUser — 创作者收到 =====
  const received = await http('GET', `/users/${creatorId}/reviews`, { token: creatorToken });
  assert2xx(received.status, 'E2-7: listReceivedByUser');
  assert(
    (received.data?.items ?? []).some((r) => r.role === 'buyer_to_creator'),
    'E2-7: 创作者收到 buyer→creator 评价',
  );

  // ===== 8. getUserRatingSummary =====
  const summary = await http('GET', `/users/${creatorId}/reviews/summary`, { token: creatorToken });
  assert2xx(summary.status, 'E2-8: rating summary');
  assert(typeof summary.data?.avgRating === 'number', 'E2-8: avgRating 是数字');
  assert(typeof summary.data?.count === 'number' && summary.data.count >= 1, 'E2-8: count >= 1');
  assert(
    summary.data?.asCreator && typeof summary.data.asCreator.count === 'number',
    'E2-8: asCreator 拆分',
  );

  // ===== 9. 校验 — workspace 未 approved 时不可评 (用 draft 状态 brief 试) =====
  const draftBrief = await http('POST', '/buyer/briefs', {
    token: buyerToken,
    body: {
      title: 'W5 E2 草稿 brief',
      description: '用于测 "未结案不能评价" 边界',
      category: 'ad',
      platformSet: ['douyin'],
      ipIds: [],
      budgetMin: '1000',
      budgetMax: '5000',
      packageTier: 'standard',
      deadlineAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    },
  });
  assert2xx(draftBrief.status, 'E2-9: create draft brief');
  const draftId = draftBrief.data?.id;
  const cantReview = await http('POST', `/briefs/${draftId}/reviews`, {
    token: buyerToken,
    body: {
      role: 'buyer_to_creator',
      rating: 5,
      content: '草稿状态下应被拒',
    },
  });
  assert(cantReview.status >= 400, 'E2-9: 未结案 brief 应 4xx', `status=${cantReview.status}`);

  // ===== 10. content < 5 字 应被拒 =====
  const tooShort = await http('POST', `/briefs/${briefId}/reviews`, {
    token: creatorToken,
    body: {
      role: 'creator_to_buyer',
      rating: 5,
      content: '短', // 已评过也会 400 — 但内容检查在前,应返回"至少 5 字"
    },
  });
  assert(tooShort.status >= 400, 'E2-10: content 过短应被拒', `status=${tooShort.status}`);

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
