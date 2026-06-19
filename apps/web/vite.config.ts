import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          // dev proxy target — production builds inline API_BASE (相对路径);本项目 Nest 跑 3100
          target: env.VITE_API_BASE_URL || 'http://localhost:3100',
          changeOrigin: true,
        },
        // dev: /ips/ → 阿里云 OSS 公共 bucket (prod 由 nginx 反代, 不需此 proxy)
        '/ips/': {
          target: 'https://ibi-public.oss-cn-shanghai.aliyuncs.com',
          changeOrigin: true,
          secure: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'es2020',
    },
  };
});