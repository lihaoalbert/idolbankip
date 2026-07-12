<script setup lang="ts">
/**
 * ResultsPane — 右栏, 上下文工作台/AI 工具渲染区
 *
 * W6-R2 Buyer: 最近发包列表 (自己的)
 * W6-R3 Creator: 可接发包列表 (公开 bidding)
 * W6-R6 Tier 4: 当 route.query.focus === 'generations' 时, 切换为 AI 生成记录列表
 *   (RUN_VIDEO_GEN 成功后跳 /creator/workspace/:id?focus=generations 触发)
 *
 * 接受 `scope` prop:
 *   - 'buyer' (默认): 列我的发包
 *   - 'creator': 列可接发包
 */
import { onMounted, ref, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { buyerBriefsApi } from '@/api/briefs';
import type { BriefSummary } from '@/api/briefs';
import { aiToolsApi, type GenerationRecord } from '@/api/ai-tools';

interface Props {
  scope?: 'buyer' | 'creator';
}
const props = withDefaults(defineProps<Props>(), { scope: 'buyer' });

const route = useRoute();
const briefs = ref<BriefSummary[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

/** W6-R6: AI 生成记录 (generations mode) */
const generations = ref<GenerationRecord[]>([]);
const generationsTotal = ref(0);
const generationsTotalCostCents = ref(0);
const toolBadgeMap: Record<string, string> = {
  sora: 'Sora',
  kling: 'Kling',
  jimeng: '即梦',
  runway: 'Runway',
};

const focusMode = computed(() => route.query.focus === 'generations' && route.params.workspaceId !== undefined);
const workspaceIdFromQuery = computed(() => (typeof route.params.workspaceId === 'string' ? route.params.workspaceId : ''));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    if (focusMode.value && workspaceIdFromQuery.value) {
      // W6-R6: AI 生成记录列表
      const out = await aiToolsApi.listGenerations(workspaceIdFromQuery.value, { size: 20 });
      generations.value = out.items;
      generationsTotal.value = out.total;
      generationsTotalCostCents.value = out.totalCostCents;
    } else if (props.scope === 'creator') {
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

const title = computed(() => {
  if (focusMode.value) return 'AI 生成记录';
  return props.scope === 'creator' ? '可接发包' : '我的发包';
});
const subtitle = computed(() => {
  if (focusMode.value) {
    const yuan = (generationsTotalCostCents.value / 100).toFixed(2);
    return `共 ${generationsTotal.value} 次生成 · 累计 ¥${yuan}`;
  }
  return props.scope === 'creator'
    ? '公开 bidding 中的发包 · 投标后进入你的 workspace'
    : '我创建的 bidding 中的发包';
});
const emptyHint = computed(() => {
  if (focusMode.value) return '还没有生成记录 · 在左聊天窗口用 AI 工具触发';
  return props.scope === 'creator' ? '暂无公开发包 · 看后续上新' : '还没有发包 · 在左侧输入"帮我发包…"';
});

function statusPillClass(s: GenerationRecord['status']): string {
  return s === 'success'
    ? 'bg-green-500/15 text-green-700 dark:text-green-400'
    : s === 'failed'
    ? 'bg-red-500/15 text-red-700 dark:text-red-400'
    : 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
}
function statusLabel(s: GenerationRecord['status']): string {
  return s === 'success' ? '成功' : s === 'failed' ? '失败' : '超时';
}

onMounted(load);
watch(() => route.fullPath, () => {
  // ResultsPane 在 chat 页使用时也可能换 URL, 这里不直接 re-trigger, 由 consumer 显式重载
  if (focusMode.value || route.fullPath.startsWith('/buyer') || route.fullPath.startsWith('/creator')) load();
});
</script>

<template>
  <div class="h-full flex flex-col bg-cream/30 dark:bg-surface/30">
    <div class="px-4 py-2.5 border-b border-line bg-cream/60 dark:bg-surface-60 backdrop-blur">
      <div class="text-sm font-medium">{{ title }}</div>
      <div class="text-[10px] text-ink/50 mt-0.5">{{ subtitle }}</div>
    </div>
    <div class="flex-1 overflow-y-auto px-3 py-3 space-y-2 text-xs">
      <div v-if="loading" class="text-ink/50 text-center py-6">加载中…</div>
      <div v-else-if="error" class="text-red-500 text-center py-6">{{ error }}</div>

      <!-- W6-R6: AI 生成记录列表 -->
      <template v-else-if="focusMode">
        <RouterLink
          v-for="g in generations"
          :key="g.id"
          :to="`/creator/workspace/${workspaceIdFromQuery}?tool=${encodeURIComponent(g.toolName)}&record=${encodeURIComponent(g.id)}&focus=generations`"
          class="block border border-line rounded-lg p-2.5 bg-surface hover:border-gold transition"
        >
          <div class="flex items-start justify-between gap-2">
            <span class="font-medium hover:text-gold transition leading-snug line-clamp-2">{{ g.prompt || '(无 prompt)' }}</span>
            <div class="flex items-center gap-1 shrink-0">
              <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-gold/15 text-gold">
                {{ toolBadgeMap[g.toolName] ?? g.toolName }}
              </span>
              <span
                class="text-[9px] px-1.5 py-0.5 rounded-full"
                :class="statusPillClass(g.status)"
              >
                {{ statusLabel(g.status) }}
              </span>
            </div>
          </div>
          <div v-if="g.outputUrl" class="mt-1.5">
            <a :href="g.outputUrl" target="_blank" rel="noopener" class="text-blue-600 dark:text-blue-400 hover:underline text-[10px] break-all">
              打开输出 → {{ g.outputUrl.slice(0, 40) }}…
            </a>
          </div>
          <div class="mt-1 text-[10px] text-ink/50 flex items-center gap-2">
            <span class="text-gold font-medium">¥{{ (g.costCents / 100).toFixed(2) }}</span>
            <span>·</span>
            <span>{{ g.durationMs }}ms</span>
            <span v-if="g.errorMsg" class="text-red-500 truncate" :title="g.errorMsg">· {{ g.errorMsg.slice(0, 24) }}</span>
          </div>
        </RouterLink>
        <div v-if="generations.length === 0" class="text-center py-6 text-ink/40">
          {{ emptyHint }}
        </div>
      </template>

      <!-- W6-R2/R3: brief 列表 -->
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
          <div class="font-medium text-ink/60 mb-1">💡 R3/R6 已上 ({{ scope }} · {{ focusMode ? 'focus=generations' : 'briefs' }})</div>
          <ul class="space-y-0.5 list-disc list-inside" v-if="scope === 'creator'">
            <li>RUN_VIDEO_GEN: 在 chat 触发 sora / kling / 即梦 / runway 生成</li>
            <li>RUN_BLUEPRINT_GEN: Face Blueprint Wizard 蓝图草稿</li>
            <li>SUBMIT_WORKSPACE: 提交工作区给买家审批</li>
            <li>WITHDRAW_BID: 撤回仍在 pending 的投标</li>
          </ul>
          <ul class="space-y-0.5 list-disc list-inside" v-else>
            <li>UPDATE_BRIEF / PUBLISH_BRIEF / CLOSE_BRIEF: 发包草稿编辑/发布/撤回</li>
            <li>APPROVE_WORKSPACE / REQUEST_REVISION: workspace 三态流</li>
            <li>REVIEW_DELIVERABLE: 通过/驳回创作者交付物</li>
            <li>RUN_VIDEO_GEN / RUN_BLUEPRINT_GEN: chat 内触发 AI 工具</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
