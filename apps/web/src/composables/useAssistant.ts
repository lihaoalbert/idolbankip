/**
 * AI 助手 composable — 管理前端 chat 状态
 *
 * 设计:
 *   - messages: 仅前端 reactive state, localStorage 持久化(按 userId 隔离,避免跨账号污染)
 *   - sendMessage: 拼接 history + routeContext → POST /assistant/chat → append user/assistant 两条
 *   - clearMessages: 清空当前会话
 *   - 自动捕获当前 route (vue-router) 作为 routeContext, 前端调用方不必手动传
 *
 * 不做:
 *   - 不持久化到后端 DB (plan 边界)
 *   - 不做 SSE streaming (MVP 非流式)
 *   - 不做 token quota / cost 控制 (admin 在 /settings/llm 看总消费)
 */

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { chatAssistant, type ChatHistoryItem, type SuggestedAction } from '@/api/assistant';
import { useAuthStore } from '@/stores/auth';

export interface AssistantMessage {
  id: string; // 本地 uuid, 用于 key
  role: 'user' | 'assistant';
  content: string;
  suggestedActions?: SuggestedAction[];
  createdAt: number; // Date.now()
  /** 用于 UI 显示: 是否是降级响应(model=fallback) */
  fallback?: boolean;
}

const HISTORY_LIMIT = 40; // 前端缓存最多 40 条 (用 last 20 转给后端)
const LS_PREFIX = 'ibi.assistant.messages.';

function loadFromLs(userId: string): AssistantMessage[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(LS_PREFIX + userId);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(-HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function saveToLs(userId: string, msgs: AssistantMessage[]) {
  if (!userId) return;
  try {
    localStorage.setItem(LS_PREFIX + userId, JSON.stringify(msgs.slice(-HISTORY_LIMIT)));
  } catch {
    /* quota 满等 — 静默 */
  }
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** 共享状态 — 跨组件(FloatingChat 和 AssistantPage)共用一个 messages */
const messages = ref<AssistantMessage[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let currentUserId = '';

export function useAssistant() {
  const auth = useAuthStore();
  const route = useRoute();
  const router = useRouter();

  // 切换用户时重新加载历史
  if (auth.user?.id !== currentUserId) {
    currentUserId = auth.user?.id ?? '';
    messages.value = loadFromLs(currentUserId);
  }

  // 持久化 — 用 watch + flush:'post' 确保 messages 变更后立即写盘
  watch(
    messages,
    (val) => saveToLs(currentUserId, val),
    { deep: true, flush: 'post' },
  );

  function buildHistory(): ChatHistoryItem[] {
    return messages.value
      .filter((m) => !m.fallback || m.role === 'user') // 降级响应不参与下一轮 history(避免污染)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  function buildRouteContext() {
    const rc: { route?: string; query?: Record<string, string> } = { route: route.fullPath };
    if (route.query && Object.keys(route.query).length > 0) {
      const q: Record<string, string> = {};
      for (const [k, v] of Object.entries(route.query)) {
        if (typeof v === 'string') q[k] = v;
      }
      if (Object.keys(q).length > 0) rc.query = q;
    }
    return rc;
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading.value) return;
    error.value = null;

    const userMsg: AssistantMessage = {
      id: genId(),
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    };
    messages.value.push(userMsg);

    loading.value = true;
    try {
      const resp = await chatAssistant({
        message: trimmed,
        history: buildHistory(),
        routeContext: buildRouteContext(),
      });
      const isFallback = resp.reply.startsWith('AI 助手暂时无法回答');
      messages.value.push({
        id: genId(),
        role: 'assistant',
        content: resp.reply,
        suggestedActions: resp.suggestedActions,
        createdAt: Date.now(),
        fallback: isFallback,
      });
    } catch (e: any) {
      // 网络/5xx — 降级
      const errMsg =
        e?.response?.data?.message ?? e?.message ?? '请求失败, 请稍后再试';
      messages.value.push({
        id: genId(),
        role: 'assistant',
        content: `请求失败: ${errMsg}`,
        createdAt: Date.now(),
        fallback: true,
      });
      error.value = errMsg;
    } finally {
      loading.value = false;
    }
  }

  function clearMessages() {
    messages.value = [];
  }

  function goToAction(href: string) {
    // 只走前端路由(同源),不接外链
    if (href.startsWith('/')) router.push(href);
  }

  const canSend = computed(() => auth.isAuthenticated);

  return {
    messages,
    loading,
    error,
    canSend,
    sendMessage,
    clearMessages,
    goToAction,
  };
}