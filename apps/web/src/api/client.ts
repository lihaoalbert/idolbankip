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

// ===================== 荣誉系统 API =====================

export interface HonorLevelInfo {
  level: number;
  minPoints: number;
  title: string;
  icon: string;
  colorHex: string;
}

export interface HonorStreak {
  current: number;
  longest: number;
  totalDays: number;
}

export interface HonorMe {
  totalPoints: number;
  level: HonorLevelInfo;
  streak: HonorStreak;
  badgesEarned: number;
  ipsCreated: number;
  recentLedger: Array<{
    id: string;
    action: string;
    delta: number;
    reason: string;
    createdAt: string;
  }>;
  nextLevel: HonorLevelInfo | null;
}

export interface HonorBadge {
  code: string;
  name: string;
  desc: string;
  icon: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  grantedAt?: string;
}

export interface HonorLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  periodPoints: number;
  level: HonorLevelInfo;
  streak: number;
}

export interface UserProfileData {
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    createdAt: string;
  };
  honor: {
    totalPoints: number;
    level: HonorLevelInfo;
    streak: HonorStreak;
  };
  stats: {
    ipCount: number;
    totalViews: number;
    totalFavorites: number;
  };
  badges: HonorBadge[];
  ips: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    priceFen: number;
    viewCount: number;
    favoriteCount: number;
    thumbUrl: string | null;
    styleTags: string;
    createdAt: string;
  }>;
}

/** 当前用户的荣誉面板 */
export async function getHonorMe(): Promise<HonorMe> {
  const r = await apiClient.get<HonorMe>('/honor/me');
  return r.data;
}

/** 公开排行榜 */
export async function getHonorLeaderboard(
  period: 'week' | 'month' | 'all' = 'all',
  limit = 50,
): Promise<HonorLeaderboardEntry[]> {
  const r = await apiClient.get<HonorLeaderboardEntry[]>('/honor/leaderboard', {
    params: { period, limit },
  });
  return r.data;
}

/** 公开个人主页 */
export async function getUserProfile(userId: string): Promise<UserProfileData> {
  const r = await apiClient.get<UserProfileData>(`/users/${userId}/profile`);
  return r.data;
}

/** 公开 — 用户已获徽章 */
export async function getUserBadges(userId: string): Promise<HonorBadge[]> {
  const r = await apiClient.get<HonorBadge[]>(`/users/${userId}/badges`);
  return r.data;
}