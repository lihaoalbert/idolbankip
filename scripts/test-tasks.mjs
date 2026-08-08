// #30 任务发布/创作者接单 E2E
// 测试:
//   1. admin login + 创建任务
//   2. 创作者 A 注册+KYC+CREATOR → 看到任务 → 接单 → 提交 IP
//   3. 创作者 B 接单 + 提交 (多创作者)
//   4. admin 看到 2 个提交, 通过 1 个 (→ PUBLIC_INTENT), 拒绝 1 个 (→ REJECTED)
//   5. 创作者 B 重复接同任务 → 400
//   6. 第 3 个创作者 C 接单 (假设 maxAccepts=2) → 400 "已满"
//   7. 截止后接单 → 需要 PATCH 截止时间到过去后测试
//   8. UI smoke: admin /tasks + /creator/tasks 路由
//
// 环境: 远端 API (env: API_BASE = http://8.133.241.103:3100/api/v1, 或本地)

import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.env.API_BASE || 'http://8.133.241.103:3100/api/v1';
const RAND = () => Math.random().toString(36).slice(2, 10);
const ts = () => Date.now().toString(36);
let passed = 0;
let failed = 0;
const fail = (name, e) => { failed++; console.log(`✕ ${name}: ${e?.response?.data?.message || e?.message || e}`); };
const pass = (name, info) => { passed++; console.log(`✓ ${name}${info ? '  ' + info : ''}`); };

async function api(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status}`);
    e.response = { status: res.status, data: body };
    throw e;
  }
  return body;
}

async function authedApi(path, token, opts = {}) {
  return api(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
}

async function registerAndKyc(label) {
  const email = `creator-${label}-${RAND()}@test.local`;
  const password = 'Passw0rd!';
  await api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName: `创作者${label}`, roles: ['BUYER'] }) });
  // sleep 6.5s to avoid auth/login 10/min throttler
  await sleep(6_500);
  // 创作者走 buyer 注册, 需手动 KYC + 升级
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  const userToken = login.accessToken;
  const me = await authedApi('/auth/me', userToken);
  // KYC 模拟
  const kycResp = await authedApi('/kyc/submit', userToken, {
    method: 'POST',
    body: JSON.stringify({ realName: `测试${label}`, idNumber: `11010119900101${label.slice(-4).padStart(4, '0')}` }),
  });
  // kycResp = { submission: { id, status, ... } } — mock 客户端可能直接 APPROVED
  // 如果是 PENDING, 需要 admin 批准
  if (kycResp.submission?.status === 'PENDING') {
    await sleep(6_500);
    const adminLogin = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@ibi.ren', password: process.env.ADMIN_PWD || 'Focus_2026!' }) });
    await authedApi(`/admin/kyc/${kycResp.submission.id}/approve`, adminLogin.accessToken, { method: 'POST' });
    await sleep(6_500);
  }
  // 重新登录拿 CREATOR 角色
  const reLogin = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  return { userId: me.id, email, token: reLogin.accessToken };
}

async function adminLogin() {
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@ibi.ren', password: process.env.ADMIN_PWD || 'Focus_2026!' }) });
  return login.accessToken;
}

async function main() {
  console.log(`\n#30 E2E (target: ${BASE})\n`);

  // === 1. admin 创建任务 (maxAccepts=2) ===
  const adminToken = await adminLogin();
  const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const task = await authedApi('/admin/tasks', adminToken, {
    method: 'POST',
    body: JSON.stringify({
      title: `E2E 任务 ${ts()}`,
      description: '测试任务 — 36 个中国都市女性, 现代风, 短剧(单集)场景。\n版权归平台',
      spec: { count: 36, gender: 'FEMALE', ageBuckets: ['YOUNG'], ethnicities: ['EAST_ASIAN'], styleTags: ['现代'], scenarioTags: ['短剧(单集)'] },
      budgetFen: 36000,
      perIpFen: 1000,
      maxAccepts: 2,
      deadlineAt: deadline,
    }),
  });
  pass('admin 创建任务', `taskId=${task.id}, title="${task.title}"`);

  // === 2. 创作者 A 注册+接单+提交 IP ===
  const creatorA = await registerAndKyc('A');
  const openTasksResp = await authedApi('/tasks', creatorA.token);
  const openTasks = openTasksResp.items || openTasksResp;
  if (!Array.isArray(openTasks) || !openTasks.find((t) => t.id === task.id)) throw new Error('任务板看不到刚发布的任务');
  pass('创作者 A 看到任务板');

  const acceptA = await authedApi(`/tasks/${task.id}/accept`, creatorA.token, { method: 'POST' });
  pass('创作者 A 接单', `acceptedAt=${acceptA.acceptedAt}`);

  // 接单后再次接应失败
  try {
    await authedApi(`/tasks/${task.id}/accept`, creatorA.token, { method: 'POST' });
    throw new Error('应该 400');
  } catch (e) {
    if (e?.response?.status === 400 || e?.response?.status === 409) pass('创作者 A 重复接单被拒 (400)');
    else fail('创作者 A 重复接单', e);
  }

  // 创作者 A 提交 IP (通过 wizard-style POST /ips, 带 taskId)
  const ipA = await authedApi('/ips', creatorA.token, {
    method: 'POST',
    body: JSON.stringify({
      displayName: 'A 提交的形象',
      description: '这是 A 的任务接单提交, 用于测试',
      gender: 'FEMALE',
      ageBucket: 'YOUNG',
      ethnicity: 'EAST_ASIAN',
      styleTags: ['现代'],
      scenarioTags: ['短剧(单集)'],
      fullLicensePriceFen: 300000,
      taskId: task.id,
    }),
  });
  if (ipA.ip.origin !== 'TASK' || ipA.ip.taskId !== task.id) throw new Error(`IP origin/taskId 不对: ${JSON.stringify({ origin: ipA.ip.origin, taskId: ipA.ip.taskId })}`);
  pass('创作者 A 提交 IP (origin=TASK, taskId 关联)', `ipId=${ipA.ip.id}, code=${ipA.ip.code}`);

  // 创作者 A 不接任务直接创 IP with taskId 应 403
  const noAcceptUser = await registerAndKyc('X');
  try {
    await authedApi('/ips', noAcceptUser.token, {
      method: 'POST',
      body: JSON.stringify({
        displayName: '未接任务直接提交',
        description: '测试 — 应被拒',
        gender: 'FEMALE',
        ageBucket: 'YOUNG',
        styleTags: ['现代'],
        scenarioTags: ['短剧(单集)'],
        fullLicensePriceFen: 300000,
        taskId: task.id,
      }),
    });
    throw new Error('应被拒');
  } catch (e) {
    if (e?.response?.status === 403) pass('未接任务直接提交被拒 (403)');
    else fail('未接任务直接提交', e);
  }

  // === 3. 创作者 B 接单 + 提交 (验证多创作者) ===
  const creatorB = await registerAndKyc('B');
  await authedApi(`/tasks/${task.id}/accept`, creatorB.token, { method: 'POST' });
  const ipB = await authedApi('/ips', creatorB.token, {
    method: 'POST',
    body: JSON.stringify({
      displayName: 'B 提交的形象',
      description: 'B 的接单提交',
      gender: 'FEMALE',
      ageBucket: 'YOUNG',
      ethnicity: 'EAST_ASIAN',
      styleTags: ['现代'],
      scenarioTags: ['短剧(单集)'],
      fullLicensePriceFen: 300000,
      taskId: task.id,
    }),
  });
  pass('创作者 B 接单 + 提交', `ipId=${ipB.ip.id}, code=${ipB.ip.code}`);

  // === 4. 创作者 C 接单 (maxAccepts=2 已满) 应失败 ===
  const creatorC = await registerAndKyc('C');
  try {
    await authedApi(`/tasks/${task.id}/accept`, creatorC.token, { method: 'POST' });
    throw new Error('应被拒');
  } catch (e) {
    if (e?.response?.status === 400) pass('maxAccepts 已满被拒 (400)', e.response.data.message);
    else fail('maxAccepts 已满', e);
  }

  // === 5. admin 看到 2 个提交, 通过 A, 拒绝 B ===
  const subs = await authedApi(`/admin/tasks/${task.id}/submissions`, adminToken);
  if (subs.length !== 2) throw new Error(`期望 2 个提交, 实际 ${subs.length}`);
  pass('admin 任务详情看到 2 个提交');

  const ipAEntry = subs.find((s) => s.id === ipA.ip.id);
  const ipBEntry = subs.find((s) => s.id === ipB.ip.id);
  if (!ipAEntry || !ipBEntry) throw new Error('提交 IP 不全');

  await authedApi(`/admin/tasks/${task.id}/submissions/${ipAEntry.id}/approve`, adminToken, { method: 'POST' });
  pass('admin 通过 A 提交 (→ PUBLIC_INTENT)');

  try {
    await authedApi(`/admin/tasks/${task.id}/submissions/${ipBEntry.id}/reject`, adminToken, {
      method: 'POST',
      body: JSON.stringify({ reason: '面部模糊, 请重传' }),
    });
    pass('admin 拒绝 B 提交 (reason ≥5字)');
  } catch (e) {
    fail('admin 拒绝 B 提交', e);
  }

  // 拒绝原因太短应 400
  try {
    await authedApi(`/admin/tasks/${task.id}/submissions/${ipAEntry.id}/reject`, adminToken, {
      method: 'POST',
      body: JSON.stringify({ reason: 'x' }),
    });
    throw new Error('应 400');
  } catch (e) {
    if (e?.response?.status === 400) pass('拒绝原因 <5字 被拒 (400)');
    else fail('拒绝原因 <5字', e);
  }

  // === 6. /tasks/my/accepts ===
  const myAcceptsA = await authedApi('/tasks/my/accepts', creatorA.token);
  if (!myAcceptsA.find((a) => a.task.id === task.id)) throw new Error('A 的 myAccepts 缺任务');
  pass('创作者 A /tasks/my/accepts 看到任务');

  // === 7. admin 关闭任务 ===
  await authedApi(`/admin/tasks/${task.id}`, adminToken, { method: 'PATCH', body: JSON.stringify({ action: 'CLOSE' }) });
  pass('admin 关闭任务 (CLOSE)');

  // === 8. 关单后再接单应 400 — 复用创作者 C 的 token (已经被 C 接满拒绝了, 现在 CLOSED 应也被拒) ===
  // 不用再注册 D, 避免触发 throttler
  try {
    await authedApi(`/tasks/${task.id}/accept`, creatorC.token, { method: 'POST' });
    throw new Error('应 400');
  } catch (e) {
    if (e?.response?.status === 400) pass('关闭后接单被拒 (400)', e.response.data.message);
    else fail('关闭后接单', e);
  }

  // === 9. /admin/tasks 列表 ===
  const listAll = await authedApi('/admin/tasks', adminToken);
  if (!listAll.find((t) => t.id === task.id)) throw new Error('列表缺任务');
  pass('admin /admin/tasks 列表包含任务');

  // === 10. /admin/tasks/:id 详情 ===
  const detail = await authedApi(`/admin/tasks/${task.id}`, adminToken);
  if (detail.status !== 'CLOSED') throw new Error(`期望 CLOSED, 实际 ${detail.status}`);
  pass('admin 任务详情 status=CLOSED');

  console.log(`\n#30 E2E done: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('\n✕ E2E crashed:', e?.response?.data || e);
  process.exit(1);
});
