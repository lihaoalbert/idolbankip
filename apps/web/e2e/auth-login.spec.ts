// 多通道登录端到端 — Playwright e2e (W3 W1 D6)
//
// 覆盖:
//   1. LoginPage 3 Tab 切换 (邮箱/手机/微信) 视觉
//   2. 手机验证码 Tab:填号 → 发码 → 倒计时启动 (send-code API 打通)
//   3. 手机验证码 Tab 完整登录:发码 → 查库拿真码 → 填码 → 入馆 (新用户 needRegister → RegisterPage)
//   4. 微信 Tab:二维码渲染 + MOCK 扫码 → 跳 /auth/bind-phone
//   5. BindPhonePage:表单渲染 + 补手机号 → bind 完成入馆
//
// 跑法(需要 API + Web 起):
//   # Terminal 1: api (mock driver)
//   SMS_DRIVER=mock WECHAT_OAUTH_DRIVER=mock pnpm --filter @ibi-ren/api run start:dev
//   # Terminal 2: web preview 端口 8080
//   #   注意: preview 不带 dev proxy, dist 必须内联绝对 API base 才能直连后端
//   VITE_API_BASE_URL=http://localhost:3000 pnpm --filter @ibi-ren/web run build
//   pnpm --filter @ibi-ren/web exec vite preview --port 8080 --host 0.0.0.0
//   # Terminal 3: e2e
//   pnpm --filter @ibi-ren/web exec playwright test e2e/auth-login.spec.ts --reporter=list
//
// 说明: 手机验证码 mock 模式不打日志, 必须查 DB 拿 code。
//   与 scripts/smoke-auth.sh 同法: spawn node + @prisma/client (cd apps/api)。

import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API_DIR = resolve(HERE, '../../api');

// 从本机 MySQL 拿手机号最新验证码 (cd apps/api 才能 require('@prisma/client'))
function getPhoneCode(phone: string): string {
  let databaseUrl = '';
  const envPath = resolve(API_DIR, '.env');
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='));
    if (line) databaseUrl = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
  }
  const script = `
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.phoneVerifyCode.findFirst({ where: { phone: '${phone}' }, orderBy: { createdAt: 'desc' } })
  .then((r) => { process.stdout.write(r?.code || ''); return p.$disconnect(); })
  .catch(() => { process.stdout.write(''); });
`;
  try {
    const out = execFileSync('node', ['-e', script], {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: databaseUrl || process.env.DATABASE_URL || '' },
      encoding: 'utf8',
    });
    return out.trim();
  } catch {
    return '';
  }
}

// best-effort 清理 test user (绕过 FK, smoke 专用)
function cleanupUser(phone: string): void {
  let databaseUrl = '';
  const envPath = resolve(API_DIR, '.env');
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='));
    if (line) databaseUrl = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
  }
  const script = `
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  await p.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  const u = await p.user.findFirst({ where: { phone: '${phone}' } });
  if (u) await p.$executeRawUnsafe('DELETE FROM User WHERE id = ?', u.id);
  await p.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  await p.$executeRawUnsafe("UPDATE User SET wechatOpenId = NULL WHERE wechatOpenId = 'mock_openid_001'");
  await p.phoneVerifyCode.deleteMany({ where: { phone: '${phone}' } });
  await p.wechatOAuthState.deleteMany({});
  await p.$disconnect();
})().catch(() => {});
`;
  try {
    execFileSync('node', ['-e', script], {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: databaseUrl || process.env.DATABASE_URL || '' },
      encoding: 'utf8',
    });
  } catch {
    /* best-effort */
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// e2e 专用手机号, 与 smoke-auth 的 999x 号段错开, 避免并行污染
const E2E_PHONE = '13800007771';
const E2E_WECHAT_PHONE = '13800007772';

test.describe('多通道登录 (email / phone / wechat)', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('3 Tab 切换:邮箱 / 手机 / 微信 视觉', async ({ page }) => {
    await page.goto('/login');
    // 3 个 tab 都在
    await expect(page.getByTestId('login-tab-email')).toBeVisible();
    await expect(page.getByTestId('login-tab-phone')).toBeVisible();
    await expect(page.getByTestId('login-tab-wechat')).toBeVisible();

    // 默认邮箱 tab: 有 email input
    await expect(page.locator('input[type="email"]')).toBeVisible();

    // 切手机 tab
    await page.getByTestId('login-tab-phone').click();
    await expect(page.getByTestId('login-phone-input')).toBeVisible();
    await expect(page.getByTestId('login-phone-send-code')).toBeVisible();

    // 切微信 tab: 生成二维码 (mock 模式也返 url)
    await page.getByTestId('login-tab-wechat').click();
    await expect(page.getByTestId('wechat-qr-img')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('wechat-mock-scan')).toBeVisible();
  });

  test('手机 Tab:填号 → 发码 → 按钮进入倒计时', async ({ page }) => {
    cleanupUser(E2E_PHONE);
    await page.goto('/login');
    await page.getByTestId('login-tab-phone').click();

    const phoneInput = page.getByTestId('login-phone-input');
    await phoneInput.fill(E2E_PHONE);

    const sendBtn = page.getByTestId('login-phone-send-code');
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // 发码成功 → 按钮文案变 "60s 后重发" (countdown 启动)
    await expect(sendBtn).toContainText(/\d+s 后重发/, { timeout: 8_000 });
    await expect(sendBtn).toBeDisabled();
  });

  test('手机 Tab 完整登录:新用户 → needRegister → RegisterPage 预填', async ({ page }) => {
    cleanupUser(E2E_PHONE);
    await page.goto('/login');
    await page.getByTestId('login-tab-phone').click();
    await page.getByTestId('login-phone-input').fill(E2E_PHONE);
    await page.getByTestId('login-phone-send-code').click();
    await expect(page.getByTestId('login-phone-send-code')).toContainText(/\d+s 后重发/, { timeout: 8_000 });

    // 查库拿真码
    await sleep(500);
    const code = getPhoneCode(E2E_PHONE);
    expect(code, '应从 DB 拿到验证码').toMatch(/^\d{4,8}$/);

    await page.getByTestId('login-phone-code-input').fill(code);
    // 点入馆 (submit)
    await page.getByRole('button', { name: /入馆/ }).click();

    // 新用户 → 后端返 needRegister → 前端应跳 RegisterPage (phone tab 预填)
    await expect(page).toHaveURL(/\/register/, { timeout: 8_000 });
    // RegisterPage 手机号已预填
    const regPhone = page.getByTestId('register-phone-input');
    await expect(regPhone).toHaveValue(E2E_PHONE, { timeout: 5_000 });

    cleanupUser(E2E_PHONE);
  });

  test('微信 Tab:MOCK 扫码 → 跳 /auth/bind-phone → 补手机号入馆', async ({ page }) => {
    cleanupUser(E2E_WECHAT_PHONE);
    await page.goto('/login');
    await page.getByTestId('login-tab-wechat').click();
    await expect(page.getByTestId('wechat-qr-img')).toBeVisible({ timeout: 10_000 });

    // MOCK 扫码 → 新用户走 needBindPhone → 跳 bind-phone
    await page.getByTestId('wechat-mock-scan').click();
    await expect(page).toHaveURL(/\/auth\/bind-phone/, { timeout: 8_000 });

    // BindPhonePage 表单渲染
    await expect(page.getByTestId('bindphone-phone-input')).toBeVisible();
    await expect(page.getByTestId('bindphone-code-input')).toBeVisible();
    await expect(page.getByTestId('bindphone-displayname')).toBeVisible();

    // 填手机号 + 发码
    await page.getByTestId('bindphone-phone-input').fill(E2E_WECHAT_PHONE);
    await page.getByTestId('bindphone-send-code').click();
    await sleep(600);
    const code = getPhoneCode(E2E_WECHAT_PHONE);
    expect(code, '应从 DB 拿到 bind 验证码').toMatch(/^\d{4,8}$/);
    await page.getByTestId('bindphone-code-input').fill(code);
    await page.getByTestId('bindphone-displayname').fill('e2e 微信用户');

    // 提交绑定 → 创建 user + 绑 openid → 入馆 (BUYER 默认跳首页)
    await page.getByRole('button', { name: /绑定并入馆/ }).click();
    await expect(page).toHaveURL(/\/($|creator)/, { timeout: 10_000 });

    // localStorage 应写入 auth
    const hasAuth = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('ibi.auth');
        if (!raw) return false;
        const p = JSON.parse(raw);
        return !!p.accessToken && !!p.user;
      } catch { return false; }
    });
    expect(hasAuth).toBeTruthy();

    cleanupUser(E2E_WECHAT_PHONE);
  });
});
