<script setup lang="ts">
/**
 * BuyerChatPage — /buyer/chat 三分屏买家 chat 主页
 *
 * W6-R2: B 方案 — 三分屏布局, 中栏持续对话, 右栏 "我的工作台" 列表.
 *
 * 三栏 (用 ChatWorkspace 容器):
 *   - 左 (240px): 买家导航 (简版, 5 项核心)
 *   - 中: AssistantChatPanel — 与 FloatingChat 共享状态, 含 IntentCard
 *   - 右 (400px): ResultsPane — 我的发包列表 + R3 AI 工具占位
 *
 * R9.2: 侧栏 nav 改成 RouterLink (之前是 <button @click="router.push">,
 *   Playwright + 真人都点不动 — 子树拦截 pointer events)。
 *
 * 默认入口 (R4.1 上线): /buyer → 302 /buyer/chat
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import ChatWorkspace from '@/components/ChatWorkspace.vue';
import AssistantChatPanel from '@/components/AssistantChatPanel.vue';
import ResultsPane from '@/components/ResultsPane.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const isBuyer = computed(() => auth.user?.roles?.includes('BUYER'));

// R9.2: 全部用 RouterLink, active 由 vue-router 自动判定 (router-link-exact-active)
const navItems = [
  { label: 'AI 助手（chat）', icon: '💬', route: '/buyer/chat' },
  { label: '我的发包', icon: '📋', route: '/buyer/briefs' },
  { label: '新建发包', icon: '➕', route: '/buyer/brief/new' },
  { label: '我的订单', icon: '📦', route: '/orders' },
  { label: '我的资产', icon: '🎨', route: '/my-assets' },
  { label: '联系商务', icon: '✉️', route: '/contact' },
];

if (auth.isAuthenticated && !isBuyer.value) {
  // 非 buyer 角色访问入口 — 推回首页
  router.replace('/');
}
</script>

<template>
  <ChatWorkspace>
    <template #sidebar>
      <div class="px-3 py-3 border-b border-line">
        <div class="text-[10px] text-ink/50 uppercase tracking-wider">买家控制台</div>
        <div class="text-xs font-medium mt-1">chat-first</div>
      </div>
      <nav class="flex-1 overflow-y-auto py-2">
        <RouterLink
          v-for="(item, i) in navItems"
          :key="i"
          :to="item.route"
          class="nav-item flex items-center gap-2 px-3 py-2 text-xs transition border-l-2 border-transparent text-ink/70 hover:bg-cream/70 dark:hover:bg-surface-2"
          active-class="nav-item-active bg-gold/15 text-gold border-gold"
        >
          <span class="text-base">{{ item.icon }}</span>
          <span class="text-xs">{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="border-t border-line px-3 py-2.5 text-[10px] text-ink/40 leading-relaxed">
        R2 三分屏 · R3 将开放 AI 工具 · R4 全量上线
      </div>
    </template>

    <AssistantChatPanel />

    <template #results>
      <ResultsPane />
    </template>
  </ChatWorkspace>
</template>