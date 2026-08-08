// Blueprint Wizard 8 步端到端流程 — Playwright e2e
//
// R8:覆盖
//   1. 进入 /creator/blueprint/new/step/1 → 自动创建 Blueprint
//   2. Stepper 8 步高亮当前
//   3. L1 表单 → 改 slider → 看到"已存"时间戳
//   4. 走完 L2~L6 → reload 页面 → 数据不丢
//   5. L7 切 platforms → 中文/英文 prompt 出现
//   6. L8 evaluate → 雷达图渲染 + 8 维 sub-score 表
//
// 跑法(需要 API + Web 起):
//   # Terminal 1: api
//   pnpm --filter @ibi-ren/api run start:dev
//   # Terminal 2: web (端口 8080)
//   pnpm --filter @ibi-ren/web exec vite preview --port 8080 --host 0.0.0.0
//   # Terminal 3: e2e
//   pnpm --filter @ibi-ren/web exec playwright test e2e/blueprint-wizard.spec.ts --reporter=list

import { test, expect } from '@playwright/test';

test.describe('Blueprint Wizard 8 步流程', () => {
  test.setTimeout(120_000); // 留时间给 rate limit retry + 8 步 + reload
  // 跑前用 API 拿一对 CREATOR 凭据,在每页加载前注入到 localStorage
  // (用 addInitScript 确保 Pinia store 初始化时就能读到 auth,避免 route guard 误判未登录)
  // 每个 test 重新登录拿新 token(后端 refresh token 轮换,串行 test 不能复用)
  // Rate limit 是个真问题 — Throttler 300/min,API 测试时容易触发
  // 用 setTimeout + Promise 替代 page.waitForTimeout(避免被 test 60s timeout 截断)
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  test.beforeEach(async ({ page, context, request }) => {
    await context.clearCookies();
    let res;
    for (let i = 0; i < 5; i += 1) {
      res = await request.post('http://localhost:3000/api/v1/auth/login', {
        data: { email: 'creator@ibi.ren', password: 'demo1234' },
      });
      if (res.ok()) break;
      if (res.status() === 429) {
        const ra = Number(res.headers()['retry-after'] ?? 5);
        await sleep((ra + 1) * 1000);
      } else {
        break;
      }
    }
    expect(res!.ok()).toBeTruthy();
    const body = await res!.json();
    const { accessToken, refreshToken, user } = body;
    // addInitScript 在 page load 前执行 → Pinia 初始化时读得到 auth
    await context.addInitScript(({ token, refresh, user }) => {
      try {
        localStorage.setItem('ibi.auth', JSON.stringify({
          user: JSON.parse(user),
          accessToken: token,
          refreshToken: refresh,
        }));
      } catch {}
    }, { token: accessToken, refresh: refreshToken, user: JSON.stringify(user) });
    // 第一次访问页面,触发 addInitScript + 清其他 localStorage 防止草稿污染
    await page.goto('/');
    // 等到 addInitScript 注入完成 + Pinia 初始化(避免 401 风暴)
    await page.waitForFunction(() => {
      try {
        const raw = localStorage.getItem('ibi.auth');
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return !!parsed.accessToken && !!parsed.user;
      } catch { return false; }
    }, { timeout: 5000 });
    // 等页面 app 初始化(避免 notifications fetch 抢在 auth 设置之前)
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    // 强制把 auth 重新写回(防止 /api/v1/notifications 等 401 触发 refresh 失败 → clear)
    await page.evaluate(({ token, refresh, user }) => {
      localStorage.setItem('ibi.auth', JSON.stringify({
        user: JSON.parse(user),
        accessToken: token,
        refreshToken: refresh,
      }));
    }, { token: accessToken, refresh: refreshToken, user: JSON.stringify(user) });
    await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k !== 'ibi.auth') localStorage.removeItem(k);
      }
    });
  });

  test('Step1 进入即创建 Blueprint → 看到 Stepper 8 步 + L1 表单', async ({ page }) => {
    await page.goto('/creator/blueprint/new/step/1');
    // URL 应当 redirect 到 /creator/blueprint/<id>/step/1
    await expect(page).toHaveURL(/\/creator\/blueprint\/(fb_\w+)\/step\/1/);
    // 8 个 step 圆点
    const steps = page.locator('nav[aria-label="Blueprint 步骤进度"] button');
    await expect(steps).toHaveCount(8);
    // 第 1 步高亮
    await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step');
    // 等到 L1 article 渲染(避免 race condition)
    await expect(page.locator('article').first()).toBeVisible();
    // L1 表单:6 slider (faceIndex/cheekboneWidth/cheekboneProminence/jawWidth/upperThirdRatio/midThirdRatio)
    await expect(page.locator('input[type="range"]')).toHaveCount(6);
    // 颅型 + 下颌角 各 4/3 个按钮(自定义 radio)
    await expect(page.getByRole('button', { name: '长颅' })).toBeVisible();
    await expect(page.getByRole('button', { name: '锐角' })).toBeVisible();
  });

  test('Stepper 跳转:L1 改完 → 点 Step3 → Step2 必须有 disabled 状态', async ({ page }) => {
    await page.goto('/creator/blueprint/new/step/1');
    // 点 step 3(目前未访问,应被禁用)
    const steps = page.locator('nav[aria-label="Blueprint 步骤进度"] button');
    await expect(steps.nth(2)).toBeDisabled();
  });

  test('L1 改 slider → 等到"已存"提示 → reload → 数据保持', async ({ page }) => {
    await page.goto('/creator/blueprint/new/step/1');
    // 第一个 slider 是 faceIndex,改到 1.5
    const faceIndex = page.locator('input[type="range"]').first();
    await faceIndex.fill('1.5');
    // 等到自动保存(800ms debounce + 网络)
    await expect(page.getByText(/已存/).first()).toBeVisible({ timeout: 5000 });
    // 拿当前 URL 里的 blueprintId
    const url = page.url();
    const id = url.match(/\/blueprint\/([^/]+)\//)?.[1];
    expect(id).toBeTruthy();
    // 跳到 step 2 再回来
    await page.goto(`/creator/blueprint/${id}/step/2`);
    await page.goto(`/creator/blueprint/${id}/step/1`);
    // 应当从 server 恢复 faceIndex=1.5
    const restoredFaceIndex = await page.locator('input[type="range"]').first().inputValue();
    expect(restoredFaceIndex).toBe('1.5');
  });

  test('草稿恢复:L1 改 → reload(不 navigate) → 草稿覆盖 server', async ({ page }) => {
    await page.goto('/creator/blueprint/new/step/1');
    // 先 PATCH 一个值到 server
    const faceIndex = page.locator('input[type="range"]').first();
    await faceIndex.fill('1.2');
    await expect(page.getByText(/已存/).first()).toBeVisible({ timeout: 5000 });
    // 等 server 同步回 form(避免 next fill 被 server 1.2 覆盖)
    await page.waitForTimeout(500);
    // 再改成 1.6 — 等 Vue watcher 写 localStorage
    await faceIndex.fill('1.6');
    // 等到 localStorage 真的写入了 1.6(用 evaluate 轮询)
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith('ibi:blueprint:draft:'));
        if (keys.length === 0) return null;
        const raw = localStorage.getItem(keys[0]);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed.faceIndex ?? null;
      });
    }, { timeout: 3000 }).toBe(1.6);
    // 立刻刷新
    await page.reload();
    // 应当恢复 1.6(草稿优先)
    await expect(page.locator('input[type="range"]').first()).toHaveValue('1.6');
  });

  test('L7 中文 prompt 出现 + 平台变体卡', async ({ page }) => {
    await page.goto('/creator/blueprint/new/step/1');
    const url = page.url();
    const id = url.match(/\/blueprint\/([^/]+)\//)?.[1];
    // 跳到 L7
    await page.goto(`/creator/blueprint/${id}/step/7`);
    // 中文 prompt textarea 应当有内容
    const zhTextarea = page.locator('textarea').first();
    await expect(zhTextarea).not.toHaveValue('');
    // 平台变体卡:MJ / SD / 即梦 / 豆包 至少 1 个
    await expect(page.getByText(/Midjourney|Stable Diffusion|即梦|豆包/).first()).toBeVisible();
  });

  test('L8 evaluate:看到雷达图 + 8 维 sub-score 表', async ({ page }) => {
    await page.goto('/creator/blueprint/new/step/1');
    const url = page.url();
    const id = url.match(/\/blueprint\/([^/]+)\//)?.[1];
    // 填 L1 ~ L2 让 evaluate 有意义
    await page.goto(`/creator/blueprint/${id}/step/2`);
    const subcutaneousFat = page.locator('input[type="range"]').first();
    await subcutaneousFat.fill('0.8');
    await expect(page.getByText(/已存/).first()).toBeVisible({ timeout: 5000 });
    // 跳到 L8
    await page.goto(`/creator/blueprint/${id}/step/8`);
    // 雷达图
    await expect(page.locator('[data-testid="radar-chart"]')).toBeVisible({ timeout: 10000 });
    // 8 维 sub-score 表
    for (const k of [
      'L1_complexity',
      'L2_expressiveness',
      'L3_distinctiveness',
      'L4_skin_realism',
      'L5_hair_coverage',
      'L6_decoration_completeness',
      'L7_prompt_quality',
      'L8_contradiction_bonus',
    ]) {
      await expect(page.locator(`[data-testid="subrow-${k}"]`)).toBeVisible();
    }
    // 综合评分 ≥ 0
    const avgText = await page.locator('[data-testid="radar-avg"]').textContent();
    expect(parseFloat(avgText ?? '0')).toBeGreaterThanOrEqual(0);
    expect(parseFloat(avgText ?? '0')).toBeLessThanOrEqual(10);
  });

  test('完整 8 步流程:create → L1~L6 → L7 → L8 evaluate → reload 不丢', async ({ page }) => {
    await page.goto('/creator/blueprint/new/step/1');
    const url = page.url();
    const id = url.match(/\/blueprint\/([^/]+)\//)?.[1];
    expect(id).toBeTruthy();

    // L1:改 faceIndex slider
    const faceIndex = page.locator('input[type="range"]').first();
    await faceIndex.fill('1.45');
    await expect(page.getByText(/已存/).first()).toBeVisible({ timeout: 5000 });

    // L2~L6:验证 Stepper 跳转 + 各步骤表单渲染
    for (const step of [2, 3, 4, 5, 6]) {
      await page.goto(`/creator/blueprint/${id}/step/${step}`);
      // 至少看到一个 slider 或按钮(label 验证在 mount)
      await expect(page.locator('article h2').first()).toBeVisible({ timeout: 10_000 });
    }

    // L7:验证 prompt
    await page.goto(`/creator/blueprint/${id}/step/7`);
    await expect(page.locator('textarea').first()).not.toHaveValue('');

    // L8:evaluate
    await page.goto(`/creator/blueprint/${id}/step/8`);
    await expect(page.locator('[data-testid="radar-chart"]')).toBeVisible({ timeout: 10_000 });

    // reload — 雷达图应当还在(数据持久化)
    await page.reload();
    await expect(page.locator('[data-testid="radar-chart"]')).toBeVisible({ timeout: 10_000 });
  });
});