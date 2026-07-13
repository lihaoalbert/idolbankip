<script setup lang="ts">
/**
 * AssistantPage — /assistant 整页对话
 *
 * 复用 useAssistant composable (与 FloatingChat 共享消息状态)。
 * 适合: 长对话/分享链接/深度排查, 比浮动抽屉更宽敞。
 */
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue';
import { useAssistant } from '@/composables/useAssistant';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';

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
  return `${d.toLocaleDateString('zh-CN')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
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
    router.replace({ name: 'login', query: { redirect: '/assistant' } });
  }
  scrollToBottom();
});

function autosize(e: Event) {
  const t = e.target as HTMLTextAreaElement;
  t.style.height = '44px';
  t.style.height = Math.min(t.scrollHeight, 160) + 'px';
}
</script>

<template>
  <div class="min-h-[calc(100vh-4rem)] bg-cream/30 dark:bg-surface/30">
    <div class="max-w-3xl mx-auto px-4 py-8 flex flex-col" style="min-height: calc(100vh - 12rem)">
      <!-- header -->
      <div class="mb-6 flex items-start justify-between">
        <div>
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 rounded-full bg-ink text-cream flex items-center justify-center text-sm font-medium">
              AI
            </div>
            <div>
              <h1 class="text-xl font-display">AI 助手</h1>
              <p class="text-xs text-ink/50">
                问答 + 指路 · 助手不能代替您操作(下单/签约/退款)
              </p>
            </div>
          </div>
        </div>
        <button
          v-if="messages.length > 0"
          @click="clearMessages"
          class="text-xs text-ink/50 hover:text-danger border border-line px-3 py-1.5 rounded-full hover:border-danger transition"
        >
          清空对话
        </button>
      </div>

      <!-- chat 容器 -->
      <div class="flex-1 bg-surface border border-line rounded-2xl overflow-hidden flex flex-col">
        <!-- messages -->
        <div ref="scrollRef" class="flex-1 overflow-y-auto px-6 py-6 space-y-4" style="min-height: 400px">
          <!-- 空状态 -->
          <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center text-center py-12">
            <div class="text-5xl mb-3">💬</div>
            <h2 class="text-lg font-medium mb-2">你好, 我是 IBIren 的 AI 助手</h2>
            <p class="text-sm text-ink/60 mb-2 max-w-md leading-relaxed">
              我能帮你解读订单/合同状态、指路到对应页面、解释常见卡点。
            </p>
            <p class="text-xs text-gold dark:text-gold mb-6 max-w-md leading-relaxed">
              助手回答仅供参考。涉及钱/合同/合规问题, 以页面/PDF 原文为准, 争议请联系 admin@ibi.ren。
            </p>
            <div class="w-full max-w-md space-y-2">
              <button
                v-for="(p, i) in quickPrompts"
                :key="i"
                @click="input = p; submit()"
                class="block w-full text-left text-sm px-4 py-2.5 rounded-xl border border-line hover:border-gold hover:bg-cream/50 dark:hover:bg-surface-2 transition"
              >
                {{ p }}
              </button>
            </div>
          </div>

          <!-- 消息 -->
          <template v-else>
            <div
              v-for="m in messages"
              :key="m.id"
              :class="['flex', m.role === 'user' ? 'justify-end' : 'justify-start']"
            >
              <div class="max-w-[80%]">
                <div class="text-[10px] text-ink/40 mb-1 px-2">
                  {{ m.role === 'user' ? '你' : 'AI 助手' }} · {{ formatTime(m.createdAt) }}
                </div>
                <div
                  :class="[
                    'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'bg-ink text-cream rounded-tr-sm'
                      : (m.fallback
                          ? 'bg-gold/10 dark:bg-gold/20 text-ink border border-gold/30 rounded-tl-sm'
                          : 'bg-cream/70 dark:bg-surface-2 text-ink border border-line rounded-tl-sm'),
                  ]"
                >
                  <div class="whitespace-pre-wrap break-words">{{ m.content }}</div>
                  <div
                    v-if="m.suggestedActions && m.suggestedActions.length > 0"
                    class="mt-3 flex flex-wrap gap-2"
                  >
                    <button
                      v-for="(a, i) in m.suggestedActions"
                      :key="i"
                      @click="handleAction(a.href)"
                      class="text-xs px-3 py-1.5 rounded-full border border-gold/40 text-gold hover:bg-gold hover:text-ink transition font-medium"
                    >
                      {{ a.label }} →
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <!-- loading -->
            <div v-if="loading" class="flex justify-start">
              <div class="max-w-[80%]">
                <div class="text-[10px] text-ink/40 mb-1 px-2">AI 助手 · 思考中…</div>
                <div class="bg-cream/70 dark:bg-surface-2 border border-line rounded-2xl rounded-tl-sm px-4 py-3">
                  <div class="flex gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-ink/40 animate-pulse"></span>
                    <span class="w-2 h-2 rounded-full bg-ink/40 animate-pulse" style="animation-delay: 0.2s"></span>
                    <span class="w-2 h-2 rounded-full bg-ink/40 animate-pulse" style="animation-delay: 0.4s"></span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- input -->
        <div class="border-t border-line px-4 py-3 bg-cream/50 dark:bg-surface/50">
          <div v-if="!canSend" class="text-sm text-ink/50 text-center py-3">
            请先 <RouterLink to="/login" class="text-gold hover:underline">登录</RouterLink>
          </div>
          <div v-else class="flex items-end gap-3">
            <textarea
              v-model="input"
              @keydown="onKeydown"
              @input="autosize"
              placeholder="问点什么… (Enter 发送, Shift+Enter 换行, ⌘K 唤起气泡)"
              rows="1"
              :disabled="loading"
              class="flex-1 resize-none bg-surface text-sm px-4 py-2.5 border border-line rounded-xl focus:outline-none focus:border-gold disabled:opacity-50"
              style="min-height: 44px"
            />
            <button
              @click="submit"
              :disabled="loading || !input.trim()"
              class="px-5 h-11 rounded-xl bg-ink text-cream font-medium hover:bg-gold transition disabled:opacity-30 disabled:hover:bg-ink shrink-0"
            >
              发送
            </button>
          </div>
          <div v-if="error" class="text-xs text-danger mt-2 px-1">{{ error }}</div>
        </div>
      </div>

      <!-- 免责小字 -->
      <p class="text-[10px] text-ink/40 mt-3 text-center">
        对话历史只存在你的浏览器本地(不会上传服务器)。清空浏览器数据会丢失。
      </p>
    </div>
  </div>
</template>