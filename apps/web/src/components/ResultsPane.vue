<script setup lang="ts">
/**
 * ResultsPane — 右栏, 上下文工作台/AI 工具渲染区
 *
 * W6-R2 Buyer: 最近发包列表 (自己的)
 * W6-R3 Creator: 可接发包列表 (公开 bidding)
 * W6-R6 Tier 4: 当 route.query.focus === 'generations' 时, 切换为 AI 生成记录列表
 *   (RUN_VIDEO_GEN 成功后跳 /creator/workspace/:id?focus=generations 触发)
 *
 * W6-R7 embed 模式:
 *   - route.query.embed === 'upload-ip'    → 嵌入 IpWizard 步骤 1 (创作者)
 *   - route.query.embed === 'ip-library'   → 嵌入 IpListPage (?embed=ip-library)
 *
 * 接受 `scope` prop:
 *   - 'buyer' (默认): 列我的发包
 *   - 'creator': 列可接发包
 */
import { onMounted, ref, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { buyerBriefsApi } from '@/api/briefs';
import type { BriefSummary } from '@/api/briefs';
import { aiToolsApi, type GenerationRecord } from '@/api/ai-tools';
import IpListPage from '@/pages/IpListPage.vue';

interface Props {
  scope?: 'buyer' | 'creator';
}
const props = withDefaults(defineProps<Props>(), { scope: 'buyer' });

const route = useRoute();
const router = useRouter();
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

/** W6-R7: embed 模式判定 */
const embedMode = computed<'upload-ip' | 'ip-library' | null>(() => {
  const e = route.query.embed;
  if (e === 'upload-ip') return 'upload-ip';
  if (e === 'ip-library') return 'ip-library';
  return null;
});
const isFullscreen = computed(() => route.query.fullscreen === 'true');

/** W6-R7: 顶部全屏 / 返回按钮 — 保留 chat 区可见时不显示, fullscreen 时显示"返回" */
function goFullscreen() {
  const q: Record<string, string> = { ...route.query as Record<string, string>, fullscreen: 'true' };
  router.push({ query: q });
}
function exitEmbed() {
  // 清掉 embed + fullscreen 两个 query, 留其它 (e.g. focus)
  const q = { ...route.query };
  delete q.embed;
  delete q.fullscreen;
  router.push({ query: q });
}

async function load() {
  // W6-R7: embed 模式不 fetch briefs/generations — 由子组件自己 fetch
  if (embedMode.value) {
    loading.value = false;
    return;
  }
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
  if (embedMode.value === 'upload-ip') return '新建 IP';
  if (embedMode.value === 'ip-library') return '形象库';
  if (focusMode.value) return 'AI 生成记录';
  return props.scope === 'creator' ? '可接发包' : '我的发包';
});
const subtitle = computed(() => {
  if (embedMode.value === 'upload-ip') return '填写基础信息 + 上传资产包';
  if (embedMode.value === 'ip-library') return '按 类别 / 风格 / 价格 / 创作者 筛选';
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
    ? 'bg-success/15 text-success dark:text-success'
    : s === 'failed'
    ? 'bg-danger/15 text-danger dark:text-danger'
    : 'bg-gold/15 text-gold dark:text-gold';
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
  <div class="h-full flex flex-col bg-cream dark:bg-ink">
    <div class="px-4 py-2.5 border-b hairline border-line dark:border-cream/15 bg-cream dark:bg-ink flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="text-sm font-medium">{{ title }}</div>
        <div class="text-[10px] text-ink/50 dark:text-ink/40 mt-0.5">{{ subtitle }}</div>
      </div>
      <!-- W6-R7: embed 模式顶栏按钮 — 全屏 / 返回 -->
      <div v-if="embedMode" class="flex items-center gap-1.5 shrink-0">
        <button
          v-if="!isFullscreen"
          type="button"
          @click="goFullscreen"
          class="text-[10px] px-2 py-1 rounded-r8-sm border hairline border-line dark:border-cream/30 text-ink/60 dark:text-cream/60 hover:border-gold hover:text-gold transition"
          title="全屏编辑 (隐藏左/中栏, 仅留右屏)"
        >⛶ 全屏</button>
        <button
          type="button"
          @click="exitEmbed"
          class="text-[10px] px-2 py-1 rounded-r8-sm border hairline border-line dark:border-cream/30 text-ink/60 dark:text-cream/60 hover:border-danger hover:text-danger transition"
          title="关闭右屏内容, 回到默认工作台"
        >✕ 返回</button>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto px-3 py-3 space-y-2 text-xs">
      <div v-if="loading" class="text-ink/50 dark:text-ink/40 text-center py-6">加载中…</div>
      <div v-else-if="error" class="text-danger text-center py-6">{{ error }}</div>

      <!-- W6-R7: embed=ip-library — 复用 IpListPage (已有 embed 模式 + 4 维筛选) -->
      <IpListPage
        v-else-if="embedMode === 'ip-library'"
        :embed-mode="true"
      />

      <!-- W6-R7: embed=upload-ip — 嵌入 IP 上传向导(只创作者可见; 买家点这个会提示) -->
      <div v-else-if="embedMode === 'upload-ip'" class="space-y-3">
        <div v-if="props.scope === 'creator'" class="rounded-r8-md overflow-hidden border hairline border-line dark:border-cream/20">
          <RouterLink
            to="/creator/ips/new?embed=upload-ip"
            target="_blank"
            class="block p-4 bg-surface dark:bg-ink/40 hover:bg-cream/40 dark:hover:bg-ink transition"
          >
            <div class="text-sm font-medium mb-1">📝 在向导里打开 (新标签页)</div>
            <div class="text-[10px] text-ink/60 dark:text-ink/50">完整 3 步上传 (基础信息 → 资产包 → 预览提交)。在右屏仅展示"已打开"提示, 不阻塞 chat 流。</div>
          </RouterLink>
          <div class="px-4 py-3 border-t hairline border-line dark:border-cream/20 bg-cream/30 dark:bg-ink/40 text-[10px] text-ink/60 dark:text-ink/50 leading-relaxed">
            ✨ 提示: 右屏已打开 IP 上传入口。也可以直接在左侧 chat 说"上传新 IP 名叫 XX",
            让 AI 帮你预填后再继续。
          </div>
        </div>
        <div v-else class="p-6 bg-cream/60 dark:bg-ink/40 rounded-r8-md text-center">
          <div class="text-base mb-2">🔒</div>
          <p class="text-sm text-ink/70 dark:text-cream/70 mb-1">当前账号不是创作者</p>
          <p class="text-[10px] text-ink/50 dark:text-ink/40">上传 IP 需要 <RouterLink to="/creator" class="text-gold hover:underline">创作者入驻</RouterLink>。买家可在 chat 输入"看形象库"浏览公开 IP。</p>
        </div>
      </div>

      <!-- W6-R6: AI 生成记录列表 -->
      <template v-else-if="focusMode">
        <RouterLink
          v-for="g in generations"
          :key="g.id"
          :to="`/creator/workspace/${workspaceIdFromQuery}?tool=${encodeURIComponent(g.toolName)}&record=${encodeURIComponent(g.id)}&focus=generations`"
          class="block border hairline border-line dark:border-cream/20 rounded-r8-md p-2.5 bg-surface dark:bg-ink/40 hover:border-gold transition"
        >
          <div class="flex items-start justify-between gap-2">
            <span class="font-medium hover:text-gold transition leading-snug line-clamp-2">{{ g.prompt || '(无 prompt)' }}</span>
            <div class="flex items-center gap-1 shrink-0">
              <span class="text-[9px] px-1.5 py-0.5 rounded-r8-sm bg-gold/15 text-gold">
                {{ toolBadgeMap[g.toolName] ?? g.toolName }}
              </span>
              <span
                class="text-[9px] px-1.5 py-0.5 rounded-r8-sm"
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
          <div class="mt-1 text-[10px] text-ink/50 dark:text-ink/40 flex items-center gap-2">
            <span class="text-gold font-medium">¥{{ (g.costCents / 100).toFixed(2) }}</span>
            <span>·</span>
            <span>{{ g.durationMs }}ms</span>
            <span v-if="g.errorMsg" class="text-danger truncate" :title="g.errorMsg">· {{ g.errorMsg.slice(0, 24) }}</span>
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
          class="block border hairline border-line dark:border-cream/20 rounded-r8-md p-2.5 bg-surface dark:bg-ink/40 hover:border-gold transition"
        >
          <div class="flex items-start justify-between gap-2">
            <span class="font-medium hover:text-gold transition leading-snug">{{ b.title }}</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded-r8-sm bg-gold/15 text-gold shrink-0">{{ b.status }}</span>
          </div>
          <div class="mt-1 text-[10px] text-ink/50 dark:text-ink/40 flex items-center gap-2">
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

      <div class="mt-6 pt-4 border-t hairline border-line dark:border-cream/15">
        <div class="text-[10px] text-ink/40 dark:text-ink/35 leading-relaxed">
          <div class="font-medium text-ink/60 dark:text-ink/50 mb-1">💡 R3/R6 已上 ({{ scope }} · {{ focusMode ? 'focus=generations' : 'briefs' }})</div>
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
