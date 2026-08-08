/**
 * useHonor — 荣誉系统 composable
 *
 * 统一缓存 (sessionStorage 5min) + 错误兜底 (失败用空数据,不阻塞 UI)
 * 跨页面复用, 避免每个组件各自 fetch
 */
import { ref } from 'vue';
import {
  getHonorMe,
  getHonorLeaderboard,
  getUserProfile,
  getUserBadges,
  type HonorMe,
  type HonorLeaderboardEntry,
  type UserProfileData,
  type HonorBadge,
} from '@/api/client';

const CACHE_TTL_MS = 5 * 60_000;
const memCache = new Map<string, { at: number; data: unknown }>();

function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.data as T);
  return loader().then((data) => {
    memCache.set(key, { at: Date.now(), data });
    return data;
  });
}

export function useHonor() {
  const me = ref<HonorMe | null>(null);
  const meLoading = ref(false);

  async function loadMe(force = false) {
    if (!force && me.value) return me.value;
    meLoading.value = true;
    try {
      me.value = await cached<HonorMe>('honor:me', () => getHonorMe());
      return me.value;
    } catch (e) {
      console.warn('loadMe failed', e);
      return null;
    } finally {
      meLoading.value = false;
    }
  }

  async function loadLeaderboard(period: 'week' | 'month' | 'all' = 'all', limit = 50) {
    return cached<HonorLeaderboardEntry[]>(`honor:lb:${period}:${limit}`, () =>
      getHonorLeaderboard(period, limit),
    );
  }

  async function loadProfile(userId: string, force = false) {
    const key = `honor:profile:${userId}`;
    if (!force && memCache.has(key)) return memCache.get(key)!.data as UserProfileData;
    return cached<UserProfileData>(key, () => getUserProfile(userId));
  }

  async function loadBadges(userId: string) {
    return cached<HonorBadge[]>(`honor:badges:${userId}`, () => getUserBadges(userId));
  }

  function invalidate(prefix?: string) {
    if (!prefix) {
      memCache.clear();
      return;
    }
    for (const k of memCache.keys()) {
      if (k.startsWith(prefix)) memCache.delete(k);
    }
  }

  return { me, meLoading, loadMe, loadLeaderboard, loadProfile, loadBadges, invalidate };
}