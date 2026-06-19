import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth';

// 空字符串保留 — 部署用相对路径 /api/v1 (nginx 反代);localhost fallback 只用于本地 dev
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  timeout: 30_000,
  withCredentials: false,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = useAuthStore();
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (resp) => resp,
  async (error: AxiosError) => {
    const auth = useAuthStore();
    if (error.response?.status === 401 && auth.refreshToken && !error.config?.url?.includes('/auth/')) {
      try {
        await auth.refresh();
        if (error.config) {
          error.config.headers.Authorization = `Bearer ${auth.accessToken}`;
          return apiClient.request(error.config);
        }
      } catch {
        auth.clear();
      }
    }
    return Promise.reject(error);
  },
);

export const publicOssBase = import.meta.env.VITE_OSS_PUBLIC_BASE || '';

// OSS URL 拼接 — 默认相对路径,经 nginx /ips/ 反代到 OSS bucket
// (避免 HTTPS 资源在 HTTP 页面被浏览器当 mixed content 拦截)
// 设 VITE_OSS_PUBLIC_BASE 为完整 URL (https://...) 时回退到绝对 URL, 用于未配反代的场景
export function ossUrl(key?: string): string {
  if (!key) return '';
  if (key.startsWith('http')) return key;
  if (publicOssBase.startsWith('http')) return `${publicOssBase}/${key}`;
  // publicOssBase 为空或为路径前缀 (/oss), 都拼成相对路径 — 跟随当前 origin + protocol
  return `/${key.replace(/^\/+/, '')}`;
}

export function formatFen(fen: number | string): string {
  const n = typeof fen === 'string' ? parseInt(fen, 10) : fen;
  return `¥${(n / 100).toFixed(2)}`;
}