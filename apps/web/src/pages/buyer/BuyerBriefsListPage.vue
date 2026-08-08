<script setup lang="ts">
/**
 * BuyerBriefsListPage — /buyer/briefs 我的发包列表 (独立 page)
 *
 * R9.2: 之前左栏「📋 我的发包」按钮指向 /buyer → 404。补上独立列表 page,
 * 复用 ResultsPane 的 buyer 逻辑, 加 status 筛选 chip + 「新建发包」 CTA。
 *
 * 与 chat 右栏 ResultsPane 的区别:
 *   - ResultsPane: 简版 8 条 bidding 预览 (chat 流内快速跳)
 *   - 本页: 全量 + status 筛选 + 排序 + 分页 (R11.3 P2-5)
 *
 * R11.3 P2-5: 加排序(时间/截止/金额) + 分页(20/页) + URL query 同步 + 中文状态徽标
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { buyerBriefsApi } from '@/api/briefs';
import type { BriefSummary } from '@/api/briefs';
import { formatDeadline, formatRelative } from '@/utils/formatDate';

const route = useRoute();
const router = useRouter();
const briefs = ref<BriefSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const total = ref(0);

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  bidding: '投标中',
  in_progress: '协作中',
  delivered: '已交付',
  closed: '已关闭',
  disputed: '争议中',
};
function statusChipClass(s: string): string {
  if (s === 'bidding') return 'bg-r12-warning-soft text-r12-warning border-r12-warning';
  if (s === 'in_progress') return 'bg-r12-cobalt-soft text-r12-cobalt border-r12-cobalt';
  if (s === 'delivered') return 'bg-r12-success-soft text-r12-success border-r12-success';
  if (s === 'closed') return 'bg-r12-line text-r12-ink-tertiary border-r12-line-strong';
  if (s === 'disputed') return 'bg-r12-danger-soft text-r12-danger border-r12-danger';
  return 'bg-r12-line text-r12-ink-secondary border-r12-line';
}

// URL query 同步 — ?status=&sort=&page=
type StatusKey = 'all' | 'draft' | 'bidding' | 'in_progress' | 'delivered' | 'closed' | 'disputed';
type SortKey = 'created_desc' | 'deadline_asc' | 'budget_desc';

const statusFilter = ref<StatusKey>(
  (route.query.status as StatusKey) ?? 'all',
);
const sortKey = ref<SortKey>(
  (route.query.sort as SortKey) ?? 'created_desc',
);
const page = ref<number>(Number(route.query.page) || 1);
const PAGE_SIZE = 20;

const statusOptions: Array<{ value: StatusKey; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'bidding', label: '投标中' },
  { value: 'in_progress', label: '协作中' },
  { value: 'delivered', label: '已交付' },
  { value: 'closed', label: '已关闭' },
];
const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: 'created_desc', label: '最新发布' },
  { value: 'deadline_asc', label: '截止最近' },
  { value: 'budget_desc', label: '预算从高到低' },
];

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const out = await buyerBriefsApi.list({
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      page: page.value,
      size: PAGE_SIZE,
    });
    briefs.value = out.items;
    total.value = out.total;
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? e?.message ?? '加载失败';
    briefs.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

// 客户端排序(后端可能只按 createdAt 排)
const sorted = computed(() => {
  const arr = [...briefs.value];
  if (sortKey.value === 'deadline_asc') {
    arr.sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime());
  } else if (sortKey.value === 'budget_desc') {
    arr.sort((a, b) => Number(b.budgetMax) - Number(a.budgetMax));
  } else {
    arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return arr;
});

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

// URL query 同步
function pushQuery() {
  const q: Record<string, string> = {};
  if (statusFilter.value !== 'all') q.status = statusFilter.value;
  if (sortKey.value !== 'created_desc') q.sort = sortKey.value;
  if (page.value > 1) q.page = String(page.value);
  router.replace({ query: q });
}
function setStatus(s: StatusKey) {
  statusFilter.value = s;
  page.value = 1;
}
function setSort(s: SortKey) {
  sortKey.value = s;
}
function goPage(p: number) {
  if (p < 1 || p > totalPages.value) return;
  page.value = p;
}

watch([statusFilter, sortKey, page], () => {
  pushQuery();
  load();
});

onMounted(load);
</script>

<template>
  <div class="min-h-screen bg-r12-canvas">
    <div class="max-w-[1100px] mx-auto px-6 lg:px-10 py-10 md:py-14">

      <!-- 顶部标题 + CTA -->
      <header class="flex items-end justify-between gap-6 mb-8 pb-6 border-b border-r12-line">
        <div>
          <div class="catalog-no text-r12-ink-tertiary mb-2">— BUYER · BRIEFS —</div>
          <h1 class="font-r12-sans text-r12-h1 md:text-r12-display font-semibold leading-tight text-r12-ink-primary">
            我的<span class="text-r12-cobalt">发包</span>
          </h1>
          <p class="mt-3 text-r12-caption text-r12-ink-secondary">
            共 {{ total }} 条发包 · 投标中由创作者竞标, 已选标进入 workspace
          </p>
        </div>
        <RouterLink
          to="/buyer/brief/new"
          class="inline-flex items-center gap-2 px-6 py-3 bg-r12-ink-primary text-white hover:bg-r12-cobalt hover:text-white transition-colors duration-500 shrink-0"
        >
          <span class="catalog-no text-white/60 group-hover:text-white/80">NEW</span>
          <span class="text-sm font-medium tracking-wide">新建发包</span>
          <span>→</span>
        </RouterLink>
      </header>

      <!-- status 筛选 chip + sort -->
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <button
          v-for="opt in statusOptions"
          :key="opt.value"
          type="button"
          @click="setStatus(opt.value)"
          :class="[
            'text-[11px] px-3 py-1.5 border hairline transition rounded-r8-sm',
            statusFilter === opt.value
              ? 'bg-r12-cobalt text-white border-r12-cobalt'
              : 'border-r12-line text-r12-ink-secondary hover:border-r12-cobalt hover:text-r12-cobalt',
          ]"
        >
          {{ opt.label }}
        </button>

        <!-- 排序 · 右上 -->
        <div class="ml-auto flex items-center gap-2">
          <span class="catalog-no text-r12-ink-tertiary">SORT</span>
          <select
            v-model="sortKey"
            class="text-[11px] px-2 py-1 border border-r12-line bg-r12-surface text-r12-ink-primary"
          >
            <option v-for="o in sortOptions" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </div>
      </div>

      <!-- 列表 -->
      <div v-if="loading" class="grid gap-3">
        <div v-for="i in 4" :key="i" class="h-20 bg-r12-surface border-r12-line animate-pulse" />
      </div>

      <div v-else-if="error" class="text-center py-12 text-danger">{{ error }}</div>

      <div v-else-if="sorted.length === 0" class="text-center py-20">
        <div class="font-r12-sans text-6xl text-r12-ink-tertiary font-light mb-4">∅</div>
        <p class="text-r12-caption text-r12-ink-tertiary mb-6">
          {{ statusFilter === 'all' ? '还没有发包 · 点上方「新建发包」开始' : `没有「${statusOptions.find(o => o.value === statusFilter)?.label}」状态的发包` }}
        </p>
        <RouterLink
          v-if="statusFilter === 'all'"
          to="/buyer/brief/new"
          class="inline-flex items-center gap-2 px-5 py-2.5 border border-r12-ink-primary text-r12-ink-primary hover:bg-r12-ink-primary hover:text-white transition-colors duration-500 text-sm"
        >
          新建第一条发包 →
        </RouterLink>
      </div>

      <div v-else class="grid gap-2.5">
        <RouterLink
          v-for="b in sorted"
          :key="b.id"
          :to="`/buyer/briefs/${b.id}`"
          class="block border border-r12-line p-4 bg-r12-surface hover:border-r12-cobalt transition group"
        >
          <div class="flex items-start justify-between gap-3 mb-2">
            <h3 class="font-r12-sans text-r12-h3 font-semibold text-r12-ink-primary group-hover:text-r12-cobalt transition leading-snug">
              {{ b.title }}
            </h3>
            <span
              class="text-[10px] px-2 py-0.5 border rounded-r8-sm shrink-0"
              :class="statusChipClass(b.status)"
            >{{ STATUS_LABEL[b.status] ?? b.status }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-r12-micro-num text-r12-ink-secondary font-r12-mono">
            <span class="text-r12-ink-primary font-medium">¥{{ b.budgetMin }}–¥{{ b.budgetMax }}</span>
            <span>·</span>
            <span>{{ b.platformSet.length }} 平台</span>
            <span v-if="b.bidsCount !== undefined">·</span>
            <span v-if="b.bidsCount !== undefined">{{ b.bidsCount }} 投标</span>
            <span>·</span>
            <!-- R11.3 P2-1: 距截止 — 友好格式 -->
            <span :class="b.status === 'bidding' && new Date(b.deadlineAt) < new Date() ? 'text-stamp-red' : ''">
              {{ formatDeadline(b.deadlineAt) }}
            </span>
            <span class="ml-auto text-r12-ink-tertiary">{{ formatRelative(b.createdAt) }}</span>
          </div>
        </RouterLink>
      </div>

      <!-- 分页 -->
      <div
        v-if="!loading && !error && total > PAGE_SIZE"
        class="flex items-center justify-between mt-6 text-[11px] catalog-no text-r12-ink-tertiary"
      >
        <button
          class="px-3 py-1.5 border border-r12-line hover:border-r12-ink-primary rounded-r8-sm disabled:opacity-30 disabled:cursor-not-allowed"
          :disabled="page <= 1"
          @click="goPage(page - 1)"
        >
          ← 上一页
        </button>
        <span>第 {{ page }} / {{ totalPages }} 页 · 共 {{ total }} 条</span>
        <button
          class="px-3 py-1.5 border border-r12-line hover:border-r12-ink-primary rounded-r8-sm disabled:opacity-30 disabled:cursor-not-allowed"
          :disabled="page >= totalPages"
          @click="goPage(page + 1)"
        >
          下一页 →
        </button>
      </div>
    </div>
  </div>
</template>