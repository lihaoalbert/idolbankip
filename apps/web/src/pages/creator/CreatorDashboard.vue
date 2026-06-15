<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const items = ref<any[]>([]);
const loading = ref(true);

async function fetch() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/ips/mine/list');
    items.value = data.items;
  } finally { loading.value = false; }
}

function statusLabel(s: string): string {
  return {
    PENDING_REVIEW: '待提交',
    REVIEWED_PROOFING: '审核中',
    PUBLIC_INTENT: '公示中',
    OFFICIAL_REGISTERED: '已登记',
    REJECTED: '已拒绝',
    ARCHIVED: '已归档',
  }[s] || s;
}

function statusColor(s: string): string {
  return {
    PUBLIC_INTENT: 'bg-gold/20 text-ink',
    OFFICIAL_REGISTERED: 'bg-success/15 text-success',
    REJECTED: 'bg-danger/10 text-danger',
  }[s] || 'bg-ink/10 text-ink/60';
}

function completionPercent(ip: any): number {
  const required = ['THREE_VIEW', 'EXPRESSION_GRID', 'TRANSPARENT_RENDER', 'LORA_FILE', 'RECIPE_TXT', 'BIO_TXT'];
  const present = new Set(ip.files?.filter((f: any) => f.validated).map((f: any) => f.assetType) || []);
  return Math.round((required.filter(t => present.has(t)).length / required.length) * 100);
}

onMounted(fetch);
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 py-10">
    <div class="flex items-baseline justify-between mb-2">
      <h1 class="font-display text-3xl">创作者中心</h1>
      <RouterLink
        to="/creator/ips/new"
        class="px-5 py-2 bg-ink text-cream rounded-full text-sm hover:bg-gold transition"
      >+ 新建 IP</RouterLink>
    </div>
    <p class="text-sm text-ink/60 mb-8">{{ auth.user?.displayName }} · {{ auth.user?.email }}</p>

    <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>
    <div v-else-if="items.length === 0" class="text-center py-20">
      <p class="text-ink/40 mb-4">你还没有创建任何 IP</p>
      <RouterLink to="/creator/ips/new" class="text-gold underline">立即创建第一个 →</RouterLink>
    </div>
    <div v-else class="grid md:grid-cols-2 gap-4">
      <RouterLink
        v-for="ip in items"
        :key="ip.id"
        :to="`/creator/ips/${ip.id}`"
        class="block bg-white rounded-2xl border border-line p-5 hover:shadow-soft transition"
      >
        <div class="flex items-start justify-between mb-3">
          <div>
            <div class="font-medium">{{ ip.displayName }}</div>
            <div class="text-xs text-ink/50 font-mono">{{ ip.code }}</div>
          </div>
          <span :class="['px-2 py-0.5 text-xs rounded-full', statusColor(ip.status)]">{{ statusLabel(ip.status) }}</span>
        </div>
        <div class="text-xs text-ink/60 mb-3">
          完整度: {{ completionPercent(ip) }}%
        </div>
        <div class="h-1 bg-cream rounded-full overflow-hidden">
          <div class="h-full bg-gold" :style="{ width: completionPercent(ip) + '%' }" />
        </div>
      </RouterLink>
    </div>
  </div>
</template>