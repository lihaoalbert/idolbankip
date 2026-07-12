<script setup lang="ts">
/**
 * AssistantChatPanel — 整页对话的中栏内容
 *
 * W6-R2: 从 AssistantPage / FloatingChat 抽出来复用。
 * W6-R7: 输入框支持多附件 + 缩略图 chips, 自动切到 /assistant/chat-with-attachments
 *
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

/** W6-R7: 附件 — 最多 5 个, 单文件 50MB(后端限制) */
const attachments = ref<File[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
/** 缩略图 dataURL (用于图片预览) */
const attachmentPreviews = ref<Record<string, string>>({});

function pickAttachments() {
  fileInput.value?.click();
}

function onFileChange(e: Event) {
  const inp = e.target as HTMLInputElement;
  const files = inp.files ? Array.from(inp.files) : [];
  // 合并 + 截断 (≤5)
  const merged = [...attachments.value, ...files].slice(0, 5);
  attachments.value = merged;
  // 缩略图:仅图片生成 dataURL
  for (const f of files) {
    if (f.type.startsWith('image/') && !attachmentPreviews.value[f.name + f.size]) {
      const reader = new FileReader();
      reader.onload = () => {
        attachmentPreviews.value[f.name + f.size] = String(reader.result);
      };
      reader.readAsDataURL(f);
    }
  }
  inp.value = ''; // 重置,允许同名
}

function removeAttachment(i: number) {
  const removed = attachments.value.splice(i, 1)[0];
  if (removed) delete attachmentPreviews.value[removed.name + removed.size];
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}

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
  const atts = attachments.value;
  if ((!text && atts.length === 0) || loading.value) return;
  input.value = '';
  attachments.value = [];
  attachmentPreviews.value = {};
  await sendMessage(text, atts);
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

/** 显示附件已上传的快照 — 在 user 消息气泡里 (从 useAssistant.messages 取,持久化在 localStorage) */
function getMessageAttachments(m: any): Array<{ mimeType: string; filename: string; sizeBytes: number; publicUrl: string }> {
  return m.attachments || [];
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
              <!-- W6-R7: 附件预览 chips (上传后回填到 user 消息,持久化显示) -->
              <div v-if="getMessageAttachments(m).length > 0" class="mb-2 flex flex-wrap gap-1.5">
                <a
                  v-for="(att, i) in getMessageAttachments(m)"
                  :key="i"
                  :href="att.publicUrl"
                  target="_blank"
                  rel="noopener"
                  :title="att.filename"
                  class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-cream/30 dark:bg-surface-3/30 text-[10px] max-w-[180px] hover:bg-cream/50 transition"
                >
                  <span v-if="att.mimeType.startsWith('image/')">📎</span>
                  <span v-else>📄</span>
                  <span class="truncate">{{ att.filename }}</span>
                  <span class="text-ink/40 shrink-0">· {{ fmtSize(att.sizeBytes) }}</span>
                </a>
              </div>
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
      <div v-else>
        <!-- W6-R7: 附件 chips (选中后未发送) -->
        <div v-if="attachments.length > 0" class="mb-2 flex flex-wrap gap-1.5">
          <div
            v-for="(f, i) in attachments"
            :key="i"
            class="relative group flex items-center gap-1.5 px-2 py-1 rounded-lg bg-cream border border-line text-[10px]"
          >
            <img
              v-if="attachmentPreviews[f.name + f.size]"
              :src="attachmentPreviews[f.name + f.size]"
              :alt="f.name"
              class="w-8 h-8 rounded object-cover shrink-0"
            />
            <span v-else class="w-8 h-8 rounded bg-line flex items-center justify-center shrink-0">📄</span>
            <div class="min-w-0 max-w-[140px]">
              <div class="truncate text-ink/80">{{ f.name }}</div>
              <div class="text-ink/40">{{ fmtSize(f.size) }}</div>
            </div>
            <button
              type="button"
              @click="removeAttachment(i)"
              class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-cream text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              title="移除"
            >×</button>
          </div>
        </div>
        <!-- 输入框 row -->
        <div class="flex items-end gap-2">
          <input
            ref="fileInput"
            type="file"
            multiple
            class="hidden"
            accept="image/*,.pdf,.docx,.txt,.md,.zip"
            @change="onFileChange"
          />
          <button
            type="button"
            @click="pickAttachments"
            :disabled="loading || attachments.length >= 5"
            class="w-10 h-10 rounded-lg border border-line bg-surface text-ink/60 hover:border-gold hover:text-gold transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center justify-center"
            :title="attachments.length >= 5 ? '最多 5 个附件' : '上传图片/文档 (jpg/png/pdf/docx, ≤50MB/文件)'"
            aria-label="上传附件"
          >
            📎
          </button>
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
            :disabled="loading || (!input.trim() && attachments.length === 0)"
            class="w-10 h-10 rounded-lg bg-ink text-cream flex items-center justify-center hover:bg-gold transition disabled:opacity-30 disabled:hover:bg-ink shrink-0"
            aria-label="发送"
          >
            ↑
          </button>
        </div>
      </div>
      <div v-if="error" class="text-[10px] text-danger mt-1 px-1">{{ error }}</div>
    </div>
  </div>
</template>
