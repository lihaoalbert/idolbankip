<script setup lang="ts">
/**
 * R11.2 P1-1: 创作者 IP 列表页 — 上传后能看审核状态
 * 数据源: GET /ips/mine/list(已有)
 */
import { onMounted, ref } from 'vue';
import { apiClient, ossUrl } from '@/api/client';
import { useToast } from '@/composables/useToast';

const toast = useToast();
const items = ref<any[]>([]);
const loading = ref(true);

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '审核中',
  PUBLIC_INTENT: '公示中',
  OFFICIAL_REGISTERED: '已登记',
  REJECTED: '已驳回',
  ARCHIVED: '已归档',
};
const STATUS_BG: Record<string, string> = {
  DRAFT: 'bg-ink/10 text-ink/60',
  PENDING_REVIEW: 'bg-gold/15 text-ink',
  PUBLIC_INTENT: 'bg-success/10 text-success',
  OFFICIAL_REGISTERED: 'bg-stamp-red/10 text-stamp-red',
  REJECTED: 'bg-danger/10 text-danger',
  ARCHIVED: 'bg-ink/5 text-ink/40',
};

async function load() {
  loading.value = true;
  try {
    const r = await apiClient.get('/ips/mine/list');
    items.value = r.data?.items ?? [];
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '加载失败');
  } finally {
    loading.value = false;
  }
}

function fmtDate(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toISOString().slice(0, 10);
}

function thumb(key?: string | null) {
  return key ? ossUrl(key) : '';
}

onMounted(load);
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">IBIren · MY IPs</div>
        <div class="catalog-no text-ink/40">VOL. I — STUDIO</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-[1320px] mx-auto px-6 lg:px-10 py-10 md:py-14">
      <RouterLink to="/creator" class="catalog-no text-ink/50 hover:text-gold transition inline-flex items-center gap-2 mb-6">
        <span>←</span><span>RETURN TO CREATOR CENTER</span>
      </RouterLink>

      <div class="grid grid-cols-12 gap-4 mb-8">
        <div class="col-span-3 catalog-no text-ink/50">№ 040</div>
        <div class="col-span-3 col-start-5 catalog-no text-ink/50">CHAPTER XL — MY IPs</div>
        <div class="col-span-3 col-start-9 catalog-no text-ink/50">CATALOGUE</div>
        <div class="col-span-3 col-start-12 catalog-no text-ink/50 text-right hidden md:block">{{ items.length }} ENTRIES</div>
      </div>

      <div class="flex items-end justify-between flex-wrap gap-4 mb-10">
        <h1 class="font-display text-5xl md:text-7xl text-ink leading-[0.95]">
          我的<span class="font-display-italic text-gold">IP</span>库
        </h1>
        <RouterLink to="/creator/ips/new" class="px-5 py-3 bg-ink text-cream text-xs font-medium tracking-widest uppercase hover:bg-stamp-red transition">
          + 上传新 IP
        </RouterLink>
      </div>

      <div v-if="loading" class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="i in 6" :key="i" class="bg-surface border-0.5 border-ink p-6 space-y-3">
          <div class="aspect-square bg-ink/10"></div>
          <div class="h-4 bg-ink/10 rounded w-2/3"></div>
          <div class="h-3 bg-ink/10 rounded w-1/3"></div>
        </div>
      </div>

      <div v-else-if="items.length === 0" class="py-24 text-center bg-surface border-0.5 border-line">
        <div class="catalog-no text-ink/40 mb-3">— EMPTY STUDIO —</div>
        <div class="font-display text-xl text-ink/60">还没上传过 IP</div>
        <RouterLink to="/creator/ips/new" class="inline-block mt-6 px-5 py-2 bg-ink text-cream catalog-no text-xs hover:bg-gold transition">
          + 上传第一个 IP
        </RouterLink>
      </div>

      <div v-else class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <RouterLink
          v-for="(ip, idx) in items"
          :key="ip.id"
          :to="`/creator/ips/${ip.id}`"
          class="bg-surface border-0.5 border-ink p-5 relative hover:border-gold transition group block"
        >
          <div class="absolute -top-3 left-5">
            <div class="stamp text-gold border-gold bg-cream">№ {{ String(idx + 1).padStart(3, '0') }}</div>
          </div>

          <div class="aspect-square bg-cream mb-3 overflow-hidden">
            <img v-if="ip.thumbnailKey" :src="thumb(ip.thumbnailKey)" :alt="ip.displayName" class="w-full h-full object-cover" />
            <div v-else class="w-full h-full flex items-center justify-center text-xs text-ink/30 font-mono">{{ ip.code }}</div>
          </div>

          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="font-display text-lg text-ink line-clamp-1 group-hover:text-gold transition flex-1">{{ ip.displayName }}</div>
            <span :class="['shrink-0 catalog-no text-[10px] px-2 py-0.5', STATUS_BG[ip.status] ?? 'bg-ink/5']">
              {{ STATUS_LABEL[ip.status] ?? ip.status }}
            </span>
          </div>
          <div class="font-mono text-xs text-ink/40">{{ ip.code }}</div>
          <div v-if="ip.tagline" class="text-xs text-ink/60 mt-2 line-clamp-1">{{ ip.tagline }}</div>

          <footer class="mt-3 pt-3 border-t border-line flex items-center justify-between">
            <div class="catalog-no text-[10px] text-ink/40">{{ fmtDate(ip.updatedAt ?? ip.createdAt) }}</div>
            <span class="catalog-no text-[10px] text-gold group-hover:text-ink transition">查看 →</span>
          </footer>
        </RouterLink>
      </div>
    </main>

    <footer class="hairline-t border-line mt-12">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. IP-040</span>
        <span>SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>
