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
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AssistantMessage } from '@/composables/useAssistant';
import { useIntentExecutor } from '@/composables/useIntentExecutor';

const props = defineProps<{ message: AssistantMessage }>();

const router = useRouter();
const { execute } = useIntentExecutor();

const executing = computed(() => props.message.intentStatus === 'executing');
const success = computed(() => props.message.intentStatus === 'success');
const errored = computed(() => props.message.intentStatus === 'error');
const cancelled = computed(() => props.message.intentStatus === 'cancelled');

const intentLabel = computed(() => props.message.intent ?? '');
const params = computed(() => props.message.intentParams ?? {});

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

async function onConfirm() {
  const out = await execute(props.message.id, props.message.intent, props.message.intentParams);
  if (out.kind === 'success') {
    if (out.briefId && props.message.intent === 'CREATE_BRIEF') {
      await router.push(`/buyer/briefs/${out.briefId}`);
    } else if (out.workspaceId && props.message.intent === 'ACCEPT_BID') {
      await router.push(`/buyer/workspace/${out.workspaceId}`);
    }
  }
}

const errorReason = ref('');
async function onConfirmCaptureErr() {
  const out = await execute(props.message.id, props.message.intent, props.message.intentParams);
  if (out.kind === 'error') errorReason.value = out.reason;
  else errorReason.value = '';
  if (out.kind === 'success') {
    if (out.briefId && props.message.intent === 'CREATE_BRIEF') {
      await router.push(`/buyer/briefs/${out.briefId}`);
    } else if (out.workspaceId && props.message.intent === 'ACCEPT_BID') {
      await router.push(`/buyer/workspace/${out.workspaceId}`);
    }
  }
}
</script>

<template>
  <div
    v-if="message.intent"
    class="mt-2 rounded-xl border bg-cream/70 dark:bg-surface-2/40 backdrop-blur px-3 py-2.5 text-xs"
    :class="[
      success ? 'border-green-500/40 bg-green-50 dark:bg-green-900/10' :
      errored ? 'border-red-400/40 bg-red-50 dark:bg-red-900/10' :
      cancelled ? 'border-line opacity-60' :
      message.requiresConfirmation ? 'border-amber-400/50 bg-amber-50 dark:bg-amber-900/10' :
      'border-line',
    ]"
  >
    <!-- header: intent 名 + 状态徽章 -->
    <div class="flex items-center justify-between gap-2 mb-2">
      <span class="inline-flex items-center gap-1 text-[10px] font-medium">
        <span class="w-1.5 h-1.5 rounded-full" :class="success ? 'bg-green-500' : errored ? 'bg-red-500' : cancelled ? 'bg-ink/30' : message.requiresConfirmation ? 'bg-amber-500 animate-pulse' : 'bg-gold'"></span>
        <span class="text-ink/80">意图: {{ intentLabel }}<span v-if="message.requiresConfirmation" class="text-amber-600 ml-1">(待确认)</span></span>
      </span>
      <span
        class="text-[10px] px-1.5 py-0.5 rounded-full"
        :class="[
          executing ? 'bg-ink/10 text-ink/70' :
          success ? 'bg-green-500/15 text-green-700 dark:text-green-400' :
          errored ? 'bg-red-500/15 text-red-700 dark:text-red-400' :
          cancelled ? 'bg-ink/5 text-ink/40' :
          message.requiresConfirmation ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' :
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
      <div v-if="success && message.intentResult?.briefId" class="mt-2 text-[10px] text-green-700 dark:text-green-400">
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
      <div v-if="success && message.intentResult?.workspaceId" class="mt-2 text-[10px] text-green-700 dark:text-green-400">
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
        <button
          class="text-[10px] px-2 py-1 rounded-full border border-gold/40 text-gold hover:bg-gold hover:text-ink transition"
          @click="router.push('/buyer')"
        >
          买家控制台 →
        </button>
        <button
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

    <!-- R3 Creator: PLACE_BID (投标) -->
    <template v-else-if="message.intent === 'PLACE_BID'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Brief</div><div class="font-mono text-[11px]">{{ pickString(params.briefId) || '—' }}</div>
        <div class="text-ink/50">报价</div><div class="font-medium">¥{{ pickNumber(params.price) || '0' }}</div>
        <div class="text-ink/50">交付天数</div><div>{{ pickNumber(params.deliveryDays) || '—' }} 天</div>
        <div class="text-ink/50">提案摘要</div>
        <div class="whitespace-pre-wrap break-words line-clamp-3">{{ pickString(params.proposal) || '—' }}</div>
      </div>
      <div v-if="success" class="mt-2 text-[10px] text-green-700 dark:text-green-400">
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
      <div v-if="success" class="mt-2 text-[10px] text-green-700 dark:text-green-400">
        ✓ 交付物已上传, 等待买家审批
      </div>
    </template>

    <!-- R3 Creator: CREATE_REVIEW (creator_to_buyer) -->
    <template v-else-if="message.intent === 'CREATE_REVIEW'">
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink/80">
        <div class="text-ink/50">Brief</div><div class="font-mono text-[11px]">{{ pickString(params.briefId) || '—' }}</div>
        <div class="text-ink/50">评分</div>
        <div class="flex items-center gap-0.5">
          <span v-for="n in 5" :key="n" :class="n <= Number(pickNumber(params.rating) || 0) ? 'text-amber-500' : 'text-ink/20'">★</span>
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
      <div v-if="success" class="mt-2 text-[10px] text-green-700 dark:text-green-400">
        ✓ 评价已写入, 影响对方信用分
      </div>
    </template>

    <!-- 其它写 (creator-only 或 R3 处理) -->
    <template v-else>
      <p class="text-ink/60">此操作由 R3 (Creator) 接管。R2 buyer chat 不执行。</p>
    </template>

    <!-- 错误信息 -->
    <div v-if="errored" class="mt-2 text-[10px] text-red-600 dark:text-red-400">
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
        {{ executing ? '执行中…' : '确认执行' }}
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
