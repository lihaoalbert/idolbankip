<script setup lang="ts">
/**
 * FloatingChat — 全局右下角 AI 助手气泡 + 抽屉
 *
 * 仅 auth.isAuthenticated 显示 (避免游客看到空 chat)。
 * 状态(消息/loading)与 AssistantPage 共用 — 来自 useAssistant composable。
 *
 * 视觉: 沿用项目风格 (Tailwind utility + 自定义 surface 色), 跟 NotificationBell 一致。
 */
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue';
import { useAssistant, type AssistantMessage } from '@/composables/useAssistant';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const { messages, loading, error, canSend, sendMessage, clearMessages, goToAction } = useAssistant();

const open = ref(false);
const input = ref('');
const scrollRef = ref<HTMLElement | null>(null);

const visible = computed(() => auth.isAuthenticated);

function toggle() {
  open.value = !open.value;
  if (open.value) focusInput();
}

function focusInput() {
  nextTick(() => {
    const el = document.getElementById('floating-chat-input') as HTMLTextAreaElement | null;
    el?.focus();
  });
}

async function submit() {
  const text = input.value.trim();
  if (!text || loading.value) return;
  input.value = '';
  await sendMessage(text);
  scrollToBottom();
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
  });
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
  if (e.key === 'Escape' && open.value) {
    open.value = false;
  }
}

// 监听消息变化自动滚到底
watch(messages, scrollToBottom, { deep: true });
watch(loading, () => {
  if (!loading.value) scrollToBottom();
});

// 全局快捷键 ⌘K / Ctrl+K 唤起
function onGlobalKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (visible.value) {
      open.value = true;
      focusInput();
    }
  }
}

onMounted(() => document.addEventListener('keydown', onGlobalKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKey));

// 快捷问题 (按角色不同)
const quickPrompts = computed(() => {
  const isCreator = auth.user?.roles?.includes('CREATOR');
  if (isCreator) {
    return [
      '我的 KYC 被拒了, 怎么办?',
      'IpWizard 资产包缺什么图?',
      'IP 被审核驳回, 怎么改?',
    ];
  }
  return [
    '4 档授权我该买哪档?',
    '我的订单卡住了, 下一步?',
    '下载文件失败了, 怎么办?',
  ];
});

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function handleAction(href: string) {
  goToAction(href);
  open.value = false; // 跳转后关闭抽屉
}
</script>

<template>
  <div v-if="visible" class="fixed bottom-4 right-4 z-50 print:hidden">
    <!-- 气泡按钮 -->
    <button
      v-if="!open"
      @click="toggle"
      class="w-14 h-14 rounded-full bg-ink text-cream shadow-lg hover:bg-gold transition flex items-center justify-center group"
      title="AI 助手 (⌘K)"
      aria-label="打开 AI 助手"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 8V4H8" />
        <rect width="16" height="12" x="4" y="8" rx="2" />
        <path d="M2 14h2" />
        <path d="M20 14h2" />
        <path d="M15 13v2" />
        <path d="M9 13v2" />
      </svg>
      <span class="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-gold text-ink text-[9px] font-medium">
        AI
      </span>
    </button>

    <!-- 抽屉 -->
    <div
      v-if="open"
      class="w-[400px] max-w-[calc(100vw-2rem)] h-[70vh] max-h-[600px] bg-cream dark:bg-surface border border-line rounded-2xl shadow-2xl flex flex-col overflow-hidden"
    >
      <!-- header -->
      <div class="px-4 py-3 border-b border-line flex items-center justify-between bg-cream/80 dark:bg-surface/80 backdrop-blur">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-full bg-ink text-cream flex items-center justify-center text-xs">
            AI
          </div>
          <div>
            <div class="text-sm font-medium leading-none">AI 助手</div>
            <div class="text-[10px] text-ink/50 leading-none mt-0.5">
              问答 + 指路 · 不代替您操作
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <RouterLink
            to="/assistant"
            @click="open = false"
            class="text-[10px] text-ink/50 hover:text-gold transition px-2 py-1"
            title="全屏对话"
          >
            全屏 ↗
          </RouterLink>
          <button
            v-if="messages.length > 0"
            @click="clearMessages"
            class="text-[10px] text-ink/50 hover:text-danger transition px-2 py-1"
            title="清空对话"
          >
            清空
          </button>
          <button
            @click="open = false"
            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-line transition text-ink/60"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- messages -->
      <div ref="scrollRef" class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <!-- 空状态 -->
        <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center text-center px-4 py-8">
          <div class="text-3xl mb-2">👋</div>
          <p class="text-sm text-ink/70 mb-3">你好, 我是 IBIren 的 AI 助手</p>
          <p class="text-xs text-ink/40 mb-5 leading-relaxed">
            我能帮你解读状态、查订单进度、指路到对应页面。<br />
            但不能代替你操作(下单/签约/退款都不行)。
          </p>
          <div class="w-full space-y-2">
            <button
              v-for="(p, i) in quickPrompts"
              :key="i"
              @click="input = p; submit()"
              class="block w-full text-left text-xs px-3 py-2 rounded-lg border border-line hover:border-gold hover:bg-cream/50 dark:hover:bg-surface-2 transition"
            >
              {{ p }}
            </button>
          </div>
        </div>

        <!-- 消息列表 -->
        <template v-else>
          <div
            v-for="m in messages"
            :key="m.id"
            :class="[
              'flex',
              m.role === 'user' ? 'justify-end' : 'justify-start',
            ]"
          >
            <div
              :class="[
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'bg-ink text-cream rounded-tr-sm'
                  : (m.fallback ? 'bg-amber-50 dark:bg-amber-900/20 text-ink border border-amber-200/50' : 'bg-surface text-ink border border-line rounded-tl-sm'),
              ]"
            >
              <div class="whitespace-pre-wrap break-words">{{ m.content }}</div>
              <!-- suggestedActions -->
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
              <div class="text-[9px] mt-1 opacity-50">
                {{ formatTime(m.createdAt) }}
              </div>
            </div>
          </div>
          <!-- loading -->
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
      <div class="border-t border-line px-3 py-2.5 bg-cream/80 dark:bg-surface/80 backdrop-blur">
        <div v-if="!canSend" class="text-xs text-ink/50 text-center py-2">
          请先登录
        </div>
        <div v-else class="flex items-end gap-2">
          <textarea
            id="floating-chat-input"
            v-model="input"
            @keydown="onKeydown"
            placeholder="问点什么… (Enter 发送, Shift+Enter 换行)"
            rows="1"
            :disabled="loading"
            class="flex-1 resize-none bg-transparent text-sm px-3 py-2 border border-line rounded-xl focus:outline-none focus:border-gold disabled:opacity-50 max-h-24"
            style="min-height: 36px"
            @input="(e: any) => { e.target.style.height = '36px'; e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'; }"
          />
          <button
            @click="submit"
            :disabled="loading || !input.trim()"
            class="w-9 h-9 rounded-full bg-ink text-cream flex items-center justify-center hover:bg-gold transition disabled:opacity-30 disabled:hover:bg-ink shrink-0"
            aria-label="发送"
          >
            ↑
          </button>
        </div>
        <div v-if="error" class="text-[10px] text-danger mt-1 px-1">{{ error }}</div>
      </div>
    </div>
  </div>
</template>