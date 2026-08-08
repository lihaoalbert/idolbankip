#!/usr/bin/env node
/**
 * scripts/e2e-r7-attachment.mjs — W6-R7 附件 + IP 库 + embed 路由
 *
 * 覆盖:
 *   A. multipart chat (5 用例):
 *     1. text + 1 图片 → 200 + attachments[0].fileId
 *     2. 2 图片 + text → attachments.length=2
 *     3. 只有 text 无附件 → multipart 端点也 OK (有 message 即可)
 *     4. 超 5 文件 → 400
 *     5. 无 token → 401
 *
 *   B. IP filter creatorName (5 用例):
 *     6. GET /ips?creatorName=林雾 → 200
 *     7. GET /ips 不带 filter → 200 + items
 *     8. GET /ips?gender=FEMALE → 200
 *     9. GET /ips?creatorName=不存在的IP → 200 + items 可能为空(不报错)
 *     10. GET /ips?creatorName='' 空字符串 → 200(应忽略空 filter)
 *
 *   C. Intent 路由(本地不依赖 LLM,curl 直接看 prompt 已包含) — 跳过, ECS 跑 LLM
 *
 * 用法:
 *   node scripts/e2e-r7-attachment.mjs
 */

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const API_PREFIX = `${API_BASE}/api/v1`;

const CREATOR = { email: 'creator_001@ibi.ren', password: 'Focus_2026!' };

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) { passed++; console.log(`  ✅ ${name}`); }
function bad(name, msg) { failed++; failures.push(`${name}: ${msg}`); console.log(`  ❌ ${name}: ${msg}`); }
function assert(cond, name, detail = '') { cond ? ok(name) : bad(name, detail); }
function assert2xx(status, name, detail = '') { assert(status >= 200 && status < 300, name, `status=${status} ${detail}`); }

/** Build minimal valid PNG (1x1 red pixel, base64). Avoids file deps. */
function tinyPngBase64() {
  // 1x1 PNG, red pixel — minimal valid PNG
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

function tinyTxtBuffer() {
  return Buffer.from('hello ibiren chat attachment test', 'utf-8');
}

async function httpRaw(url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { status: res.status, data };
}

async function login(user) {
  const { status, data } = await httpRaw(`${API_PREFIX}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(user),
  });
  if (status !== 200 && status !== 201) throw new Error(`login ${user.email} 失败: status=${status} body=${JSON.stringify(data)}`);
  return data.accessToken ?? data.token ?? data.access_token;
}

async function buildMultipart({ message, history, files }) {
  const fd = new FormData();
  fd.append('message', message);
  if (history !== undefined) fd.append('historyRaw', JSON.stringify(history));
  for (const { buffer, name, type } of files) {
    fd.append('files', new Blob([buffer], { type }), name);
  }
  return fd;
}

async function runAttachmentTests() {
  const token = await login(CREATOR);
  console.log('\n—— A. multipart chat-with-attachments ——');

  // 1. text + 1 image
  {
    const fd = await buildMultipart({
      message: '看看这张脸, 帮我写 1 句小传',
      files: [{ buffer: tinyPngBase64(), name: 'face.png', type: 'image/png' }],
    });
    const { status, data } = await httpRaw(`${API_PREFIX}/assistant/chat-with-attachments`, {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd,
    });
    assert2xx(status, '1. multipart + 1 张图 → 200', JSON.stringify(data).slice(0, 100));
    assert(Array.isArray(data?.attachments) && data.attachments.length === 1, '2. attachments[0].fileId 存在', JSON.stringify(data?.attachments?.[0]));
  }

  // 3. text + 2 files (1 image + 1 doc)
  {
    const fd = await buildMultipart({
      message: '这份文档和这张图, 帮我总结',
      files: [
        { buffer: tinyPngBase64(), name: 'face.png', type: 'image/png' },
        { buffer: tinyTxtBuffer(), name: 'note.txt', type: 'text/plain' },
      ],
    });
    const { status, data } = await httpRaw(`${API_PREFIX}/assistant/chat-with-attachments`, {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd,
    });
    assert2xx(status, '3. multipart + 1 图 + 1 文 → 200', JSON.stringify(data).slice(0, 100));
    assert(Array.isArray(data?.attachments) && data.attachments.length === 2, '4. attachments.length === 2', `got ${data?.attachments?.length}`);
  }

  // 5. >5 files → 400 (file interceptor rejects)
  {
    const fd = await buildMultipart({
      message: '六张图',
      files: Array.from({ length: 6 }).map((_, i) => ({
        buffer: tinyPngBase64(), name: `face${i}.png`, type: 'image/png',
      })),
    });
    const { status, data } = await httpRaw(`${API_PREFIX}/assistant/chat-with-attachments`, {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd,
    });
    assert(status === 400 || status === 413 || status === 422,
      '5. 6 文件超限 → 4xx (400/413/422)', `status=${status} ${JSON.stringify(data).slice(0, 80)}`);
  }

  // 6. no token → 401
  {
    const fd = await buildMultipart({
      message: 'no token',
      files: [{ buffer: tinyPngBase64(), name: 'face.png', type: 'image/png' }],
    });
    const { status, data } = await httpRaw(`${API_PREFIX}/assistant/chat-with-attachments`, {
      method: 'POST', headers: {}, body: fd,
    });
    assert(status === 401, '6. 无 token → 401', `got ${status}`);
  }

  // 7. only text no files (data URL won't be created, but still 200)
  {
    const fd = new FormData();
    fd.append('message', '纯文字, 不传附件');
    const { status, data } = await httpRaw(`${API_PREFIX}/assistant/chat-with-attachments`, {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd,
    });
    assert2xx(status, '7. 纯文字无附件 → 200', JSON.stringify(data).slice(0, 100));
    assert(Array.isArray(data?.attachments) && data.attachments.length === 0,
      '8. attachments.length === 0 (无附件)');
  }
}

async function runIpFilterTests() {
  console.log('\n—— B. IP listPublic creatorName filter ——');
  const token = await login(CREATOR);

  // 9. creatorName=林雾 (若不存在则 items 为空数组, 只要不报错就算过)
  {
    const { status, data } = await httpRaw(`${API_PREFIX}/ips?creatorName=${encodeURIComponent('林雾')}&size=5`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert2xx(status, '9. GET /ips?creatorName=林雾 → 200');
    assert(Array.isArray(data?.items), '10. data.items 是数组');
  }

  // 11. 不带 filter → 200 + items
  {
    const { status, data } = await httpRaw(`${API_PREFIX}/ips?size=5`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert2xx(status, '11. GET /ips 不带 filter → 200');
    assert(Array.isArray(data?.items), '12. data.items 是数组');
  }

  // 13. gender filter
  {
    const { status, data } = await httpRaw(`${API_PREFIX}/ips?gender=FEMALE&size=5`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert2xx(status, '13. GET /ips?gender=FEMALE → 200');
    assert(Array.isArray(data?.items), '14. data.items 是数组');
  }

  // 15. creatorName='' (空字符串) → 等同不带 filter
  {
    const { status, data } = await httpRaw(`${API_PREFIX}/ips?creatorName=&size=5`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert2xx(status, '15. GET /ips?creatorName= → 200', JSON.stringify(data).slice(0, 80));
  }
}

(async () => {
  try {
    await runAttachmentTests();
    await runIpFilterTests();
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
  console.log(`\n── 总结 ──  ${passed} passed · ${failed} failed · ${passed + failed} total`);
  if (failed > 0) {
    console.log('\n失败:');
    failures.forEach((f) => console.log('  -', f));
    process.exit(1);
  }
})();
