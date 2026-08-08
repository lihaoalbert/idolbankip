import { defineStore } from 'pinia';
import { apiClient } from '@/api/client';

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface State {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  lastFetchedAt: number;
}

const POLL_INTERVAL_MS = 30_000;

export const useNotificationsStore = defineStore('notifications', {
  state: (): State => ({
    items: [],
    unreadCount: 0,
    loading: false,
    lastFetchedAt: 0,
  }),
  actions: {
    async fetch(limit = 30) {
      this.loading = true;
      try {
        const res = await apiClient.get('/notifications', { params: { limit } });
        this.items = res.data.items;
        this.unreadCount = res.data.unreadCount;
        this.lastFetchedAt = Date.now();
      } catch (e) {
        // 静默 — polling 失败不影响主流程
        console.warn('[notifications] fetch failed:', e);
      } finally {
        this.loading = false;
      }
    },
    async fetchUnreadCount() {
      try {
        const res = await apiClient.get('/notifications/unread-count');
        this.unreadCount = res.data.count;
      } catch {
        // ignore
      }
    },
    async markRead(id: string) {
      // 乐观更新
      const before = this.unreadCount;
      const target = this.items.find(n => n.id === id);
      if (target && !target.readAt) {
        target.readAt = new Date().toISOString();
        this.unreadCount = Math.max(0, this.unreadCount - 1);
      }
      try {
        await apiClient.patch(`/notifications/${id}/read`);
      } catch {
        // 回滚
        if (target && !target.readAt) {
          target.readAt = null;
          this.unreadCount = before;
        }
      }
    },
    async markAllRead() {
      const unreadItems = this.items.filter(n => !n.readAt);
      const before = this.unreadCount;
      // 乐观更新
      for (const n of this.items) n.readAt = n.readAt || new Date().toISOString();
      this.unreadCount = 0;
      try {
        const res = await apiClient.post('/notifications/mark-all-read');
        this.unreadCount = Math.max(0, (res.data.count ?? 0) === 0 ? 0 : 0);
      } catch {
        // 回滚
        for (const n of unreadItems) n.readAt = null;
        this.unreadCount = before;
      }
    },
    startPolling() {
      this.fetch();
      const t = setInterval(() => this.fetchUnreadCount(), POLL_INTERVAL_MS);
      return () => clearInterval(t);
    },
  },
});
