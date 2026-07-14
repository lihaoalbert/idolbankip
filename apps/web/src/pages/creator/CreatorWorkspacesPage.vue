<script setup lang="ts">
/**
 * R11.1 P0-2: 创作者「我接的活儿」 — 我中标 / 进行中的 workspace 列表
 * 解决投标后失联 — 全站从无到有,创作者从 nav「我的任务」直接进入
 */
import { onMounted, ref, computed } from 'vue';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';

const toast = useToast();
const items = ref<any[]>([]);
const loading = ref(true);

const STATUS_LABEL: Record<string, string> = {
  active: '创作中',
  submitted: '已提交待审核',
  approved: '已通过',
  revision: '打回修改',
};

const STATUS_BG: Record<string, string> = {
  active: 'bg-gold/15 text-ink',
  submitted: 'bg-stamp-red/10 text-stamp-red',
  approved: 'bg-success/10 text-success',
  revision: 'bg-danger/10 text-danger',
};

const filter = ref<'all' | 'active' | 'submitted' | 'approved' | 'revision'>('all');

const visible = computed(() => {
  if (filter.value === 'all') return items.value;
  return items.value.filter((it) => it.status === filter.value);
});

async function load() {
  loading.value = true;
  try {
    const r = await apiClient.get('/creator/workspaces');
    items.value = r.data?.items ?? [];
  } catch (e: any) {
    console.error('[CreatorWorkspaces] load error', e);
    toast.error(e?.response?.data?.message ?? '加载失败');
  } finally {
    loading.value = false;
  }
}

function fmtDate(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toISOString().slice(0, 10);
}

function fmtMoney(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `¥${n.toFixed(0)}`;
}

function daysLeft(deadlineAt?: string | null) {
  if (!deadlineAt) return { text: '—', danger: false };
  const days = Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return { text: '已截止', danger: true };
  if (days === 0) return { text: '今日截止', danger: true };
  if (days <= 3) return { text: `${days} 天后截止`, danger: true };
  return { text: `${days} 天后截止`, danger: false };
}

const counts = computed(() => ({
  all: items.value.length,
  active: items.value.filter((i) => i.status === 'active').length,
  submitted: items.value.filter((i) => i.status === 'submitted').length,
  approved: items.value.filter((i) => i.status === 'approved').length,
  revision: items.value.filter((i) => i.status === 'revision').length,
}));

onMounted(load);
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">IBIren · MY WORKSPACES</div>
        <div class="catalog-no text-ink/40">VOL. I — ASSIGNMENTS</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-[1320px] mx-auto px-6 lg:px-10 py-10 md:py-14">
      <RouterLink to="/creator" class="catalog-no text-ink/50 hover:text-gold transition inline-flex items-center gap-2 mb-6">
        <span>←</span><span>RETURN TO CREATOR CENTER</span>
      </RouterLink>

      <div class="grid grid-cols-12 gap-4 mb-8">
        <div class="col-span-3 catalog-no text-ink/50">№ 032</div>
        <div class="col-span-3 col-start-5 catalog-no text-ink/50">CHAPTER XXXII — MY WORK</div>
        <div class="col-span-3 col-start-9 catalog-no text-ink/50">COMMISSIONED</div>
        <div class="col-span-3 col-start-12 catalog-no text-ink/50 text-right hidden md:block">{{ counts.all }} ENTRIES</div>
      </div>

      <div class="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <h1 class="font-display text-5xl md:text-7xl text-ink leading-[0.95]">
            我的<span class="font-display-italic text-gold">活</span>儿
          </h1>
          <p class="mt-3 text-sm text-ink/60 max-w-xl leading-relaxed">
            投标中标的发包会出现在这里 · 点击进入工作区上传中间稿、提交验收
          </p>
        </div>
      </div>

      <!-- Filter tabs · 像图录版次切换 -->
      <div class="flex flex-wrap items-stretch border-0.5 border-ink mb-10">
        <button v-for="f in (['all','active','submitted','approved','revision'] as const)" :key="f"
          @click="filter = f"
          :class="[
            'px-4 py-2 catalog-no text-xs transition border-r-0.5 border-ink last:border-r-0',
            filter === f ? 'bg-ink text-cream' : 'text-ink/60 hover:bg-ink hover:text-cream'
          ]"
        >
          {{ ({all:'全部', active:'创作中', submitted:'待审核', approved:'已通过', revision:'打回'}[f]) }} · {{ counts[f] }}
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="grid md:grid-cols-2 gap-6">
        <div v-for="i in 4" :key="i" class="bg-surface border-0.5 border-ink p-6 space-y-4">
          <div class="h-5 bg-ink/10 rounded w-3/4"></div>
          <div class="h-3 bg-ink/10 rounded w-full"></div>
          <div class="h-3 bg-ink/10 rounded w-2/3"></div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="items.length === 0" class="py-24 text-center bg-surface border-0.5 border-line">
        <div class="catalog-no text-ink/40 mb-3">— EMPTY STUDIO —</div>
        <div class="font-display text-xl text-ink/60">还没有中标的工作区</div>
        <div class="text-sm text-ink/40 mt-2 catalog-no">去任务板投标,中标后会出现在这里</div>
        <RouterLink to="/creator/briefs" class="inline-block mt-6 px-5 py-2 bg-ink text-cream catalog-no text-xs hover:bg-gold transition">
          去任务板 →
        </RouterLink>
      </div>

      <!-- Cards -->
      <div v-else class="grid md:grid-cols-2 gap-6">
        <RouterLink
          v-for="(w, idx) in visible"
          :key="w.id"
          :to="`/creator/workspace/${w.id}`"
          class="bg-surface border-0.5 border-ink p-6 md:p-7 relative hover:border-gold transition group block"
        >
          <div class="absolute -top-3 left-6">
            <div class="stamp text-gold border-gold bg-cream">№ {{ String(idx + 1).padStart(3, '0') }}</div>
          </div>

          <header class="flex items-start justify-between gap-3 mb-3">
            <h3 class="font-display text-xl text-ink leading-tight flex-1 line-clamp-2">
              {{ w.brief?.title ?? '（无标题）' }}
            </h3>
            <span :class="['shrink-0 catalog-no text-xs px-2 py-1', STATUS_BG[w.status] ?? 'bg-ink/5 text-ink/60']">
              {{ STATUS_LABEL[w.status] ?? w.status }}
            </span>
          </header>

          <div class="mb-4 grid grid-cols-3 gap-2 catalog-no text-xs">
            <div>
              <div class="text-ink/50">BUDGET</div>
              <div class="text-ink font-display text-base mt-0.5">{{ fmtMoney(w.brief?.budgetMax) }}</div>
            </div>
            <div>
              <div class="text-ink/50">DEADLINE</div>
              <div :class="['mt-0.5', daysLeft(w.brief?.deadlineAt).danger ? 'text-danger' : 'text-ink/80']">
                {{ daysLeft(w.brief?.deadlineAt).text }}
              </div>
            </div>
            <div>
              <div class="text-ink/50">STARTED</div>
              <div class="text-ink/80 mt-0.5">{{ fmtDate(w.startedAt) }}</div>
            </div>
          </div>

          <footer class="hairline-t border-line pt-4 flex items-center justify-between flex-wrap gap-3">
            <div class="catalog-no text-xs text-ink/50">
              <span v-if="w.revisionCount > 0">已打回 {{ w.revisionCount }} 次</span>
              <span v-else>— 首次提交 —</span>
            </div>
            <span class="inline-flex items-center gap-2 catalog-no text-xs text-gold group-hover:text-ink transition">
              进入工作区
              <span class="font-display-italic">→</span>
            </span>
          </footer>
        </RouterLink>
      </div>
    </main>

    <footer class="hairline-t border-line mt-12">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. WS-032</span>
        <span>SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>
