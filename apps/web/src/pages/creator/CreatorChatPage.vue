<script setup lang="ts">
/**
 * CreatorChatPage — /creator/chat 三分屏创作者 chat 主页
 *
 * W6-R3: 镜像 BuyerChatPage, 但 nav + 副 role 检测为 creator.
 * 三栏: ChatWorkspace 容器
 *   - 左 (240px): 创作者导航
 *   - 中: AssistantChatPanel — 含 IntentCard (3 类 creator 写: PLACE_BID/UPLOAD_DELIVERABLE/CREATE_REVIEW)
 *   - 右 (400px): ResultsPane scope=creator — 列可接发包 + R3 AI 工具
 *
 * R9.2: 侧栏 nav 改 RouterLink (之前 <button> + chat 中栏 overlay 拦截, 不可点)
 * R9.3: KYC 入口 link /creator/onboard — 路由 meta 解 BUYER-only 锁
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import ChatWorkspace from '@/components/ChatWorkspace.vue';
import AssistantChatPanel from '@/components/AssistantChatPanel.vue';
import ResultsPane from '@/components/ResultsPane.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const isCreator = computed(() => auth.user?.roles?.includes('CREATOR'));

// R9.2: 全部 RouterLink, active 由 vue-router 自动判定
const navItems = [
  { label: 'AI 助手（chat）', icon: '💬', route: '/creator/chat' },
  { label: '可接发包（任务板）', icon: '📋', route: '/creator/briefs' },
  // R11.1 P0-2: 「我的任务」归位 → 我中标的 workspace 列表(投标后失联的修复)
  { label: '我的任务（活儿）', icon: '📦', route: '/creator/workspaces' },
  { label: '上传新 IP', icon: '➕', route: '/creator/ips/new' },
  // R11.3 P2-2: 改名区分 — 创作者素材库 ≠ 买家授权包(IP)
  { label: '我的素材库', icon: '🎨', route: '/creator/assets' },
  { label: 'API Key 管理', icon: '🔑', route: '/creator/api-keys' },
  { label: '实名 (KYC)', icon: '🆔', route: '/creator/onboard' },
  // 原官方征集板挪到底部次要位置(保留路由,不删)
  { label: '— 官方征集（次要）', icon: '📜', route: '/creator/tasks' },
  // R11.2 P1-1: IP 库入口
  { label: '我的 IP 库', icon: '🗂️', route: '/creator/ips-list' },
];

// R11.3 P2-3: dev 脚注 — 只在开发模式显示
const isDev = import.meta.env.DEV;

if (auth.isAuthenticated && !isCreator.value) {
  router.replace('/');
}
</script>

<template>
  <ChatWorkspace>
    <template #sidebar>
      <div class="px-3 py-3 border-b border-line">
        <div class="text-[10px] text-ink/50 uppercase tracking-wider">创作者控制台</div>
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
      <div v-if="isDev" class="border-t border-line px-3 py-2.5 text-[10px] text-ink/40 leading-relaxed">
        R3 三分屏 chat · AI 工具待开放
      </div>
    </template>

    <AssistantChatPanel />

    <template #results>
      <ResultsPane scope="creator" />
    </template>
  </ChatWorkspace>
</template>