import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth';

// 空字符串保留 — 部署用相对路径 /api/v1 (nginx 反代)
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
export const publicOssBase = import.meta.env.VITE_OSS_PUBLIC_BASE || '';

export function ossUrl(key?: string): string {
  if (!key) return '';
  if (key.startsWith('http')) return key;
  return `${publicOssBase}/${key}`;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  timeout: 30_000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = useAuthStore();
  if (auth.accessToken) config.headers.Authorization = `Bearer ${auth.accessToken}`;
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
