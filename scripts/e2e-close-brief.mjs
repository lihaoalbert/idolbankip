#!/usr/bin/env node
/**
 * scripts/e2e-close-brief.mjs — W6-R5 撤回/关闭发包 intent 端到端
 *
 * 覆盖 (~12 用例):
 *   - buyer 登录 + 创建 draft → publish 到 bidding
 *   - POST /buyer/briefs/:id/close (CLOSE_BRIEF 底层) → status=closed
 *   - close 后再 close 应该 fail (status 已是 closed)
 *   - LIST_BRIEFS?status=closed 能查到刚关闭的
 *   - 创作者侧 LIST_BRIEFS (creator/briefs) 不应包含 closed 的 brief
 *   - assistant chat 撤回 — 不带 LLM key 时 fallback (intent=null) 仍 OK
 *
 * 为什么不依赖 LLM 分类:
 *   本地 dev env 没配 LLM_API_KEY (只有 ECS prod 有)。
 *   LLM 输出 CLOSE_BRIEF intent 在 ECS prod 验, 这里只验证执行链。
 *   回归测试 prod LLM 在 e2e-chat-full-rollout 后的真实用户操作覆盖。
 *
 * 用法:
 *   node scripts/e2e-close-brief.mjs
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

async function main() {
  console.log(`\n🌱 E2E W6-R5 CLOSE_BRIEF against ${API_BASE}\n`);

  // ===== 1. 登录 =====
  let creatorToken, buyerToken;
  try {
    creatorToken = await login(CREATOR);
    ok('creator login');
  } catch (e) { bad('creator login', e.message); return finish(); }
  try {
    buyerToken = await login(BUYER);
    ok('buyer login');
  } catch (e) { bad('buyer login', e.message); return finish(); }

  // ===== 2. 创建一个新 brief 准备撤回 =====
  const dl = new Date(Date.now() + 7 * 86400_000).toISOString();
  const c = await http('POST', '/buyer/briefs', { token: buyerToken, body: {
    title: `W6-R5 撤回测试 ${Date.now()}`, category: 'shortvideo', platformSet: ['douyin'],
    ipIds: [], budgetMin: 500, budgetMax: 1000, packageTier: 'standard', deadlineAt: dl,
  }});
  assert2xx(c.status, 'POST /buyer/briefs (创建 draft)');
  const briefObj = c.data?.brief ?? c.data?.data ?? c.data;
  const briefId = briefObj?.id;
  assert(typeof briefId === 'string' && briefId.length > 0, 'brief id 拿到', `id=${briefId}`);
  if (!briefId) return finish();

  // ===== 3. publish → bidding (close 接口允许 bidding 状态) =====
  const pubRes = await http('POST', `/buyer/briefs/${briefId}/publish`, { token: buyerToken });
  assert2xx(pubRes.status, 'publish (draft → bidding)');

  // 验证状态
  const before = await http('GET', `/buyer/briefs/${briefId}`, { token: buyerToken });
  assert2xx(before.status, 'GET /buyer/briefs/:id (before close)');
  assert(before.data?.status === 'bidding', 'brief 状态是 bidding', `status=${before.data?.status}`);

  // ===== 4. 创作者侧能看到 (在 listOpen 中) =====
  const creatorBefore = await http('GET', '/creator/briefs', { token: creatorToken });
  assert2xx(creatorBefore.status, 'GET /creator/briefs (before close)');
  const itemsBefore = creatorBefore.data?.items ?? creatorBefore.data ?? [];
  const visibleBefore = itemsBefore.some((b) => b.id === briefId);
  assert(visibleBefore, 'bidding brief 创作者可见');

  // ===== 5. CLOSE — 这是 CLOSE_BRIEF intent 的底层执行 =====
  const closeRes = await http('POST', `/buyer/briefs/${briefId}/close`, { token: buyerToken });
  assert2xx(closeRes.status, 'POST /buyer/briefs/:id/close (CLOSE_BRIEF 底层)', JSON.stringify(closeRes.data).slice(0, 200));

  // ===== 6. 验证状态变更 =====
  const after = await http('GET', `/buyer/briefs/${briefId}`, { token: buyerToken });
  assert2xx(after.status, 'GET /buyer/briefs/:id (after close)');
  assert(after.data?.status === 'closed', 'brief 状态变 closed', `status=${after.data?.status}`);

  // ===== 7. 创作者侧不再可见 (closed 不进 listOpen) =====
  const creatorAfter = await http('GET', '/creator/briefs', { token: creatorToken });
  assert2xx(creatorAfter.status, 'GET /creator/briefs (after close)');
  const itemsAfter = creatorAfter.data?.items ?? creatorAfter.data ?? [];
  const visibleAfter = itemsAfter.some((b) => b.id === briefId);
  assert(!visibleAfter, 'closed brief 创作者不可见 (从 listOpen 中剔除)');

  // ===== 8. close 不能再 close (服务端会拒 — 通常是 400 / 409) =====
  const closeAgain = await http('POST', `/buyer/briefs/${briefId}/close`, { token: buyerToken });
  assert(closeAgain.status >= 400, '重复 close 被拒', `status=${closeAgain.status} ${JSON.stringify(closeAgain.data).slice(0, 100)}`);

  // ===== 9. 买家 list status=closed 能查到 =====
  const closedList = await http('GET', '/buyer/briefs', { token: buyerToken, query: { status: 'closed' } });
  assert2xx(closedList.status, 'GET /buyer/briefs?status=closed');
  const closedItems = closedList.data?.items ?? closedList.data ?? [];
  const inClosedList = closedItems.some((b) => b.id === briefId);
  assert(inClosedList, 'closed brief 出现在 status=closed 列表');

  // ===== 10. assistant chat fallback — 不带 LLM key 时返 fallback, ChatResult 结构仍 OK =====
  const chatRes = await http('POST', '/assistant/chat', {
    token: buyerToken, body: { message: '撤回我发包的任务', routeContext: { route: '/buyer' } },
  });
  assert2xx(chatRes.status, 'assistant chat (R5 fallback — 无 LLM key)');
  // 不强求 intent (无 key 时可能返 null fallback), 只验 ChatResult 完整
  if (chatRes.status === 200) {
    assert(typeof chatRes.data?.reply === 'string' && chatRes.data.reply.length > 0, 'chat 有 reply');
    assert('suggestedActions' in (chatRes.data ?? {}), 'response 含 suggestedActions');
  }

  // ===== 11. SPA shell OK =====
  const webRoot = await fetch(`${WEB_BASE}/buyer`);
  assert2xx(webRoot.status, 'GET /buyer (SPA shell)');

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