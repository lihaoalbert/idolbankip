// vitest config — 仅 web 单测,不开浏览器
// Phase 1: 跑 zod 序列化 + composable 单元测试
// Phase 2 起: 加 jsdom 跑 Vue 组件测试

import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['test/**/*.spec.ts'],
  },
});