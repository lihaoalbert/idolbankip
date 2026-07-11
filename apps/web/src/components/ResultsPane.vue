<script setup lang="ts">
/**
 * ResultsPane — 右栏, INTRA-action results 渲染区
 *
 * W6-R2 Buyer: 占位为主, R2 buyer 写操作结果 (发包成功/接受 bid 跳页) 已经在 IntentCard 内反馈,
 * 这块主要放 README: "R3 AI 工具结果" 占位 + 列表 announcement.
 *
 * W6-R3 Creator: 这块会被替换为具体的 AI 工具 (face prompt builder / blueprint / etc.)
 */
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { buyerBriefsApi } from '@/api/briefs';
import type { BriefSummary } from '@/api/briefs';

const route = useRoute();
const briefs = ref<BriefSummary[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const out = await buyerBriefsApi.list({ status: 'open' });
    briefs.value = out.items.slice(0, 8);
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? e?.message ?? '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
// 路由切换到 /buyer/chat 或 LIST_BRIEFS intent 触发时重 load
watch(() => route.fullPath, () => {
  if (route.fullPath.startsWith('/buyer')) load();
});
</script>

<template>
  <div class="h-full flex flex-col bg-cream/30 dark:bg-surface/30">
    <div class="px-4 py-2.5 border-b border-line bg-cream/60 dark:bg-surface/60 backdrop-blur">
      <div class="text-sm font-medium">我的工作台</div>
      <div class="text-[10px] text-ink/50 mt-0.5">R2: 最近发包列表 · R3: AI 工具结果</div>
    </div>
    <div class="flex-1 overflow-y-auto px-3 py-3 space-y-2 text-xs">
      <div v-if="loading" class="text-ink/50 text-center py-6">加载中…</div>
      <div v-else-if="error" class="text-red-500 text-center py-6">{{ error }}</div>
      <template v-else-if="briefs.length > 0">
        <div v-for="b in briefs" :key="b.id" class="border border-line rounded-lg p-2.5 bg-surface">
          <div class="flex items-start justify-between gap-2">
            <RouterLink :to="`/buyer/briefs/${b.id}`" class="font-medium hover:text-gold transition leading-snug">
              {{ b.title }}
            </RouterLink>
            <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-gold/15 text-gold shrink-0">{{ b.status }}</span>
          </div>
          <div class="mt-1 text-[10px] text-ink/50 flex items-center gap-2">
            <span>¥{{ b.budgetMin }}–¥{{ b.budgetMax }}</span>
            <span>·</span>
            <span>{{ b.platformSet.length }} 平台</span>
            <span v-if="b.bidsCount !== undefined">·</span>
            <span v-if="b.bidsCount !== undefined">{{ b.bidsCount }} 投标</span>
          </div>
        </div>
      </template>
      <div v-else class="text-center py-6 text-ink/40">
        还没有发包 · 在左侧输入"帮我发包…"
      </div>

      <div class="mt-6 pt-4 border-t border-line">
        <div class="text-[10px] text-ink/40 leading-relaxed">
          <div class="font-medium text-ink/60 mb-1">💡 R3 即将上</div>
          <ul class="space-y-0.5 list-disc list-inside">
            <li>Face Prompt Builder</li>
            <li>Blueprint 资产生成</li>
            <li>交付物 AI 审核</li>
            <li>合同 / 评价生成器</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
