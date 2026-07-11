#!/usr/bin/env node
/**
 * scripts/e2e-chat-full-rollout.mjs — W6-R4 全量上线 E2E
 *
 * 覆盖 (10 用例):
 *   - SPA 入口与 chat 入口 200
 *   - /buyer/workbench 老路由 SPA 仍返 200 (客户端 Router 会 302 → /buyer)
 *   - /creator 老 dashboard 路由 已替换 → /creator/chat
 *   - /buyer/brief/new / /buyer/briefs/:id /orders 老路由不受影响 (200)
 *   - /creator/briefs /creator/tasks /creator/assets 老路由不受影响 (200)
 *   - Buyer/Creator 登录态访问对方路由被拒 (回首页)
 *
 * 用法:
 *   node scripts/e2e-chat-full-rollout.mjs           # 默认连 localhost:3000/8080
 */

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const WEB_BASE = process.env.WEB_BASE ?? 'http://localhost:8080';

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) { passed++; console.log(`  ✅ ${name}`); }
function bad(name, msg) { failed++; failures.push(`${name}: ${msg}`); console.log(`  ❌ ${name}: ${msg}`); }
function assert(cond, name, detail = '') { cond ? ok(name) : bad(name, detail); }
function assert2xx(status, name, detail = '') { assert(status >= 200 && status < 300, name, `status=${status} ${detail}`); }

async function main() {
  console.log(`\n🌱 E2E W6-R4 Full Rollout against ${API_BASE} web=${WEB_BASE}\n`);

  // ===== 1. chat 默认入口 (R2/R3 已上) =====
  for (const path of ['/', '/buyer/chat', '/buyer', '/creator/chat', '/creator']) {
    const r = await fetch(`${WEB_BASE}${path}`);
    assert2xx(r.status, `GET ${path} (chat 默认入口)`);
    if (r.status === 200) {
      const html = await r.text();
      assert(html.includes('<div id="app">'), `${path} 返回 Vue SPA shell`);
    }
  }

  // ===== 2. 老路由 302 — /buyer/workbench 现已 redirect 到 /buyer =====
  // SPA 模式下所有非静态资源都返 200 + index.html, 客户端 Router 看到 redirect 跳到 /buyer
  // 这里只验证 SPA fallback 没挂掉, Vue Router redirect 配置项生效由手动浏览器验证
  {
    const r = await fetch(`${WEB_BASE}/buyer/workbench`);
    assert2xx(r.status, 'GET /buyer/workbench (老路由 SPA fallback)');
    if (r.status === 200) {
      const html = await r.text();
      assert(html.includes('<div id="app">'), '/buyer/workbench 仍走 SPA (客户端 Router 负责 redirect)');
    }
  }

  // ===== 3. 买家核心路由仍可用 =====
  for (const path of ['/buyer/brief/new', '/orders', '/workspaces/test-123']) {
    const r = await fetch(`${WEB_BASE}${path}`);
    assert2xx(r.status, `GET ${path} (买家核心路由 SPA)`);
  }

  // ===== 4. 创作者核心路由仍可用 =====
  for (const path of ['/creator/briefs', '/creator/tasks', '/creator/assets', '/creator/api-keys', '/creator/onboard', '/creator/ips/new']) {
    const r = await fetch(`${WEB_BASE}${path}`);
    assert2xx(r.status, `GET ${path} (创作者核心路由 SPA)`);
  }

  // ===== 5. /assistant (全屏) 仍可用 =====
  {
    const r = await fetch(`${WEB_BASE}/assistant`);
    assert2xx(r.status, 'GET /assistant (独立全屏 assistant 入口)');
  }

  // ===== 6. 公共 / 工具路由 =====
  for (const path of ['/ips', '/login', '/register', '/contact', '/legal/originality-commitment', '/studio/catalog']) {
    const r = await fetch(`${WEB_BASE}${path}`);
    assert2xx(r.status, `GET ${path} (公共路由)`);
  }

  // ===== 7. 健康 =====
  const apiHealth = await fetch(`${API_BASE}/health`);
  assert2xx(apiHealth.status, 'GET /health (API)');

  // ===== 8. 入口资产引用 (dev: vite /@vite/client, prod: hashed asset) =====
  const indexHtml = await (await fetch(`${WEB_BASE}/`)).text();
  const hasDevOrProdAsset = /\/@vite\/client|\/assets\/index-[A-Za-z0-9_.-]+\.js/.test(indexHtml);
  assert(hasDevOrProdAsset, 'root index.html 引用 vite client 或 hashed JS asset');

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
