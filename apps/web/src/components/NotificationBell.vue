<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useNotificationsStore } from '@/stores/notifications';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const notifs = useNotificationsStore();
const router = useRouter();

const open = ref(false);
let stopPolling: (() => void) | null = null;

const visible = computed(() => auth.isAuthenticated);
const recent = computed(() => notifs.items.slice(0, 8));
const hasUnread = computed(() => notifs.unreadCount > 0);

function toggle() {
  open.value = !open.value;
  if (open.value) notifs.fetch();
}

async function handleClick(id: string, link: string | null) {
  await notifs.markRead(id);
  open.value = false;
  if (link) router.push(link);
}

function viewAll() {
  open.value = false;
  router.push('/notifications');
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

const ICONS: Record<string, string> = {
  KYC_APPROVED: '✓',
  KYC_REJECTED: '✗',
  IP_PUBLIC: '◎',
  IP_REJECTED: '✗',
  IP_REGISTERED: '★',
  CERT_APPROVED: '✓',
  CERT_REJECTED: '✗',
  // #30.6.26 著作权代申请 5 种状态
  COPYRIGHT_REG_DRAFT: '✎',
  COPYRIGHT_REG_SUBMITTED: '↗',
  COPYRIGHT_REG_ACCEPTED: '✓',
  COPYRIGHT_REG_CERTIFIED: '★',
  COPYRIGHT_REG_REJECTED: '✗',
  // #30.7.1 W2 #29 推送通知 — 买家发包 / 加价
  BRIEF_PUBLISHED: '◐',
  BRIEF_BUMPED: '↑',
  // #30.7.1 W2 #31 过期自动 close / 买家手动 close
  BRIEF_EXPIRED: '⏰',
  BRIEF_CLOSED: '×',
};

const ICON_COLOR: Record<string, string> = {
  KYC_APPROVED: 'text-success',
  KYC_REJECTED: 'text-danger',
  IP_PUBLIC: 'text-info',
  IP_REJECTED: 'text-danger',
  IP_REGISTERED: 'text-gold',
  CERT_APPROVED: 'text-success',
  CERT_REJECTED: 'text-danger',
  // #30.6.26
  COPYRIGHT_REG_DRAFT: 'text-ink/60',
  COPYRIGHT_REG_SUBMITTED: 'text-info',
  COPYRIGHT_REG_ACCEPTED: 'text-info',
  COPYRIGHT_REG_CERTIFIED: 'text-gold',
  COPYRIGHT_REG_REJECTED: 'text-danger',
  // #30.7.1 W2 #29
  BRIEF_PUBLISHED: 'text-info',
  BRIEF_BUMPED: 'text-gold',
  // #30.7.1 W2 #31
  BRIEF_EXPIRED: 'text-danger',
  BRIEF_CLOSED: 'text-ink/60',
};

onMounted(() => {
  if (visible.value) stopPolling = notifs.startPolling();
});

onBeforeUnmount(() => {
  stopPolling?.();
});
</script>

<template>
  <div v-if="visible" class="relative">
    <button
      @click="toggle"
      :title="hasUnread ? `${notifs.unreadCount} 条未读通知` : '通知'"
      class="relative w-9 h-9 flex items-center justify-center rounded-full border border-line hover:border-gold hover:bg-cream dark:hover:bg-surface-2 transition"
      aria-label="通知"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-ink/70">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      <span
        v-if="hasUnread"
        class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-cream text-[10px] font-medium flex items-center justify-center"
      >
        {{ notifs.unreadCount > 99 ? '99+' : notifs.unreadCount }}
      </span>
    </button>

    <!-- 下拉 -->
    <div
      v-if="open"
      class="absolute right-0 mt-2 w-80 bg-cream dark:bg-surface border border-line rounded-lg shadow-xl z-50 overflow-hidden"
      @click.stop
    >
      <div class="flex items-center justify-between px-4 py-3 border-b border-line">
        <span class="font-medium text-sm">通知</span>
        <button
          v-if="hasUnread"
          @click="notifs.markAllRead()"
          class="text-xs text-gold hover:underline"
        >
          全部已读
        </button>
      </div>

      <div v-if="notifs.loading && recent.length === 0" class="px-4 py-8 text-center text-xs text-ink/40">
        加载中...
      </div>
      <div v-else-if="recent.length === 0" class="px-4 py-10 text-center text-xs text-ink/40">
        暂无通知
      </div>

      <ul v-else class="max-h-96 overflow-y-auto divide-y divide-line">
        <li
          v-for="n in recent"
          :key="n.id"
          @click="handleClick(n.id, n.link)"
          :class="[
            'px-4 py-3 hover:bg-cream/50 dark:hover:bg-surface-2 cursor-pointer transition',
            !n.readAt && 'bg-gold/5',
          ]"
        >
          <div class="flex items-start gap-3">
            <span :class="['text-lg leading-none mt-0.5', ICON_COLOR[n.type] || 'text-ink/40']">
              {{ ICONS[n.type] || '•' }}
            </span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span :class="['text-sm truncate', !n.readAt ? 'font-medium' : 'text-ink/70']">
                  {{ n.title }}
                </span>
                <span v-if="!n.readAt" class="w-1.5 h-1.5 rounded-full bg-gold shrink-0"></span>
              </div>
              <p class="text-xs text-ink/60 mt-0.5 line-clamp-2">{{ n.body }}</p>
              <p class="text-[10px] text-ink/40 mt-1">{{ timeAgo(n.createdAt) }}</p>
            </div>
          </div>
        </li>
      </ul>

      <button
        @click="viewAll"
        class="block w-full px-4 py-2.5 text-xs text-center border-t border-line text-gold hover:bg-cream/50 dark:hover:bg-surface-2"
      >
        查看全部通知 →
      </button>
    </div>

    <!-- 点击外部关闭 -->
    <div v-if="open" @click="open = false" class="fixed inset-0 z-40"></div>
  </div>
</template>
