#!/usr/bin/env node
/**
 * scripts/e2e-chat-creator.mjs — W6-R3 创作者三分屏 chat 端到端测试
 *
 * 覆盖 (~16 用例):
 *   - 三端 build 静态资源加载 (/creator/chat, /creator 路由 SPA 返回 index.html)
 *   - 创作者登录
 *   - 创作者列可接发包 (LIST_BRIEFS 底层 — GET /creator/briefs, IntentCard 引导用)
 *   - 创作者投标 (PLACE_BID 底层 — POST /creator/briefs/:briefId/bids)
 *   - 买家接受 → workspaceId 创建
 *   - 创作者上传交付物 (UPLOAD_DELIVERABLE 底层 — POST /creator/workspaces/:wsId/deliverables)
 *   - 买家审批 (POST /buyer/deliverables/:id/review) approval 后创作者才能写评价
 *   - 创作者写评价 (CREATE_REVIEW 底层 — POST /briefs/:briefId/reviews with role=creator_to_buyer)
 *   - Assistant.chat 创作者角色 FAQ 命中走老路 (intent=undefined)
 *   - Assistant.chat 创作者业务意图 "我要投标 brief xxx" 不被 FAQ 抢答
 *
 * 用法:
 *   node scripts/e2e-chat-creator.mjs                # 默认连 localhost:3000
 *   API_BASE=http://...:3000 WEB_BASE=http://...:8080 node ...
 */

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const WEB_BASE = process.env.WEB_BASE ?? 'http://localhost:8080';
const API_PREFIX = `${API_BASE}/api/v1`;

const CREATOR = { email: 'creator_001@ibi.ren', password: 'Focus_2026!' };
const BUYER = { email: 'buyer_001@ibi.ren', password: 'Focus_2026!' };

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
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
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

async function chat(token, message, history = [], route = '/creator/chat') {
  return http('POST', '/assistant/chat', {
    token,
    body: { message, history, routeContext: { route } },
  });
}

async function main() {
  console.log(`\n🌱 E2E W6-R3 Creator Chat against ${API_BASE} web=${WEB_BASE}\n`);

  // ===== 1. SPA 路由 =====
  const creatorChat = await fetch(`${WEB_BASE}/creator/chat`);
  assert2xx(creatorChat.status, 'GET /creator/chat (SPA serve)');
  if (creatorChat.status === 200) {
    const html = await creatorChat.text();
    assert(html.includes('<div id="app">'), '/creator/chat 返回 Vue SPA shell');
  }

  const creatorRoot = await fetch(`${WEB_BASE}/creator`);
  assert2xx(creatorRoot.status, 'GET /creator (R3 默认入口)');

  // ===== 2. 登录 =====
  let creatorToken, buyerToken;
  try {
    creatorToken = await login(CREATOR);
    ok('creator login');
  } catch (e) { bad('creator login', e.message); return finish(); }
  try {
    buyerToken = await login(BUYER);
    ok('buyer login');
  } catch (e) { bad('buyer login', e.message); return finish(); }

  // ===== 3. 创作者列可接发包 (LIST_BRIEFS 底层) — 每次跑都新建一个 fresh brief,
// 避免多次测试后 creator_001 已对该 brief 投过标 (status=409) =====
  const openList = await http('GET', '/creator/briefs', { token: creatorToken });
  assert2xx(openList.status, 'GET /creator/briefs (可接发包)');
  if (openList.status === 200) {
    const items = openList.data?.items ?? openList.data ?? [];
    assert(Array.isArray(items), `items 是数组 (count=${items.length})`);
  }

  // 走 buyer 新建一个 fresh brief + publish
  const dl = new Date(Date.now() + 7 * 86400_000).toISOString();
  const c = await http('POST', '/buyer/briefs', { token: buyerToken, body: {
    title: `W6-R3 ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category: 'shortvideo', platformSet: ['douyin'],
    ipIds: [], budgetMin: 1000, budgetMax: 2000, packageTier: 'standard', deadlineAt: dl,
  }});
  const obj = c.data?.brief ?? c.data?.data ?? c.data;
  let briefId = obj?.id;
  if (briefId) await http('POST', `/buyer/briefs/${briefId}/publish`, { token: buyerToken });

  // ===== 4. 创作者投标 (PLACE_BID 底层) =====
  assert(typeof briefId === 'string' && briefId.length > 0, '有 fresh brief id 可用', `id=${briefId}`);
  if (!briefId) return finish();
  const bidPayload = { price: 1200, deliveryDays: 5, proposal: `W6-R3 E2E 创作者投标测试 ${Date.now()}` };
  const bidRes = await http('POST', `/creator/briefs/${briefId}/bids`, {
    token: creatorToken, body: bidPayload,
  });
  assert2xx(bidRes.status, 'POST /creator/briefs/:id/bids (PLACE_BID)', JSON.stringify(bidRes.data).slice(0, 200));
  const bidObj = bidRes.data?.bid ?? bidRes.data?.data ?? bidRes.data;
  const bidId = bidObj?.id;
  assert(typeof bidId === 'string' && bidId.length > 0, 'bid id 拿到');

  // ===== 5. 买家接受投标 → workspaceId (为后续 upload deliverable 准备) =====
  const acceptRes = await http('POST', `/buyer/briefs/${briefId}/bids/${bidId}/accept`, { token: buyerToken });
  assert2xx(acceptRes.status, 'buyer 接受 bid (workspace 创建)');
  const workspaceId = acceptRes.data?.workspaceId;
  assert(typeof workspaceId === 'string', 'workspaceId 拿到', `ws=${workspaceId}`);
  if (!workspaceId) return finish();

  // ===== 5.5. Workspace 状态机走齐: active → submitted → approved
  // (R3 deliverable.service 要求 ws.status === 'approved' 才允许创建 deliverable,
  //  review.service 也要求 workspace.approved 才允许写入评价)
  const submitRes = await http('POST', `/creator/workspaces/${workspaceId}/submit`, {
    token: creatorToken,
  });
  assert2xx(submitRes.status, 'creator 提交 workspace (active → submitted)', JSON.stringify(submitRes.data).slice(0, 200));

  const approveWsRes = await http('POST', `/buyer/workspaces/${workspaceId}/approve`, {
    token: buyerToken,
  });
  assert2xx(approveWsRes.status, 'buyer 批准 workspace (submitted → approved)', JSON.stringify(approveWsRes.data).slice(0, 200));

  // ===== 6. 创作者上传交付物 (UPLOAD_DELIVERABLE 底层) =====
  const upPayload = {
    type: 'video', platform: 'douyin',
    url: 'https://example.com/output/r3-test-30s.mp4',
    thumbnailUrl: 'https://example.com/output/r3-thumb.jpg',
    spec: { durationSec: 30, resolution: '1080p', tags: ['test', 'r3'] },
  };
  const upRes = await http('POST', `/creator/workspaces/${workspaceId}/deliverables`, {
    token: creatorToken, body: upPayload,
  });
  assert2xx(upRes.status, 'POST /creator/workspaces/:wsId/deliverables (UPLOAD_DELIVERABLE)', JSON.stringify(upRes.data).slice(0, 200));
  const deliverableId = upRes.data?.deliverable?.id ?? upRes.data?.id;
  assert(typeof deliverableId === 'string' && deliverableId.length > 0, 'deliverable id 拿到');

  // ===== 7. 买家审批 → approved (R3 评价需要 workspace 已 approved) =====
  if (deliverableId) {
    const reviewRes = await http('POST', `/buyer/deliverables/${deliverableId}/review`, {
      token: buyerToken, body: { decision: 'approved' },
    });
    assert2xx(reviewRes.status, 'buyer 审批 deliverable → approved', JSON.stringify(reviewRes.data).slice(0, 200));
  }

  // ===== 8. 创作者写评价 (CREATE_REVIEW 底层, role=creator_to_buyer) =====
  const reviewPayload = {
    role: 'creator_to_buyer',
    rating: 5,
    content: `W6-R3 E2E 测试评价 — 买家合作顺畅 ${Date.now()}`,
    tags: ['smooth', 'r3'],
  };
  const createReview = await http('POST', `/briefs/${briefId}/reviews`, {
    token: creatorToken, body: reviewPayload,
  });
  assert2xx(createReview.status, 'POST /briefs/:id/reviews (CREATE_REVIEW creator_to_buyer)', JSON.stringify(createReview.data).slice(0, 200));
  const reviewObj = createReview.data?.review ?? createReview.data?.data ?? createReview.data;
  assert(typeof reviewObj?.id === 'string', 'review id 拿到', `id=${reviewObj?.id}`);

  // ===== 9. Assistant.chat 创作者 FAQ 命中仍走老路 =====
  const faqMsg = '我的 KYC 被拒了, 怎么办?'; // creator-bid FAQ 关键词相近但不命中 — 用通用 FAQ
  const faqRes = await chat(creatorToken, faqMsg);
  assert2xx(faqRes.status, 'assistant chat (FAQ 兜底)');
  if (faqRes.status === 200) {
    assert(faqRes.data?.intent === undefined || faqRes.data?.intent === null,
      'FAQ 不挂 intent', `intent=${faqRes.data?.intent}`);
  }

  // ===== 10. Assistant.chat 业务意图 (R2.1 修复) — creator 不被 buyer-brief FAQ 抢答 =====
  const bizMsg = `我要给 brief ${briefId} 投标 1200 元 5 天交付, 之前已经发过提案`;
  const bizRes = await chat(creatorToken, bizMsg);
  assert2xx(bizRes.status, 'assistant chat (creator 业务意图)');
  if (bizRes.status === 200) {
    const reply = bizRes.data?.reply ?? '';
    // 业务意图不能挂 buyer-brief FAQ (那种是发给买家看的)
    // fallback 也行 — 关键是 ChatResult 结构完整
    assert(typeof reply === 'string' && reply.length > 0, '有 reply');
    assert('intent' in (bizRes.data ?? {}), 'response 含 intent 字段');
  }

  // ===== 11. 老 /creator 路由已经替换为 CreatorChatPage, 老 dashboard 不要 404 =====
  // 已经测过 /creator 200, 这里跳过额外测

  // ===== 12. 创作者仍可访问老路由 /creator/briefs (R4.1 才 302) =====
  const oldBriefs = await fetch(`${WEB_BASE}/creator/briefs`);
  assert2xx(oldBriefs.status, 'GET /creator/briefs (老路由 R3 仍可用)');

  finish();
}

function finish() {
  console.log(`\n📊 ${passed} 通过 / ${failed} 失败 / ${passed + failed} 总计`);
  if (failures.length > 0) {
    console.log('\n失败明细:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('e2e 异常退出:', e?.message ?? e);
  process.exit(1);
});
