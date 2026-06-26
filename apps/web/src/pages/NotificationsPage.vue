<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useNotificationsStore } from '@/stores/notifications';

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

const TYPE_META: Record<string, { label: string; roman: string; variant: 'success' | 'danger' | 'gold' | 'info' | 'neutral' }> = {
  KYC_APPROVED: { label: 'KYC 通过', roman: 'I', variant: 'success' },
  KYC_REJECTED: { label: 'KYC 拒绝', roman: '×', variant: 'danger' },
  IP_PUBLIC: { label: '资产上架', roman: 'II', variant: 'info' },
  IP_REJECTED: { label: '审核未通过', roman: '×', variant: 'danger' },
  IP_REGISTERED: { label: '版权登记', roman: 'III', variant: 'gold' },
  CERT_APPROVED: { label: '证书通过', roman: 'IV', variant: 'success' },
  CERT_REJECTED: { label: '证书拒绝', roman: '×', variant: 'danger' },
  // #30.6.26 著作权代申请 5 种状态
  COPYRIGHT_REG_DRAFT: { label: '著作权草稿', roman: 'V', variant: 'neutral' },
  COPYRIGHT_REG_SUBMITTED: { label: '著作权已提交', roman: 'V', variant: 'info' },
  COPYRIGHT_REG_ACCEPTED: { label: '著作权受理', roman: 'V', variant: 'info' },
  COPYRIGHT_REG_CERTIFIED: { label: '著作权登记成功', roman: 'V', variant: 'gold' },
  COPYRIGHT_REG_REJECTED: { label: '著作权驳回', roman: '×', variant: 'danger' },
};
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <!-- 顶部条 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">ibi.ren · DISPATCH BOOK</div>
        <div class="catalog-no text-ink/40">VOL. I — NOTIFICATIONS</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-6 lg:px-10 py-10 md:py-14">
      <!-- 返回 (入口在 navbar 小铃铛,哪页都可能,走 browser history) -->
      <button
        @click="router.back()"
        class="catalog-no text-ink/50 hover:text-gold transition inline-flex items-center gap-2 mb-6"
      >
        <span>←</span><span>RETURN</span>
      </button>

      <!-- 章节头 -->
      <div class="grid grid-cols-12 gap-4 mb-8">
        <div class="col-span-3 catalog-no text-ink/50">№ 040</div>
        <div class="col-span-3 col-start-5 catalog-no text-ink/50">CHAPTER XL — DISPATCH</div>
        <div class="col-span-3 col-start-9 catalog-no text-ink/50">{{ notifs.unreadCount }} UNREAD</div>
        <div class="col-span-3 col-start-12 catalog-no text-ink/50 text-right hidden md:block">{{ notifs.items.length }} TOTAL</div>
      </div>

      <div class="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <h1 class="font-display text-5xl md:text-7xl text-ink leading-[0.95]">
            通知<span class="font-display-italic text-gold">中</span>心
          </h1>
          <p class="mt-3 text-sm text-ink/60 max-w-md leading-relaxed">
            KYC · 版权登记 · 资产审核的状态变更都在此处归档 ·
            点击任意条目直接跳转至详情。
          </p>
        </div>
        <button
          v-if="hasUnread"
          @click="notifs.markAllRead()"
          class="inline-flex items-center gap-3 px-5 py-3 bg-ink text-cream hover:bg-gold transition catalog-no text-xs group"
        >
          <span class="text-cream/70 group-hover:text-ink/70 text-[10px]">MARK ALL READ</span>
          <span>全部标记为已读</span>
        </button>
      </div>

      <!-- Tabs · 像档案版次 -->
      <div class="flex items-stretch border-0.5 border-ink mb-8">
        <button
          @click="filter = 'all'"
          :class="[
            'flex-1 px-5 py-3 catalog-no transition border-r-0.5 border-ink',
            filter === 'all' ? 'bg-ink text-cream' : 'text-ink/60 hover:bg-ink hover:text-cream'
          ]"
        >
          ALL · 全部 ({{ notifs.items.length }})
        </button>
        <button
          @click="filter = 'unread'"
          :class="[
            'flex-1 px-5 py-3 catalog-no transition',
            filter === 'unread' ? 'bg-ink text-cream' : 'text-ink/60 hover:bg-ink hover:text-cream'
          ]"
        >
          UNREAD · 未读 ({{ notifs.unreadCount }})
        </button>
      </div>

      <!-- Loading -->
      <div v-if="notifs.loading && notifs.items.length === 0" class="py-24 text-center bg-surface border-0.5 border-line">
        <div class="catalog-no text-ink/40 mb-2">— LOADING —</div>
        <div class="font-display text-lg text-ink/60">加载中…</div>
      </div>

      <!-- Empty -->
      <div v-else-if="displayed.length === 0" class="py-24 text-center bg-surface border-0.5 border-line">
        <div class="catalog-no text-ink/40 mb-3">— NO ENTRIES —</div>
        <div class="font-display-italic text-2xl text-ink/60 mb-2">
          {{ filter === 'unread' ? '没有未读通知' : '暂无通知' }}
        </div>
        <div class="catalog-no text-xs text-ink/40">DISPATCH BOOK IS EMPTY</div>
      </div>

      <!-- 通知列表 -->
      <ul v-else class="space-y-3">
        <li
          v-for="(n, idx) in displayed"
          :key="n.id"
          @click="handleClick(n.id, n.link)"
          :class="[
            'p-5 md:p-6 border-0.5 cursor-pointer transition relative group',
            !n.readAt
              ? 'bg-gold/5 border-gold/40 hover:border-gold hover:shadow-soft'
              : 'border-line bg-surface hover:border-ink'
          ]"
        >
          <!-- 编号 -->
          <div class="absolute top-3 right-4 catalog-no text-ink/30 group-hover:text-ink/60 transition">
            {{ String(idx + 1).padStart(3, '0') }}
          </div>

          <div class="flex items-start gap-4">
            <!-- 类型印记 -->
            <div
              :class="[
                'shrink-0 w-14 h-14 flex flex-col items-center justify-center border-0.5 font-display transition',
                !n.readAt
                  ? (TYPE_META[n.type]?.variant === 'success' ? 'bg-success/10 border-success/40 text-success' :
                     TYPE_META[n.type]?.variant === 'danger' ? 'bg-danger/10 border-danger/40 text-danger' :
                     TYPE_META[n.type]?.variant === 'gold' ? 'bg-gold/15 border-gold/40 text-ink' :
                     TYPE_META[n.type]?.variant === 'info' ? 'bg-blue-100/40 border-blue-200 text-blue-700' :
                     'bg-ink/5 border-line text-ink/50')
                  : 'bg-cream border-line text-ink/40'
              ]"
            >
              <span class="text-lg leading-none">{{ TYPE_META[n.type]?.roman || '?' }}</span>
              <span class="catalog-no text-[9px] mt-0.5 opacity-80">{{ TYPE_META[n.type]?.label || '通知' }}</span>
            </div>

            <!-- 内容 -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span :class="['font-display text-base', !n.readAt ? 'text-ink' : 'text-ink/70']">
                  {{ n.title }}
                </span>
                <span v-if="!n.readAt" class="w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
              </div>
              <p class="text-sm text-ink/70 mt-2 leading-relaxed break-words">{{ n.body }}</p>
              <p class="catalog-no text-xs text-ink/40 mt-3" :title="fullDate(n.createdAt)">
                <span :class="!n.readAt ? 'text-gold' : ''">{{ timeAgo(n.createdAt) }}</span>
                <span class="mx-2">·</span>
                <span>{{ fullDate(n.createdAt) }}</span>
              </p>
            </div>
          </div>
        </li>
      </ul>
    </main>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line mt-12">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. NOTIF-040</span>
        <span>SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>
