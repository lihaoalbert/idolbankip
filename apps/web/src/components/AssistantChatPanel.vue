<script setup lang="ts">
/**
 * AssistantChatPanel — 整页对话的中栏内容
 *
 * W6-R2: 从 AssistantPage / FloatingChat 抽出来复用。
 * 接受 variant prop 控制密度:
 *   - 'panel' (默认) — 完整 header, 适合 BuyerChatPage 主屏
 *   - 'full' — AssistantPage 整页版 (大屏, 历史可滚动)
 */
import { ref, computed, nextTick, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAssistant } from '@/composables/useAssistant';
import { useAuthStore } from '@/stores/auth';
import IntentCard from '@/components/IntentCard.vue';

interface Props {
  variant?: 'panel' | 'full';
}
withDefaults(defineProps<Props>(), { variant: 'panel' });

const auth = useAuthStore();
const router = useRouter();
const { messages, loading, error, canSend, sendMessage, clearMessages, goToAction } = useAssistant();

const input = ref('');
const scrollRef = ref<HTMLElement | null>(null);

const isCreator = computed(() => auth.user?.roles?.includes('CREATOR'));
const isBuyer = computed(() => auth.user?.roles?.includes('BUYER'));

const quickPrompts = computed(() => {
  if (isCreator.value) {
    return [
      '我的 KYC 被拒了, 怎么办?',
      'IpWizard 资产包缺什么图?',
      'IP 被审核驳回, 怎么改?',
      '任务板怎么挑档位?',
      'API Key 泄露了怎么办?',
    ];
  }
  if (isBuyer.value) {
    return [
      '4 档授权我该买哪档?',
      '合同条款看不懂',
      '我的订单卡住了, 下一步?',
      '下载文件失败了',
      '想批量采购怎么联系?',
    ];
  }
  return ['你好, 你能帮我什么?'];
});

async function submit() {
  const text = input.value.trim();
  if (!text || loading.value) return;
  input.value = '';
  await sendMessage(text);
  scrollToBottom();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
  });
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function handleAction(href: string) {
  goToAction(href);
}

watch(messages, scrollToBottom, { deep: true });
watch(loading, () => {
  if (!loading.value) scrollToBottom();
});

onMounted(() => {
  if (!auth.isAuthenticated) {
    router.replace({ name: 'login', query: { redirect: '/buyer/chat' } });
  }
  scrollToBottom();
});

function autosize(e: Event) {
  const t = e.target as HTMLTextAreaElement;
  t.style.height = '36px';
  t.style.height = Math.min(t.scrollHeight, 160) + 'px';
}
</script>

<template>
  <div class="flex flex-col h-full bg-cream/40 dark:bg-surface/30">
    <!-- header (panel variant only, full variant is page-level) -->
    <div v-if="variant === 'panel'" class="px-4 py-2.5 border-b border-line bg-cream/70 dark:bg-surface/70 backdrop-blur flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-full bg-ink text-cream flex items-center justify-center text-xs">AI</div>
        <div>
          <div class="text-sm font-medium leading-none">IBIren 助手</div>
          <div class="text-[10px] text-ink/50 leading-none mt-0.5">问答 · 业务执行 · 需要时弹卡片让你确认</div>
        </div>
      </div>
      <button
        v-if="messages.length > 0"
        @click="clearMessages"
        class="text-[10px] text-ink/50 hover:text-danger border border-line px-2 py-1 rounded-full hover:border-danger transition"
      >
        清空
      </button>
    </div>

    <!-- messages -->
    <div ref="scrollRef" class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <!-- 空状态 -->
      <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center text-center py-10">
        <div class="text-4xl mb-3">👋</div>
        <h2 class="text-base font-medium mb-2">你好, 我是 IBIren 的 AI 助手</h2>
        <p class="text-xs text-ink/60 mb-2 max-w-md leading-relaxed">
          我能帮你解读订单/合同状态、指路到对应页面、执行发包/接单等写操作（需要你确认）。
        </p>
        <p class="text-[10px] text-amber-600 dark:text-amber-400 mb-5 max-w-md leading-relaxed">
          助手回答仅供参考。涉及钱/合同/合规问题, 以页面/PDF 原文为准。
        </p>
        <div class="w-full max-w-md space-y-2">
          <button
            v-for="(p, i) in quickPrompts"
            :key="i"
            @click="input = p; submit()"
            class="block w-full text-left text-xs px-3 py-2.5 rounded-lg border border-line hover:border-gold hover:bg-cream/60 dark:hover:bg-surface-2 transition"
          >
            {{ p }}
          </button>
        </div>
      </div>

      <template v-else>
        <div
          v-for="m in messages"
          :key="m.id"
          :class="['flex', m.role === 'user' ? 'justify-end' : 'justify-start']"
        >
          <div :class="['max-w-[85%]', m.role === 'user' ? 'items-end' : 'items-start']" class="flex flex-col">
            <div
              :class="[
                'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'bg-ink text-cream rounded-tr-sm'
                  : (m.fallback ? 'bg-amber-50 dark:bg-amber-900/20 text-ink border border-amber-200/50' : 'bg-surface text-ink border border-line rounded-tl-sm'),
              ]"
            >
              <div class="whitespace-pre-wrap break-words">{{ m.content }}</div>
              <div
                v-if="m.suggestedActions && m.suggestedActions.length > 0"
                class="mt-2 flex flex-wrap gap-1.5"
              >
                <button
                  v-for="(a, i) in m.suggestedActions"
                  :key="i"
                  @click="handleAction(a.href)"
                  class="text-[11px] px-2.5 py-1 rounded-full border border-gold/40 text-gold hover:bg-gold hover:text-ink transition"
                >
                  {{ a.label }} →
                </button>
              </div>
              <!-- W6-R2: 卡片渲染 intent+intentParams -->
              <IntentCard v-if="m.role === 'assistant' && m.intent" :message="m" />
            </div>
            <div class="text-[9px] mt-1 opacity-40 px-1">
              {{ formatTime(m.createdAt) }}
            </div>
          </div>
        </div>
        <div v-if="loading" class="flex justify-start">
          <div class="bg-surface border border-line rounded-2xl rounded-tl-sm px-3 py-2">
            <div class="flex gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-ink/40 animate-pulse"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-ink/40 animate-pulse" style="animation-delay: 0.2s"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-ink/40 animate-pulse" style="animation-delay: 0.4s"></span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- input -->
    <div class="border-t border-line px-3 py-2.5 bg-cream/60 dark:bg-surface/50 backdrop-blur">
      <div v-if="!canSend" class="text-xs text-ink/50 text-center py-2">
        请先 <RouterLink to="/login" class="text-gold hover:underline">登录</RouterLink>
      </div>
      <div v-else class="flex items-end gap-2">
        <textarea
          v-model="input"
          @keydown="onKeydown"
          @input="autosize"
          placeholder="问点什么… (Enter 发送, Shift+Enter 换行)"
          rows="1"
          :disabled="loading"
          class="flex-1 resize-none bg-surface text-sm px-3 py-2 border border-line rounded-xl focus:outline-none focus:border-gold disabled:opacity-50"
          style="min-height: 36px"
        />
        <button
          @click="submit"
          :disabled="loading || !input.trim()"
          class="w-10 h-10 rounded-lg bg-ink text-cream flex items-center justify-center hover:bg-gold transition disabled:opacity-30 disabled:hover:bg-ink shrink-0"
          aria-label="发送"
        >
          ↑
        </button>
      </div>
      <div v-if="error" class="text-[10px] text-danger mt-1 px-1">{{ error }}</div>
    </div>
  </div>
</template>
