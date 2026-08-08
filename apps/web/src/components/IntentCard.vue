<script setup lang="ts">
/**
 * IntentCard — R2 把 intent+intentParams 渲染为 UI 卡片
 *
 * 设计:
 *   - 单组件, 按 message.intent 分支渲染对应卡片
 *   - requires_confirmation=true 的 intent (CREATE_BRIEF / ACCEPT_BID) 显示 [确认执行] [取消] 按钮
 *   - 用户点 [确认] → useIntentExecutor.execute(messageId, intent, params)
 *     成功后根据结果跳转: CREATE_BRIEF → /buyer/briefs/:briefId, ACCEPT_BID → /buyer/workspace/:workspaceId
 *   - 只读 intent (LIST_BRIEFS 等) 不在这里执行, 走 suggestedActions
 *
 * Buyer R2 覆盖 4 类:
 *   - CREATE_BRIEF (write) — 发包草稿卡片, [确认发包] 按钮
 *   - LIST_BRIEFS  (read)  — 引导跳 /buyer
 *   - ACCEPT_BID   (write) — 接受投标预览, [接受中标] 按钮
 *   - ASK_CLARIFICATION — 提示用户在 input 里直接回答
 *   - NAVIGATE (write-no-side-effect) — 直接跳转
 */
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import type { AssistantMessage } from '@/composables/useAssistant';
import { useIntentExecutor } from '@/composables/useIntentExecutor';
import { aiToolsApi, type VideoToolName } from '@/api/ai-tools';

const props = defineProps<{ message: AssistantMessage }>();

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const { execute } = useIntentExecutor();

/** R10.3 P2: 角色错位按钮过滤 — LIST_BRIEFS 的两个 CTA 按钮按角色显示,
 * 避免创作者在 chat 里被引导到 /buyer 控制台,反之亦然。 */
const isBuyerSession = computed(() => auth.isBuyer ?? false);
const isCreatorSession = computed(() => auth.isCreator ?? false);

const executing = computed(() => props.message.intentStatus === 'executing');
const success = computed(() => props.message.intentStatus === 'success');
const errored = computed(() => props.message.intentStatus === 'error');
const cancelled = computed(() => props.message.intentStatus === 'cancelled');

const intentLabel = computed(() => props.message.intent ?? '');
const params = computed(() => props.message.intentParams ?? {});

/** W6-R7: 嵌入式 intent — 跟踪当前用户是否已经点过"右屏打开"。
 * route.query.embed 一变 ("upload-ip" 或 "ip-library") 视为已激活,卡片状态切到 "✓ 已在右屏" 模式。
 * 也支持 mount 时自动打开 (延迟 800ms, 让用户先看到 LLM 回复) — 不点也会激活。 */
const embedOpened = ref(false);
let autoEmbedTimer: ReturnType<typeof setTimeout> | null = null;

const EMBED_INTENTS = new Set(['UPLOAD_IP', 'OPEN_IP_LIBRARY']);
const isEmbedIntent = computed(() => EMBED_INTENTS.has(props.message.intent ?? ''));
const expectedEmbedKey = computed(() => {
  if (props.message.intent === 'UPLOAD_IP') return 'upload-ip';
  if (props.message.intent === 'OPEN_IP_LIBRARY') return 'ip-library';
  return null;
});

function syncEmbedOpenedFromRoute() {
  if (!isEmbedIntent.value || !expectedEmbedKey.value) return;
  if (route.query.embed === expectedEmbedKey.value) {
    embedOpened.value = true;
  }
}

watch(() => route.query.embed, syncEmbedOpenedFromRoute);

async function openEmbedNow() {
  const embedRoute = pickEmbedRoute(props.message.intent);
  if (!embedRoute) return;
  await router.push({ path: embedRoute.path, query: embedRoute.query });
  // router.push 是异步的, query 真正更新在 watch 后才生效 — 这里手动乐观置 true
  embedOpened.value = true;
}

function scheduleAutoEmbed() {
  if (!isEmbedIntent.value) return;
  if (autoEmbedTimer) clearTimeout(autoEmbedTimer);
  autoEmbedTimer = setTimeout(() => {
    if (!embedOpened.value) {
      openEmbedNow().catch(() => {});
    }
  }, 800);
}
onBeforeUnmount(() => {
  if (autoEmbedTimer) clearTimeout(autoEmbedTimer);
});

function pickString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function pickNumber(v: unknown): string {
  return typeof v === 'number' ? String(v) : '';
}
function pickStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function ymd(v: string): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

/** W6-R6: 9 新 intent 的 post-success 路由 — 成功跳转逻辑集中 */
async function routeAfterSuccess(out: { kind: 'success'; briefId?: string; workspaceId?: string; generationRecordId?: string; toolName?: string } & Record<string, unknown>, intent: string | null | undefined) {
  if (!intent) return;
  if (out.briefId && intent === 'CREATE_BRIEF') {
    await router.push(`/buyer/briefs/${out.briefId}`);
  } else if (out.briefId && intent === 'UPDATE_BRIEF') {
    await router.push(`/buyer/briefs/${out.briefId}`);
  } else if (out.briefId && intent === 'PUBLISH_BRIEF') {
    await router.push(`/buyer/briefs/${out.briefId}`);
  } else if (out.briefId && intent === 'CLOSE_BRIEF') {
    await router.push(`/buyer/briefs/${out.briefId}`);
  } else if (out.workspaceId && intent === 'ACCEPT_BID') {
    await router.push(`/buyer/workspace/${out.workspaceId}`);
  } else if (out.workspaceId && intent === 'APPROVE_WORKSPACE') {
    await router.push(`/buyer/workspace/${out.workspaceId}`);
  } else if (out.workspaceId && intent === 'REQUEST_REVISION') {
    await router.push(`/buyer/workspace/${out.workspaceId}`);
  } else if (out.workspaceId && intent === 'SUBMIT_WORKSPACE') {
    await router.push(`/creator/workspace/${out.workspaceId}`);
  } else if (out.workspaceId && intent === 'RUN_VIDEO_GEN') {
    const qs = out.toolName ? `?tool=${encodeURIComponent(out.toolName)}&record=${encodeURIComponent(out.generationRecordId ?? '')}&focus=generations` : '?focus=generations';
    await router.push(`/creator/workspace/${out.workspaceId}${qs}`);
  } else if (out.generationRecordId && intent === 'RUN_BLUEPRINT_GEN') {
    await router.push(`/creator/blueprint/${out.generationRecordId}/step/1`);
  }
}

/** W6-R7: 嵌入式 intent — 不调接口,只触发右屏 embed 路由
 *   UPLOAD_IP      → /buyer/chat?embed=upload-ip(创作者: /creator/chat?embed=upload-ip)
 *   OPEN_IP_LIBRARY → /buyer/chat?embed=ip-library(创作者: /creator/chat?embed=ip-library)
 *   KYC_SUBMIT     → 跳 kyc 页面 (老路径,不嵌)
 * 全屏模式意图自动在 embed 路径上加 fullscreen=true
 */
function pickEmbedRoute(intent: string | null | undefined): { path: string; query: Record<string, string> } | null {
  if (!intent) return null;
  // 同一 chat 页路由根据当前 path 决定
  const path = window.location.pathname.startsWith('/creator') ? '/creator/chat' : '/buyer/chat';
  if (intent === 'UPLOAD_IP') return { path, query: { embed: 'upload-ip' } };
  if (intent === 'OPEN_IP_LIBRARY') return { path, query: { embed: 'ip-library' } };
  return null;
}

async function onConfirm() {
  // W6-R7: 嵌入式 intent 先把右屏切到 embed, 用户立刻看到表单/库, 再调 executor(no-op)
  const embedRoute = pickEmbedRoute(props.message.intent);
  if (embedRoute) {
    await router.push({ path: embedRoute.path, query: embedRoute.query });
  }
  const out = await execute(props.message.id, props.message.intent, props.message.intentParams);
  if (out.kind === 'success') {
    await routeAfterSuccess(out as any, props.message.intent);
  }
}

/** 用户手动点右上 ⛶ 全屏 — 在右屏已显示 embed 时再叠加 fullscreen=true */
async function openEmbedFullscreen() {
  const embedRoute = pickEmbedRoute(props.message.intent);
  if (!embedRoute) return;
  await router.push({ path: embedRoute.path, query: { ...embedRoute.query, fullscreen: 'true' } });
}

const errorReason = ref('');
async function onConfirmCaptureErr() {
  // W6-R7: 嵌入式 intent 先切右屏, 再调 executor
  const embedRoute = pickEmbedRoute(props.message.intent);
  if (embedRoute) {
    await router.push({ path: embedRoute.path, query: embedRoute.query });
  }
  const out = await execute(props.message.id, props.message.intent, props.message.intentParams);
  if (out.kind === 'error') errorReason.value = out.reason;
  else errorReason.value = '';
  if (out.kind === 'success') {
    await routeAfterSuccess(out as any, props.message.intent);
  }
}

/** W6-R6: RUN_VIDEO_GEN 预飞成本显示 — IntentCard 加载时调 preflight, 给按钮 label 加价 */
const preflightCost = ref<string | null>(null);
const toolLabelMap: Record<VideoToolName, string> = {
  sora: 'Sora',
  kling: 'Kling',
  jimeng: '即梦',
  runway: 'Runway',
};
onMounted(async () => {
  // W6-R7: 嵌入式 intent — 已经在右屏 embed (route.query.embed 一致) 视为已开;
  // 否则延迟 800ms 自动触发, 让用户先看到 LLM 回复, 再悄悄开右屏
  syncEmbedOpenedFromRoute();
  if (isEmbedIntent.value && !embedOpened.value) {
    scheduleAutoEmbed();
  }

  if (props.message.intent !== 'RUN_VIDEO_GEN') return;
  if (props.message.intentStatus !== 'idle') return;
  const wsId = pickString(props.message.intentParams?.workspaceId);
  const tn = pickString(props.message.intentParams?.toolName) as VideoToolName | '';
  if (!wsId || !tn) return;
  const durationSec = Number(props.message.intentParams?.durationSec ?? 0) || undefined;
  const imageCount = Number(props.message.intentParams?.imageCount ?? 0) || undefined;
  try {
    const { estimate } = await aiToolsApi.preflightVideo(wsId, tn as VideoToolName, { durationSec, imageCount });
    const cny = (estimate.costCents ?? 0) / 100;
    preflightCost.value = cny > 0 ? `¥${cny.toFixed(2)}` : '免费';
  } catch {
    preflightCost.value = null;
  }
});
</script>

<template>
  <div
    v-if="message.intent"
    class="mt-2 rounded-xl border bg-cream/70 dark:bg-surface-2/40 backdrop-blur px-3 py-2.5 text-xs"
    :class="[
      success ? 'border-success/40 bg-success/10 dark:bg-success/10' :
      errored ? 'border-danger/40 bg-danger/10 dark:bg-danger/10' :
      cancelled ? 'border-line opacity-60' :
      message.requiresConfirmation ? 'border-gold/40 bg-gold/10 dark:bg-gold/10' :
      'border-line',
    ]"
  >
    <!-- header: intent 名 + 状态徽章 -->
    <div class="flex items-center justify-between gap-2 mb-2">
      <span class="inline-flex items-center gap-1 text-[10px] font-medium">
        <span class="w-1.5 h-1.5 rounded-full" :class="success ? 'bg-success' : errored ? 'bg-danger' : cancelled ? 'bg-ink/30' : message.requiresConfirmation ? 'bg-gold animate-pulse' : 'bg-gold'"></span>
        <span class="text-ink/80">意图: {{ intentLabel }}<span v-if="message.requiresConfirmation" class="text-gold ml-1">(待确认)</span></span>
      </span>
      <span
        class="text-[10px] px-1.5 py-0.5 rounded-full"
        :class="[
          executing ? 'bg-ink/10 text-ink/70' :
          success ? 'bg-success/15 text-success dark:text-success' :
          errored ? 'bg-danger/15 text-danger dark:text-danger' :
          cancelled ? 'bg-ink/5 text-ink/40' :
          message.requiresConfirmation ? 'bg-gold/15 text-gold dark:text-gold' :
          'bg-gold/15 text-gold'
        ]"
      >
        {{
          executing ? '执行中…' :
          success ? '已完成' :
          errored ? '失败' :
          cancelled ? '已取消' :
          message.requiresConfirmation ? '需要你确认' :
          '可执行'
        }}
      </span>
    </div>

    <!-- CREATE_BRIEF -->
    <template v-if="message.intent === 'CREATE_BRIEF'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">标题</div><div class="font-medium">{{ pickString(params.title) || '—' }}</div>
        <div class="text-ink/50">类目</div><div>{{ pickString(params.category) || '—' }}</div>
        <div class="text-ink/50">平台</div>
        <div class="flex flex-wrap gap-1">
          <span v-for="p in pickStringArray(params.platformSet)" :key="p" class="px-1.5 py-0.5 rounded bg-line/40">{{ p }}</span>
          <span v-if="pickStringArray(params.platformSet).length === 0" class="text-ink/30">—</span>
        </div>
        <div class="text-ink/50">预算区间</div>
        <div>¥{{ pickNumber(params.budgetMin) || '0' }} – ¥{{ pickNumber(params.budgetMax) || '0' }}</div>
        <div class="text-ink/50">套餐</div><div>{{ pickString(params.packageTier) || '—' }}</div>
        <div class="text-ink/50">截止</div><div>{{ ymd(pickString(params.deadlineAt)) }}</div>
      </div>
      <div v-if="success && message.intentResult?.briefId" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ 发包已创建, 跳转中…
      </div>
    </template>

    <!-- ACCEPT_BID -->
    <template v-else-if="message.intent === 'ACCEPT_BID'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Brief</div><div class="font-mono text-[11px]">{{ pickString(params.briefId) || '—' }}</div>
        <div class="text-ink/50">Bid</div><div class="font-mono text-[11px]">{{ pickString(params.bidId) || '—' }}</div>
      </div>
      <p class="mt-2 text-[10px] text-ink/60">接受后将创建 workspace, 其他 bid 自动 rejected。</p>
      <div v-if="success && message.intentResult?.workspaceId" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ Workspace {{ message.intentResult.workspaceId }} 已创建, 跳转中…
      </div>
    </template>

    <!-- NAVIGATE -->
    <template v-else-if="message.intent === 'NAVIGATE'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">跳转</div><div class="font-mono text-[11px]">{{ pickString(params.route) || '—' }}</div>
      </div>
    </template>

    <!-- ASK_CLARIFICATION -->
    <template v-else-if="message.intent === 'ASK_CLARIFICATION'">
      <p class="text-ink/70 leading-relaxed">{{ pickString(params.question) || '（追问信息不足, 直接回复我下一步要问的）' }}</p>
      <p class="mt-1.5 text-[10px] text-ink/40">直接在下方输入框回复, 我会继续追问或执行。</p>
    </template>

    <!-- LIST_BRIEFS (R2 不在这里执行, 引导看侧栏 /buyer 或任务板 /creator/tasks) -->
    <template v-else-if="message.intent === 'LIST_BRIEFS'">
      <p class="text-ink/70">点击下方按钮打开可接发包列表或买家控制台。</p>
      <div class="mt-2 flex gap-2">
        <!-- R10.3 P2: 按角色过滤 CTA — 创作者 session 不显示买家控制台按钮,反之亦然 -->
        <button
          v-if="isBuyerSession"
          class="text-[10px] px-2 py-1 rounded-full border border-gold/40 text-gold hover:bg-gold hover:text-ink transition"
          @click="router.push('/buyer')"
        >
          买家控制台 →
        </button>
        <button
          v-if="isCreatorSession"
          class="text-[10px] px-2 py-1 rounded-full border border-gold/40 text-gold hover:bg-gold hover:text-ink transition"
          @click="router.push('/creator/briefs')"
        >
          可接发包 →
        </button>
      </div>
    </template>

    <!-- 其它只读 (SHOW_BID / OPEN_WORKSPACE / SHOW_WORKSPACE_STATUS) -->
    <template v-else-if="['SHOW_BID', 'OPEN_WORKSPACE', 'SHOW_WORKSPACE_STATUS'].includes(message.intent)">
      <p class="text-ink/60">点上方 suggested action 按钮查看详情。</p>
    </template>

    <!-- W6-R5: CLOSE_BRIEF — 买家撤回/关闭发包 -->
    <template v-else-if="message.intent === 'CLOSE_BRIEF'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Brief</div><div class="font-mono text-[11px]">{{ pickString(params.briefId) || '—' }}</div>
        <div v-if="pickString(params.reason)" class="text-ink/50">原因</div>
        <div v-if="pickString(params.reason)" class="whitespace-pre-wrap break-words">{{ pickString(params.reason) }}</div>
      </div>
      <p class="mt-2 text-[10px] text-danger dark:text-danger font-medium">
        ⚠ 关闭后无法恢复, 已投标的创作者会收到通知。
      </p>
      <div v-if="success" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ 发包已关闭
      </div>
    </template>

    <!-- R3 Creator: PLACE_BID (投标) -->
    <template v-else-if="message.intent === 'PLACE_BID'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Brief</div><div class="font-mono text-[11px]">{{ pickString(params.briefId) || '—' }}</div>
        <div class="text-ink/50">报价</div><div class="font-medium">¥{{ pickNumber(params.price) || '0' }}</div>
        <div class="text-ink/50">交付天数</div><div>{{ pickNumber(params.deliveryDays) || '—' }} 天</div>
        <div class="text-ink/50">提案摘要</div>
        <div class="whitespace-pre-wrap break-words line-clamp-3">{{ pickString(params.proposal) || '—' }}</div>
      </div>
      <div v-if="success" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ 投标已提交, 等待买家反馈
      </div>
    </template>

    <!-- R3 Creator: UPLOAD_DELIVERABLE -->
    <template v-else-if="message.intent === 'UPLOAD_DELIVERABLE'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Workspace</div><div class="font-mono text-[11px]">{{ pickString(params.workspaceId) || '—' }}</div>
        <div class="text-ink/50">类型</div><div>{{ pickString(params.type) || '—' }}</div>
        <div class="text-ink/50">平台</div><div>{{ pickString(params.platform) || '—' }}</div>
        <div class="text-ink/50">链接</div>
        <a v-if="pickString(params.url)" :href="pickString(params.url)" target="_blank" rel="noopener" class="text-blue-600 dark:text-blue-400 hover:underline break-all text-[11px]">
          {{ pickString(params.url).slice(0, 48) }}{{ pickString(params.url).length > 48 ? '...' : '' }}
        </a>
        <div v-else class="text-ink/30">—</div>
      </div>
      <p class="mt-2 text-[10px] text-ink/50">提交后将进入买家审批 (pending → approved / rejected)。</p>
      <div v-if="success" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ 交付物已上传, 等待买家审批
      </div>
    </template>

    <!-- R3 Creator: CREATE_REVIEW (creator_to_buyer) -->
    <template v-else-if="message.intent === 'CREATE_REVIEW'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Brief</div><div class="font-mono text-[11px]">{{ pickString(params.briefId) || '—' }}</div>
        <div class="text-ink/50">评分</div>
        <div class="flex items-center gap-0.5">
          <span v-for="n in 5" :key="n" :class="n <= Number(pickNumber(params.rating) || 0) ? 'text-gold' : 'text-ink/20'">★</span>
          <span class="ml-1.5 text-[10px] text-ink/50">{{ pickNumber(params.rating) || '—' }}/5</span>
        </div>
        <div class="text-ink/50">评价</div>
        <div class="whitespace-pre-wrap break-words">{{ pickString(params.content) || '—' }}</div>
        <div v-if="pickStringArray(params.tags).length > 0" class="text-ink/50">标签</div>
        <div v-if="pickStringArray(params.tags).length > 0" class="flex flex-wrap gap-1">
          <span v-for="t in pickStringArray(params.tags)" :key="t" class="px-1.5 py-0.5 rounded bg-line/40">{{ t }}</span>
        </div>
      </div>
      <p class="mt-2 text-[10px] text-ink/50">评价将公开挂在你和买家主页。</p>
      <div v-if="success" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ 评价已写入, 影响对方信用分
      </div>
    </template>

    <!-- W6-R6 Tier 1: UPDATE_BRIEF (改发包) -->
    <template v-else-if="message.intent === 'UPDATE_BRIEF'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Brief</div><div class="font-mono text-[11px]">{{ pickString(params.id) || '—' }}</div>
        <template v-if="pickString(params.title)">
          <div class="text-ink/50">标题</div><div class="font-medium">{{ pickString(params.title) }}</div>
        </template>
        <template v-if="pickString(params.description)">
          <div class="text-ink/50">描述</div><div class="whitespace-pre-wrap break-words line-clamp-2">{{ pickString(params.description) }}</div>
        </template>
        <template v-if="pickStringArray(params.platformSet).length > 0">
          <div class="text-ink/50">平台</div>
          <div class="flex flex-wrap gap-1">
            <span v-for="p in pickStringArray(params.platformSet)" :key="p" class="px-1.5 py-0.5 rounded bg-line/40">{{ p }}</span>
          </div>
        </template>
        <template v-if="params.budgetMin !== undefined || params.budgetMax !== undefined">
          <div class="text-ink/50">预算</div>
          <div>¥{{ pickNumber(params.budgetMin) || '?' }} – ¥{{ pickNumber(params.budgetMax) || '?' }}</div>
        </template>
        <template v-if="pickString(params.packageTier)">
          <div class="text-ink/50">套餐</div><div>{{ pickString(params.packageTier) }}</div>
        </template>
        <template v-if="pickString(params.deadlineAt)">
          <div class="text-ink/50">截止</div><div>{{ ymd(pickString(params.deadlineAt)) }}</div>
        </template>
      </div>
      <div v-if="success" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ 发包已更新, 跳转中…
      </div>
    </template>

    <!-- W6-R6 Tier 1: PUBLISH_BRIEF (发布草稿) -->
    <template v-else-if="message.intent === 'PUBLISH_BRIEF'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Brief</div><div class="font-mono text-[11px]">{{ pickString(params.id) || '—' }}</div>
      </div>
      <p class="mt-2 text-[10px] text-ink/60">将 draft 转为 bidding, 公开后可被创作者投标。</p>
      <div v-if="success" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ 已发布, 跳转中…
      </div>
    </template>

    <!-- W6-R6 Tier 1: WITHDRAW_BID (创作者撤回投标) -->
    <template v-else-if="message.intent === 'WITHDRAW_BID'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Brief</div><div class="font-mono text-[11px]">{{ pickString(params.briefId) || '—' }}</div>
        <div class="text-ink/50">Bid</div><div class="font-mono text-[11px]">{{ pickString(params.bidId) || '—' }}</div>
      </div>
      <p class="mt-2 text-[10px] text-danger dark:text-danger font-medium">
        ⚠ 若 bid 已被买家接受, 需先和买家沟通再走 workspace 流程。
      </p>
      <div v-if="success" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ 投标已撤回
      </div>
    </template>

    <!-- W6-R6 Tier 1: SUBMIT_WORKSPACE (创作者提交) -->
    <template v-else-if="message.intent === 'SUBMIT_WORKSPACE'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Workspace</div><div class="font-mono text-[11px]">{{ pickString(params.id) || pickString(params.workspaceId) || '—' }}</div>
      </div>
      <p class="mt-2 text-[10px] text-ink/60">提交后进入买家审批环节, 可被通过 / 打回。</p>
      <div v-if="success" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ Workspace 已提交, 跳转中…
      </div>
    </template>

    <!-- W6-R6 Tier 1: APPROVE_WORKSPACE (买家通过) -->
    <template v-else-if="message.intent === 'APPROVE_WORKSPACE'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Workspace</div><div class="font-mono text-[11px]">{{ pickString(params.id) || pickString(params.workspaceId) || '—' }}</div>
      </div>
      <p class="mt-2 text-[10px] text-success dark:text-success">通过后, 工作区进入 approved, 进入交付阶段。</p>
      <div v-if="success" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ Workspace 已通过, 跳转中…
      </div>
    </template>

    <!-- W6-R6 Tier 1: REQUEST_REVISION (买家打回) -->
    <template v-else-if="message.intent === 'REQUEST_REVISION'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Workspace</div><div class="font-mono text-[11px]">{{ pickString(params.id) || pickString(params.workspaceId) || '—' }}</div>
        <template v-if="pickString(params.reason)">
          <div class="text-ink/50">打回原因</div>
          <div class="whitespace-pre-wrap break-words">{{ pickString(params.reason) }}</div>
        </template>
      </div>
      <div v-if="success" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ 已打回, revisionCount+1, 跳转中…
      </div>
    </template>

    <!-- W6-R6 Tier 1: REVIEW_DELIVERABLE (买家审批交付物 — decision 字段决定 chip 颜色) -->
    <template v-else-if="message.intent === 'REVIEW_DELIVERABLE'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Deliverable</div><div class="font-mono text-[11px]">{{ pickString(params.deliverableId) || '—' }}</div>
        <div class="text-ink/50">决策</div>
        <div>
          <span
            class="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium"
            :class="pickString(params.decision) === 'approved' ? 'bg-success/15 text-success dark:text-success' : 'bg-danger/15 text-danger dark:text-danger'"
          >
            {{ pickString(params.decision) === 'approved' ? '✓ 通过' : '✗ 驳回' }}
          </span>
        </div>
        <template v-if="pickString(params.decision) === 'rejected' && pickString(params.rejectedReason)">
          <div class="text-ink/50">驳回理由</div>
          <div class="whitespace-pre-wrap break-words">{{ pickString(params.rejectedReason) }}</div>
        </template>
      </div>
      <div v-if="success" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ 审批完成
      </div>
    </template>

    <!-- W6-R6 Tier 4: RUN_VIDEO_GEN (AI 视频/图片生成) -->
    <template v-else-if="message.intent === 'RUN_VIDEO_GEN'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Workspace</div><div class="font-mono text-[11px]">{{ pickString(params.workspaceId) || '—' }}</div>
        <div class="text-ink/50">工具</div>
        <div>
          <span class="inline-block text-[10px] px-2 py-0.5 rounded-full bg-gold/15 text-gold font-medium">
            {{ toolLabelMap[pickString(params.toolName) as VideoToolName] || pickString(params.toolName) || '—' }}
          </span>
        </div>
        <template v-if="preflightCost">
          <div class="text-ink/50">预估成本</div>
          <div class="font-medium text-gold">{{ preflightCost }}</div>
        </template>
        <div class="text-ink/50">Prompt</div>
        <div class="whitespace-pre-wrap break-words line-clamp-3">{{ pickString(params.prompt) || '—' }}</div>
        <template v-if="params.durationSec || params.resolution || params.imageCount">
          <div class="text-ink/50">参数</div>
          <div class="text-[10px] text-ink/60 flex flex-wrap gap-2">
            <span v-if="params.durationSec">时长 {{ pickNumber(params.durationSec) }}s</span>
            <span v-if="params.resolution">分辨率 {{ pickString(params.resolution) }}</span>
            <span v-if="params.imageCount">图片 {{ pickNumber(params.imageCount) }}</span>
          </div>
        </template>
      </div>
      <p class="mt-2 text-[10px] text-ink/60">生成会消耗 API 额度, 确认后不可取消。</p>
      <div v-if="success && message.intentResult?.generationRecordId" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ 生成完成, 跳转 AI 记录列表…
      </div>
    </template>

    <!-- W6-R6 Tier 4: RUN_BLUEPRINT_GEN (人脸蓝图生成) -->
    <template v-else-if="message.intent === 'RUN_BLUEPRINT_GEN'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Prompt</div>
        <div class="whitespace-pre-wrap break-words line-clamp-3">{{ pickString(params.prompt) || '—' }}</div>
        <template v-if="pickString(params.title)">
          <div class="text-ink/50">标题</div><div>{{ pickString(params.title) }}</div>
        </template>
        <template v-if="pickStringArray(params.tags).length > 0">
          <div class="text-ink/50">标签</div>
          <div class="flex flex-wrap gap-1">
            <span v-for="t in pickStringArray(params.tags)" :key="t" class="px-1.5 py-0.5 rounded bg-line/40">{{ t }}</span>
          </div>
        </template>
      </div>
      <p class="mt-2 text-[10px] text-ink/60">将创建蓝图草稿, 进入下一步骤编辑。</p>
      <div v-if="success" class="mt-2 text-[10px] text-success dark:text-success">
        ✓ 蓝图已创建, 跳转步骤 1…
      </div>
    </template>

    <!-- W6-R7: UPLOAD_IP — 嵌入式意图。
         之前 onConfirm 只在写操作的 [确认执行] 路径上跑,但 UPLOAD_IP/OPEN_IP_LIBRARY 这类
         嵌入式意图的右屏切换必须让用户主动点一下才会触发 — 加显式 primary 按钮 + 自动 mount-time 触发
         (用户没点也 800ms 后开), 不能只靠 "右屏已打开" 让人猜 -->
    <template v-else-if="message.intent === 'UPLOAD_IP'">
      <p class="text-ink/70 leading-relaxed">
        <strong>IP 上传向导</strong> 可在右屏直接打开 — 填名称、小传、风格与素材上传。
      </p>
      <ul v-if="pickString(params.displayName) || pickString(params.description) || pickStringArray(params.styleTags).length > 0" class="mt-2 space-y-0.5 text-[10px] text-ink/60">
        <li v-if="pickString(params.displayName)">预设名称: <span class="text-ink/80">{{ pickString(params.displayName) }}</span></li>
        <li v-if="pickStringArray(params.styleTags).length > 0">预设风格: <span v-for="s in pickStringArray(params.styleTags)" :key="s" class="mr-1 px-1 rounded bg-line/40">{{ s }}</span></li>
        <li v-if="pickString(params.tagline)">预设简介: <span class="text-ink/80">{{ pickString(params.tagline) }}</span></li>
      </ul>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button
          v-if="!embedOpened"
          type="button"
          class="text-[11px] px-3 py-1.5 rounded-lg bg-gold text-ink font-medium hover:bg-gold/80 transition"
          @click="openEmbedNow"
        >
          📂 在右屏打开
        </button>
        <span v-else class="text-[11px] px-2 py-1 rounded-full bg-success/15 text-success dark:text-success">✓ 已在右屏</span>
        <button
          v-if="embedOpened"
          type="button"
          class="text-[11px] px-2.5 py-1 rounded-lg border border-line text-ink/60 hover:border-gold hover:text-gold transition"
          @click="openEmbedFullscreen()"
        >
          ⛶ 全屏编辑
        </button>
      </div>
    </template>

    <!-- W6-R7: OPEN_IP_LIBRARY — 嵌入式意图, 同 UPLOAD_IP 模式 -->
    <template v-else-if="message.intent === 'OPEN_IP_LIBRARY'">
      <p class="text-ink/70 leading-relaxed">
        <strong>形象库</strong> 已在右屏 — 可按 <span class="text-gold">类别 / 风格 / 价格 / 创作者名</span> 筛选浏览。
      </p>
      <ul v-if="pickString(params.category) || pickStringArray(params.styleTags).length > 0 || pickString(params.creatorName)" class="mt-2 space-y-0.5 text-[10px] text-ink/60">
        <li v-if="pickString(params.category)">预设类别: <span class="text-ink/80">{{ pickString(params.category) }}</span></li>
        <li v-if="pickStringArray(params.styleTags).length > 0">预设风格: <span v-for="s in pickStringArray(params.styleTags)" :key="s" class="mr-1 px-1 rounded bg-line/40">{{ s }}</span></li>
        <li v-if="pickString(params.creatorName)">创作者: <span class="text-ink/80">{{ pickString(params.creatorName) }}</span></li>
      </ul>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button
          v-if="!embedOpened"
          type="button"
          class="text-[11px] px-3 py-1.5 rounded-lg bg-gold text-ink font-medium hover:bg-gold/80 transition"
          @click="openEmbedNow"
        >
          📂 在右屏打开
        </button>
        <span v-else class="text-[11px] px-2 py-1 rounded-full bg-success/15 text-success dark:text-success">✓ 已在右屏</span>
        <button
          v-if="embedOpened"
          type="button"
          class="text-[11px] px-2.5 py-1 rounded-lg border border-line text-ink/60 hover:border-gold hover:text-gold transition"
          @click="openEmbedFullscreen()"
        >
          ⛶ 全屏浏览
        </button>
      </div>
    </template>

    <!-- 其它写 (creator-only 或 R3 处理) -->
    <template v-else>
      <p class="text-ink/60">此操作由 R3 (Creator) 接管。R2 buyer chat 不执行。</p>
    </template>

    <!-- 错误信息 -->
    <div v-if="errored" class="mt-2 text-[10px] text-danger dark:text-danger">
      {{ errorReason || '执行失败, 请稍后再试' }}
    </div>

    <!-- 操作按钮 (写操作 + 未执行过) -->
    <div
      v-if="message.requiresConfirmation && !success && !cancelled"
      class="mt-2.5 flex items-center gap-2"
    >
      <button
        @click="onConfirmCaptureErr"
        :disabled="executing"
        class="text-[11px] px-3 py-1.5 rounded-lg bg-ink text-cream hover:bg-gold transition disabled:opacity-50"
      >
        {{ executing
          ? '执行中…'
          : message.intent === 'RUN_VIDEO_GEN' && preflightCost
            ? `确认执行 ${preflightCost}`
            : '确认执行' }}
      </button>
      <button
        @click="execute(message.id, null, undefined)"
        :disabled="executing"
        class="text-[11px] px-3 py-1.5 rounded-lg border border-line hover:bg-line/40 transition disabled:opacity-50"
      >
        取消
      </button>
    </div>
  </div>
</template>
