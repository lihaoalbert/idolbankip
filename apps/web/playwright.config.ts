// Playwright e2e 配置 — 用系统 Google Chrome(避免下载 chromium 200MB)
// R8:覆盖 Blueprint Wizard 8 步流程 + reload 草稿恢复 + evaluate
//
// 跑法:
//   pnpm --filter @ibi-ren/web exec playwright test --reporter=list
//
// 依赖:
//   - 系统装了 Google Chrome(项目 macOS 默认有)
//   - 前端服务在 http://localhost:8080(本地 vite preview)
//   - 后端服务在 http://localhost:3000(本地 api)
//
// CI 集成留 Phase C — 当前只跑本地 smoke

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // 串行:避免污染后端状态
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    channel: 'chrome', // 用系统 Chrome,不下载 chromium
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off', // 关闭视频(避免要求 ffmpeg 二进制)
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});