<script setup lang="ts">
/**
 * BuyerBriefsListPage — /buyer/briefs 我的发包列表 (独立 page)
 *
 * R9.2: 之前左栏「📋 我的发包」按钮指向 /buyer → 404。补上独立列表 page,
 * 复用 ResultsPane 的 buyer 逻辑, 加 status 筛选 chip + 「新建发包」 CTA。
 *
 * 与 chat 右栏 ResultsPane 的区别:
 *   - ResultsPane: 简版 8 条 bidding 预览 (chat 流内快速跳)
 *   - 本页: 全量 + status 筛选 + 顶部「新建发包」CTA
 */
import { onMounted, ref, computed } from 'vue';
import { buyerBriefsApi } from '@/api/briefs';
import type { BriefSummary } from '@/api/briefs';

const briefs = ref<BriefSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const statusFilter = ref<'all' | 'draft' | 'bidding' | 'closed' | 'awarded'>('all');

const filtered = computed(() => {
  if (statusFilter.value === 'all') return briefs.value;
  return briefs.value.filter((b) => b.status === statusFilter.value);
});

const totalCount = computed(() => briefs.value.length);

onMounted(async () => {
  try {
    const out = await buyerBriefsApi.list({});
    briefs.value = out.items;
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? e?.message ?? '加载失败';
  } finally {
    loading.value = false;
  }
});

const statusOptions: Array<{ value: typeof statusFilter.value; label: string; count?: number }> = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'bidding', label: '投标中' },
  { value: 'awarded', label: '已选标' },
  { value: 'closed', label: '已关闭' },
];

function statusChipClass(s: string): string {
  if (s === 'bidding') return 'bg-gold/15 text-gold border-gold';
  if (s === 'awarded') return 'bg-success/15 text-success border-success';
  if (s === 'closed') return 'bg-ink/10 text-ink/50 border-ink/20';
  return 'bg-cream/40 text-ink/70 border-line';
}
</script>

<template>
  <div class="min-h-screen bg-cream dark:bg-ink paper-grain">
    <div class="max-w-[1100px] mx-auto px-6 lg:px-10 py-10 md:py-14">

      <!-- 顶部标题 + CTA -->
      <header class="flex items-end justify-between gap-6 mb-8 pb-6 hairline-b border-line">
        <div>
          <div class="catalog-no text-gold mb-2">— BUYER · BRIEFS —</div>
          <h1 class="font-display text-4xl md:text-5xl leading-[1.05] text-ink">
            我的<span class="font-display-italic text-gold">发包</span>
          </h1>
          <p class="mt-3 text-sm text-ink/60 dark:text-cream/55">
            共 {{ totalCount }} 条发包 · 投标中由创作者竞标, 已选标进入 workspace
          </p>
        </div>
        <RouterLink
          to="/buyer/brief/new"
          class="inline-flex items-center gap-2 px-6 py-3 bg-ink text-cream rounded-r8-none hover:bg-gold hover:text-ink transition-colors duration-500 shrink-0"
        >
          <span class="catalog-no text-cream/60 group-hover:text-ink/60">NEW</span>
          <span class="text-sm font-medium tracking-wide">新建发包</span>
          <span>→</span>
        </RouterLink>
      </header>

      <!-- status 筛选 chip -->
      <div class="flex flex-wrap items-center gap-2 mb-6">
        <button
          v-for="opt in statusOptions"
          :key="opt.value"
          type="button"
          @click="statusFilter = opt.value"
          :class="[
            'text-[11px] px-3 py-1.5 rounded-r8-sm border hairline transition',
            statusFilter === opt.value
              ? 'bg-ink text-cream border-ink'
              : 'border-line text-ink/70 hover:border-gold hover:text-gold',
          ]"
        >
          {{ opt.label }}
        </button>
      </div>

      <!-- 列表 -->
      <div v-if="loading" class="grid gap-3">
        <div v-for="i in 4" :key="i" class="h-20 bg-surface hairline border-line rounded-r8-md animate-pulse" />
      </div>

      <div v-else-if="error" class="text-center py-12 text-danger">{{ error }}</div>

      <div v-else-if="filtered.length === 0" class="text-center py-20">
        <div class="font-display text-6xl text-ink/15 mb-4">∅</div>
        <p class="text-sm text-ink/50 dark:text-ink/40 mb-6">
          {{ statusFilter === 'all' ? '还没有发包 · 在左侧 chat 输入「帮我发包」, 或点上方「新建发包」' : `没有「${statusOptions.find(o => o.value === statusFilter)?.label}」状态的发包` }}
        </p>
        <RouterLink
          v-if="statusFilter === 'all'"
          to="/buyer/brief/new"
          class="inline-flex items-center gap-2 px-5 py-2.5 border-0.5 border-ink text-ink hover:bg-ink hover:text-cream transition-colors duration-500 text-sm"
        >
          新建第一条发包 →
        </RouterLink>
      </div>

      <div v-else class="grid gap-2.5">
        <RouterLink
          v-for="b in filtered"
          :key="b.id"
          :to="`/buyer/briefs/${b.id}`"
          class="block border hairline border-line rounded-r8-md p-4 bg-surface hover:border-gold transition group"
        >
          <div class="flex items-start justify-between gap-3 mb-2">
            <h3 class="font-display text-lg text-ink group-hover:text-gold transition leading-snug">
              {{ b.title }}
            </h3>
            <span
              class="text-[10px] px-2 py-0.5 rounded-r8-sm border hairline shrink-0"
              :class="statusChipClass(b.status)"
            >{{ b.status }}</span>
          </div>
          <div class="flex items-center gap-3 text-[11px] text-ink/50 dark:text-cream/50 font-mono">
            <span>¥{{ b.budgetMin }}–¥{{ b.budgetMax }}</span>
            <span>·</span>
            <span>{{ b.platformSet.length }} 平台</span>
            <span v-if="b.bidsCount !== undefined">·</span>
            <span v-if="b.bidsCount !== undefined">{{ b.bidsCount }} 投标</span>
            <span>·</span>
            <span>{{ b.deadlineAt }}</span>
          </div>
        </RouterLink>
      </div>

      <!-- 底部 hint -->
      <div class="mt-12 pt-6 hairline-t border-line text-[11px] text-ink/40 dark:text-cream/40 leading-relaxed">
        💡 R9 上线 · 列表 + chat 右栏 ResultsPane 各自独立, 列表可全量筛选, 右栏保留 8 条 bidding 快速预览。
      </div>
    </div>
  </div>
</template>