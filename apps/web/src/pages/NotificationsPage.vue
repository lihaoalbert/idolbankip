<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useNotificationsStore } from '@/stores/notifications';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const notifs = useNotificationsStore();
const router = useRouter();

const filter = ref<'all' | 'unread'>('all');

onMounted(() => {
  notifs.fetch(100);
});

const displayed = computed(() => {
  if (filter.value === 'unread') return notifs.items.filter(n => !n.readAt);
  return notifs.items;
});

const hasUnread = computed(() => notifs.unreadCount > 0);

async function handleClick(id: string, link: string | null) {
  await notifs.markRead(id);
  if (link) router.push(link);
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

function fullDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
}

const ICON_LABEL: Record<string, string> = {
  KYC_APPROVED: 'KYC 通过',
  KYC_REJECTED: 'KYC 拒绝',
  IP_PUBLIC: '资产上架',
  IP_REJECTED: '审核未通过',
  IP_REGISTERED: '版权登记',
  CERT_APPROVED: '证书通过',
  CERT_REJECTED: '证书拒绝',
};

const ICON_COLOR: Record<string, string> = {
  KYC_APPROVED: 'bg-success/15 text-success border-success/30',
  KYC_REJECTED: 'bg-danger/15 text-danger border-danger/30',
  IP_PUBLIC: 'bg-info/15 text-info border-info/30',
  IP_REJECTED: 'bg-danger/15 text-danger border-danger/30',
  IP_REGISTERED: 'bg-gold/15 text-gold border-gold/30',
  CERT_APPROVED: 'bg-success/15 text-success border-success/30',
  CERT_REJECTED: 'bg-danger/15 text-danger border-danger/30',
};
</script>

<template>
  <div class="max-w-3xl mx-auto px-6 py-10">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-display">通知中心</h1>
        <p class="text-sm text-ink/60 mt-1">KYC、版权登记、资产审核的状态变更都会在这里通知你。</p>
      </div>
      <button
        v-if="hasUnread"
        @click="notifs.markAllRead()"
        class="px-3 py-1.5 text-xs rounded-full border border-line text-gold hover:border-gold transition"
      >
        全部标记为已读
      </button>
    </div>

    <div class="flex items-center gap-2 mb-4 text-sm">
      <button
        @click="filter = 'all'"
        :class="[
          'px-3 py-1 rounded-full transition',
          filter === 'all' ? 'bg-ink text-cream' : 'text-ink/60 hover:text-ink',
        ]"
      >
        全部 ({{ notifs.items.length }})
      </button>
      <button
        @click="filter = 'unread'"
        :class="[
          'px-3 py-1 rounded-full transition',
          filter === 'unread' ? 'bg-ink text-cream' : 'text-ink/60 hover:text-ink',
        ]"
      >
        未读 ({{ notifs.unreadCount }})
      </button>
    </div>

    <div v-if="notifs.loading && notifs.items.length === 0" class="py-16 text-center text-ink/40">
      加载中...
    </div>
    <div v-else-if="displayed.length === 0" class="py-16 text-center">
      <div class="text-5xl mb-3">📭</div>
      <p class="text-ink/60 text-sm">
        {{ filter === 'unread' ? '没有未读通知' : '暂无通知' }}
      </p>
    </div>

    <ul v-else class="space-y-2">
      <li
        v-for="n in displayed"
        :key="n.id"
        @click="handleClick(n.id, n.link)"
        :class="[
          'p-4 border rounded-xl cursor-pointer transition',
          !n.readAt
            ? 'bg-gold/5 border-gold/30 hover:border-gold'
            : 'border-line bg-cream/30 hover:border-ink/30',
        ]"
      >
        <div class="flex items-start gap-3">
          <span
            :class="[
              'shrink-0 w-10 h-10 rounded-full border flex items-center justify-center text-xs font-medium',
              ICON_COLOR[n.type] || 'border-line text-ink/40',
            ]"
          >
            {{ ICON_LABEL[n.type] || '通知' }}
          </span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span :class="['text-sm', !n.readAt ? 'font-medium' : 'text-ink/80']">{{ n.title }}</span>
              <span v-if="!n.readAt" class="w-1.5 h-1.5 rounded-full bg-gold"></span>
            </div>
            <p class="text-sm text-ink/70 mt-1 break-words">{{ n.body }}</p>
            <p class="text-xs text-ink/40 mt-1.5" :title="fullDate(n.createdAt)">
              {{ timeAgo(n.createdAt) }}
            </p>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
