#!/usr/bin/env node
/**
 * scripts/e2e-chat-workspace.mjs — W6-R2 三分屏 chat 端到端测试
 *
 * 覆盖 (10 用例):
 *   - 三端 build 静态资源加载 (/buyer/chat 路由 SPA 返回 index.html)
 *   - 买家登录 → POST /buyer/briefs (IntentCard CREATE_BRIEF 底层 API)
 *   - 列出我的发包 (LIST_BRIEFS 底层 API)
 *   - 创作者对发包投标 (PLACE_BID 底层 — R2 不接 intent 卡片, R3 接)
 *   - 买家接受投标 (ACCEPT_BID → workspaceId 创建)
 *   - buyer 写流程端到端: brief create → bid → accept (全 200, workspace 不为空)
 *   - Assistant.chat FAQ 命中 → intent=undefined (R1 不破)
 *   - Assistant.chat 业务意图 → 跳过 FAQ 走 LLM (R2.1 修复)
 *   - Assistant.chat 写操作意图字段 (R2 后端 CREATE_BRIEF 已挂)
 *   - DB schema 兼容 (BuyerWorkbench 老路由在 R4 才 302, R2 保留)
 *
 * 跑前:
 *   1. 三端 build (pnpm --filter <api|web> run build)
 *   2. API 跑在 localhost:3000, Web 跑在 localhost:8080 (生产 nginx 或 vite preview)
 *   3. DB 已 seed (pnpm seed:users + pnpm seed:ips)
 *
 * 用法:
 *   node scripts/e2e-chat-workspace.mjs                # 默认连 localhost:3000
 *   API_BASE=http://1.2.3.4:3000 node ...
 *
 * 退出码:0 全过 / 1 有失败
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
  return { status: res.status, data, headers: res.headers };
}

async function login(user) {
  const { status, data } = await http('POST', '/auth/login', { body: user });
  if (status !== 200 && status !== 201) throw new Error(`login ${user.email} 失败: status=${status}`);
  return data.accessToken ?? data.token ?? data.access_token;
}

async function chat(token, message, history = []) {
  return http('POST', '/assistant/chat', {
    token,
    body: {
      message,
      history,
      routeContext: { route: '/buyer/chat' },
    },
  });
}

async function main() {
  console.log(`\n🌱 E2E W6-R2 ChatWorkspace against ${API_BASE} web=${WEB_BASE}\n`);

  // ===== 1. SPA 静态路由: /buyer/chat 必须 200 =====
  const chatPage = await fetch(`${WEB_BASE}/buyer/chat`);
  assert2xx(chatPage.status, 'GET /buyer/chat (SPA serve)', `status=${chatPage.status}`);
  if (chatPage.status === 200) {
    const html = await chatPage.text();
    assert(html.includes('<div id="app">'), '/buyer/chat returns Vue SPA shell', `len=${html.length}`);
  }

  const buyerRoot = await fetch(`${WEB_BASE}/buyer`);
  assert2xx(buyerRoot.status, 'GET /buyer (SPA serve)', `status=${buyerRoot.status}`);

  // ===== 2. 登录 =====
  let buyerToken, creatorToken;
  try {
    buyerToken = await login(BUYER);
    ok('buyer login');
  } catch (e) {
    bad('buyer login', e.message);
    return finish();
  }
  try {
    creatorToken = await login(CREATOR);
    ok('creator login');
  } catch (e) {
    bad('creator login', e.message);
    return finish();
  }

  // ===== 3. CREATE_BRIEF intent 底层 API: POST /buyer/briefs =====
  const deadlineAt = new Date(Date.now() + 7 * 86400_000).toISOString();
  const createPayload = {
    title: `W6-R2 E2E ${Date.now()}`,
    description: 'R2 buyer 三分屏 chat 测试 — IntentCard CREATE_BRIEF 底层走这个接口',
    category: 'shortvideo',
    platformSet: ['douyin', 'xiaohongshu'],
    ipIds: [],
    budgetMin: 1000,
    budgetMax: 2000,
    packageTier: 'standard',
    deadlineAt,
  };
  const createRes = await http('POST', '/buyer/briefs', {
    token: buyerToken,
    body: createPayload,
  });
  assert2xx(createRes.status, 'POST /buyer/briefs (CREATE_BRIEF)', JSON.stringify(createRes.data).slice(0, 200));
  // API 返 { brief: {...} } / { data: {...} } / 或直返 brief, 三种都吃
  const briefObj = createRes.data?.brief ?? createRes.data?.data ?? createRes.data;
  const briefId = briefObj?.id;
  assert(typeof briefId === 'string' && briefId.length > 0, 'brief id present', `id=${briefId}`);
  if (!briefId) return finish();

  // ===== 4. POST /buyer/briefs/:id/publish  状态机: draft → bidding =====
  const publishRes = await http('POST', `/buyer/briefs/${briefId}/publish`, {
    token: buyerToken,
  });
  assert2xx(publishRes.status, 'POST /buyer/briefs/:id/publish (draft → bidding)', JSON.stringify(publishRes.data).slice(0, 200));

  // ===== 5. LIST_BRIEFS 底层 API: GET /buyer/briefs?status=bidding (买家的发包按状态过滤) =====
  const listRes = await http('GET', '/buyer/briefs', {
    token: buyerToken,
    query: { status: 'bidding' },
  });
  assert2xx(listRes.status, 'GET /buyer/briefs?status=bidding');
  if (listRes.status === 200) {
    const items = listRes.data?.items ?? listRes.data ?? [];
    const found = Array.isArray(items) && items.some((b) => b.id === briefId);
    assert(found, `刚 publish 的发包出现在 status=bidding 列表 (list items: ${items.length})`, JSON.stringify(items).slice(0, 300));
  }

  // ===== 5. PLACE_BID 底层 (创作者对发包投标, R2 不接 intent 卡片但 R3 用) =====
  const bidPayload = { price: 1500, deliveryDays: 5, proposal: 'W6-R2 E2E 测试 — 给 5 天交付 1500 元报价' };
  const bidRes = await http('POST', `/creator/briefs/${briefId}/bids`, {
    token: creatorToken,
    body: bidPayload,
  });
  assert2xx(bidRes.status, 'POST /creator/briefs/:id/bids (PLACE_BID)', JSON.stringify(bidRes.data).slice(0, 200));
  const bidObj = bidRes.data?.bid ?? bidRes.data?.data ?? bidRes.data;
  const bidId = bidObj?.id;
  assert(typeof bidId === 'string' && bidId.length > 0, 'bid id present', `bidId=${bidId}`);

  // ===== 6. ACCEPT_BID 底层: POST /buyer/briefs/:briefId/bids/:bidId/accept =====
  if (briefId && bidId) {
    const acceptRes = await http('POST', `/buyer/briefs/${briefId}/bids/${bidId}/accept`, {
      token: buyerToken,
    });
    assert2xx(acceptRes.status, 'POST /buyer/briefs/.../bids/.../accept (ACCEPT_BID)', JSON.stringify(acceptRes.data).slice(0, 200));
    const workspaceId = acceptRes.data?.workspaceId;
    assert(typeof workspaceId === 'string' && workspaceId.length > 0, 'workspaceId 返回', `ws=${workspaceId}`);
  }

  // ===== 7. Assistant.chat FAQ 命中仍走老路 (intent=undefined) =====
  const faqMsg = '4 档授权我该买哪档?'; // 不属于业务意图, 走 FAQ
  const faqRes = await chat(buyerToken, faqMsg);
  assert2xx(faqRes.status, 'assistant chat (FAQ)');
  if (faqRes.status === 200) {
    // FAQ 命中 → intent=undefined (不出现在 JSON 里)
    assert(faqRes.data?.intent === undefined || faqRes.data?.intent === null, 'FAQ 不挂 intent', `intent=${faqRes.data?.intent}`);
    assert(typeof faqRes.data?.reply === 'string' && faqRes.data.reply.length > 0, 'FAQ reply 必有');
  }

  // ===== 8. Assistant.chat 业务意图 (R2.1 修复验证) — 跳过 FAQ 走 LLM =====
  // 注意: 本地 LLM 是占位 key, 实际走 fallback; 但关键是 FAQ 不能抢答
  const bizMsg = `帮我发包, 标题 "测试 ${Date.now()}" 短剧类, 抖音小红书, 1500 元起 3000 元到, standard 套餐, ${deadlineAt} 截止`;
  const bizRes = await chat(buyerToken, bizMsg);
  assert2xx(bizRes.status, 'assistant chat (业务意图, 应跳过 FAQ)');
  if (bizRes.status === 200) {
    // 业务意图必须不挂 FAQ 的 reply (FAQ 是 "4 档授权..." 而不是发包草稿)
    // LLM 不可用时回 fallback, 但 fallback 也不应是 FAQ 内容
    const reply = bizRes.data?.reply ?? '';
    const isFaq = reply.includes('档') && reply.includes('授权');
    assert(!isFaq, '业务意图没被 FAQ 抢答', `reply=${reply.slice(0, 80)}`);
  }

  // ===== 9. Assistant.chat CREATE_BRIEF 字段已挂 (R2 后端补完) =====
  // 即使本地 LLM 是 fallback, API 响应结构仍必须包含 createBrief 的 IntentType 字典
  // 走另一个业务意图, 看 intent 字段位置结构是否正常
  const createBriefMsg = `我想发包, 标题 "短剧 "${Date.now()}", 抖音平台, 1000-2000, essential 套餐, ${deadlineAt} 截止`;
  const cbRes = await chat(buyerToken, createBriefMsg);
  assert2xx(cbRes.status, 'assistant chat (CREATE_BRIEF 路径)');
  if (cbRes.status === 200) {
    // 响应结构里必须有 intent 字段 (即使 fallback 也会返 null, 这是 schema 验证)
    assert('intent' in (cbRes.data ?? {}), 'response 含 intent 字段', JSON.stringify(cbRes.data?.intent));
    // has reply
    assert(typeof cbRes.data?.reply === 'string', 'response 含 reply');
  }

  // ===== 10. 老 buyer 路由仍可访问 (R4.1 才 302, R2 不破) =====
  const oldWorkbench = await fetch(`${WEB_BASE}/buyer/workbench`);
  assert2xx(oldWorkbench.status, 'GET /buyer/workbench (老路由 R2 仍可用)', `status=${oldWorkbench.status}`);

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
