<script setup lang="ts">
/**
 * ResultsPane — 右栏, 上下文工作台/AI 工具渲染区
 *
 * W6-R2 Buyer: 最近发包列表 (自己的), R3 即将接 AI 工具结果
 * W6-R3 Creator: 可接发包列表 (公开 bidding), 我的 workspace 占位
 *
 * 接受 `scope` prop:
 *   - 'buyer' (默认): 列我的发包 (POST /buyer/briefs 范围)
 *   - 'creator': 列可接发包 (GET /creator/briefs) + 我的 workspace 列表占位
 */
import { onMounted, ref, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { buyerBriefsApi } from '@/api/briefs';
import type { BriefSummary } from '@/api/briefs';

interface Props {
  scope?: 'buyer' | 'creator';
}
const props = withDefaults(defineProps<Props>(), { scope: 'buyer' });

const route = useRoute();
const briefs = ref<BriefSummary[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    if (props.scope === 'creator') {
      const out = await buyerBriefsApi.listOpen({});
      briefs.value = out.items.slice(0, 10);
    } else {
      const out = await buyerBriefsApi.list({ status: 'bidding' });
      briefs.value = out.items.slice(0, 8);
    }
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? e?.message ?? '加载失败';
  } finally {
    loading.value = false;
  }
}

const title = computed(() => (props.scope === 'creator' ? '可接发包' : '我的发包'));
const subtitle = computed(() =>
  props.scope === 'creator'
    ? '公开 bidding 中的发包 · 投标后进入你的 workspace'
    : '我创建的 bidding 中的发包',
);
const emptyHint = computed(() =>
  props.scope === 'creator' ? '暂无公开发包 · 看后续上新' : '还没有发包 · 在左侧输入"帮我发包…"',
);

onMounted(load);
watch(() => route.fullPath, () => {
  if (route.fullPath.startsWith('/buyer') || route.fullPath.startsWith('/creator')) load();
});
</script>

<template>
  <div class="h-full flex flex-col bg-cream/30 dark:bg-surface/30">
    <div class="px-4 py-2.5 border-b border-line bg-cream/60 dark:bg-surface/60 backdrop-blur">
      <div class="text-sm font-medium">{{ title }}</div>
      <div class="text-[10px] text-ink/50 mt-0.5">{{ subtitle }}</div>
    </div>
    <div class="flex-1 overflow-y-auto px-3 py-3 space-y-2 text-xs">
      <div v-if="loading" class="text-ink/50 text-center py-6">加载中…</div>
      <div v-else-if="error" class="text-red-500 text-center py-6">{{ error }}</div>
      <template v-else-if="briefs.length > 0">
        <RouterLink
          v-for="b in briefs"
          :key="b.id"
          :to="scope === 'creator' ? `/creator/briefs/${b.id}` : `/buyer/briefs/${b.id}`"
          class="block border border-line rounded-lg p-2.5 bg-surface hover:border-gold transition"
        >
          <div class="flex items-start justify-between gap-2">
            <span class="font-medium hover:text-gold transition leading-snug">{{ b.title }}</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-gold/15 text-gold shrink-0">{{ b.status }}</span>
          </div>
          <div class="mt-1 text-[10px] text-ink/50 flex items-center gap-2">
            <span>¥{{ b.budgetMin }}–¥{{ b.budgetMax }}</span>
            <span>·</span>
            <span>{{ b.platformSet.length }} 平台</span>
            <span v-if="b.bidsCount !== undefined">·</span>
            <span v-if="b.bidsCount !== undefined">{{ b.bidsCount }} 投标</span>
          </div>
        </RouterLink>
      </template>
      <div v-else class="text-center py-6 text-ink/40">
        {{ emptyHint }}
      </div>

      <div class="mt-6 pt-4 border-t border-line">
        <div class="text-[10px] text-ink/40 leading-relaxed">
          <div class="font-medium text-ink/60 mb-1">💡 R3 即将上 (本 scope = {{ scope }})</div>
          <ul class="space-y-0.5 list-disc list-inside" v-if="scope === 'creator'">
            <li>Face Prompt Builder</li>
            <li>Blueprint 资产生成</li>
            <li>工作区交付物 AI 审核</li>
            <li>合同 / 评价生成器</li>
          </ul>
          <ul class="space-y-0.5 list-disc list-inside" v-else>
            <li>契约审核 / 改稿助手</li>
            <li>批量采购快捷流</li>
            <li>中间稿评论</li>
            <li>合同 / 评价生成器</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
