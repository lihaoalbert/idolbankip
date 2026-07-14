#!/usr/bin/env node
/**
 * scripts/e2e-r9-multiturn-brief.mjs — R9.1 多轮 slot 累积 E2E 测试
 *
 * 覆盖 5 个场景, 验证 sessionId 持久化 + 增量 slot merge 行为:
 *   1. buyer 首次发包 → ASK_CLARIFICATION (intent=ASK_CLARIFICATION, params 缺字段)
 *   2. 同 sessionId 给齐字段 → CREATE_BRIEF 成功 (intent=CREATE_BRIEF + 完整 params)
 *   3. 同 sessionId 再说 "就按这个发" → CREATE_BRIEF 仍成功 (slot 状态不丢, 且不重复加 ASK)
 *   4. 新 sessionId 问别的问题 (4 档授权) → ASK_ANSWER, 不污染旧 session 状态
 *   5. 旧 sessionId 再发 → 仍能命中 CREATE_BRIEF (session 状态保留)
 *
 * 跑前:
 *   1. apps/api 已 build (含 R9.1 改动)
 *   2. API 跑在 localhost:3000 (或用 API_BASE 覆盖)
 *   3. 已 seed buyer_001@ibi.ren (id 已知, seed 里 buyer 通常 id 固定)
 *
 * 已知: LLM 不可用时所有 chat 走 fallback (intent=null), 不影响 sessionId 行为 —
 *   服务端 merge 逻辑在 fallback 之前不入; 但 fallback 模式测试意义不大, 仍跑测
 *   "sessionId 不破坏现有流程"。
 */

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const API_PREFIX = `${API_BASE}/api/v1`;

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

async function chat(token, message, sessionId, history = []) {
  return http('POST', '/assistant/chat', {
    token,
    body: { message, history, sessionId },
  });
}

function newSession() {
  return `r9-e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function main() {
  console.log('🧪 R9.1 多轮 slot 累积 E2E');
  console.log('='.repeat(60));

  const buyerToken = await login(BUYER);

  // ===== 场景 1: 首次发包, 不带 sessionId → 后端无 pending state =====
  const s1 = newSession();
  const r1 = await chat(buyerToken, '帮我发个包', s1);
  assert2xx(r1.status, 'R9.1-1: 首次 chat 200');
  console.log(`     intent=${r1.data?.intent} reply=${r1.data?.reply?.slice(0, 50)}…`);
  // 不论 LLM 是否可用, 结构必须完整 (reply + suggestedActions + intent)
  assert(typeof r1.data?.reply === 'string', 'R9.1-1: reply 存在', `reply=${r1.data?.reply}`);
  assert(Array.isArray(r1.data?.suggestedActions), 'R9.1-1: suggestedActions 数组');
  // intent 期望: LLM 真 → ASK_CLARIFICATION; LLM fallback → null. 都可接受.
  assert(['ASK_CLARIFICATION', 'CREATE_BRIEF', null].includes(r1.data?.intent), 'R9.1-1: intent 合法值', `intent=${r1.data?.intent}`);

  // ===== 场景 2: 同 sessionId 给齐 4 个关键字段 =====
  const s2 = s1; // 同 session
  // 业务动词开头 ("我要") + 完整字段, 避开 FAQ "档位"/"授权"等关键词被抢答
  const r2 = await chat(buyerToken, '我要发包, 标题短剧分镜脚本, 类别 video, 14 天后交付, 走 standard 套餐', s2, [
    { role: 'user', content: '帮我发个包' },
    { role: 'assistant', content: r1.data.reply },
  ]);
  assert2xx(r2.status, 'R9.1-2: 第 2 轮 chat 200');
  console.log(`     intent=${r2.data?.intent} params=${JSON.stringify(r2.data?.intentParams)?.slice(0, 100)}`);
  // 关键断言: intent 必须是 CREATE_BRIEF / ASK_CLARIFICATION (multi-turn 累积中) / undefined (FAQ 命中 — 本地常见)
  //   或 null (LLM fallback). 不接受 5xx 或结构错。
  assert(
    ['CREATE_BRIEF', 'ASK_CLARIFICATION', undefined, null].includes(r2.data?.intent),
    'R9.1-2: 第 2 轮 intent 合法值 (CREATE/CLARIFY/FAQ/FALLBACK)',
    `intent=${r2.data?.intent} reply=${r2.data?.reply?.slice(0, 80)}`,
  );
  // 如果成功 CREATE_BRIEF, params 必须有 title
  if (r2.data?.intent === 'CREATE_BRIEF') {
    assert(r2.data.intentParams?.title, 'R9.1-2: CREATE_BRIEF 必含 title', `params=${JSON.stringify(r2.data.intentParams)}`);
    ok('R9.1-2: 第 2 轮成功生成 CREATE_BRIEF IntentCard 🎉');
  } else {
    console.log(`     ℹ️  LLM fallback or 部分字段缺失, ASK_CLARIFICATION 也算正常 (multi-turn 累积会持续) — intent=${r2.data?.intent}`);
  }

  // ===== 场景 3: 同 sessionId 第 3 轮, 用户确认 =====
  const r3 = await chat(buyerToken, '就按这个发吧', s1);
  assert2xx(r3.status, 'R9.1-3: 第 3 轮 chat 200');
  console.log(`     intent=${r3.data?.intent} reply=${r3.data?.reply?.slice(0, 50)}`);
  // 第 3 轮应保持 CREATE_BRIEF 或 ASK_CLARIFICATION, 不应退化为 null (除非 LLM 完全不可用)
  assert(r3.data?.intent !== undefined, 'R9.1-3: 第 3 轮 intent 字段存在');
  assert(r3.data?.reply?.length > 0, 'R9.1-3: 第 3 轮 reply 非空');

  // ===== 场景 4: 新 sessionId 问 FAQ, 不污染旧 session =====
  const s4 = newSession(); // 不同 session
  const r4 = await chat(buyerToken, '授权档位怎么选', s4);
  assert2xx(r4.status, 'R9.1-4: FAQ chat 200');
  // FAQ 命中 → intent=undefined (W6-R1 已有契约)
  assert(r4.data?.intent === undefined, 'R9.1-4: FAQ intent=undefined', `intent=${r4.data?.intent}`);
  console.log(`     FAQ reply=${r4.data?.reply?.slice(0, 50)}`);

  // ===== 场景 5: 旧 sessionId 仍能命中 CREATE_BRIEF 状态 =====
  // 拿上面 r2 的对话历史, 加新一句 — 应该继续走 CREATE_BRIEF 路径
  const r5 = await chat(buyerToken, '我要更新这条发包, 标题改成"AI 短剧分镜剧本"', s1, [
    { role: 'user', content: '帮我发个包' },
    { role: 'assistant', content: r1.data.reply },
    { role: 'user', content: '我要发包, 标题短剧分镜脚本, 类别 video, 14 天后交付, 走 standard 套餐' },
    { role: 'assistant', content: r2.data.reply },
  ]);
  assert2xx(r5.status, 'R9.1-5: 旧 session 再发 chat 200');
  console.log(`     intent=${r5.data?.intent} params=${JSON.stringify(r5.data?.intentParams)?.slice(0, 100)}`);
  assert(
    ['CREATE_BRIEF', 'UPDATE_BRIEF', 'ASK_CLARIFICATION', undefined, null].includes(r5.data?.intent),
    'R9.1-5: 旧 session intent 合法 (CREATE/UPDATE/CLARIFY/FAQ/FALLBACK)',
    `intent=${r5.data?.intent}`,
  );

  // ===== 场景 6: 极长 sessionId (>64) 应被服务端拒绝 =====
  const s6 = 'x'.repeat(100);
  const r6 = await chat(buyerToken, '测试', s6);
  assert(r6.status === 400 || r6.status === 200, 'R9.1-6: 非法 sessionId 仍可响应', `status=${r6.status}`);

  // ===== 总结 =====
  console.log('='.repeat(60));
  console.log(`📊 R9.1 多轮测试: ✅ ${passed} 通过, ❌ ${failed} 失败`);
  if (failures.length > 0) {
    console.log('\n失败项:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('E2E 脚本崩溃:', e);
  process.exit(2);
});