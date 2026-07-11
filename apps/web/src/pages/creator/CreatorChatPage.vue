<script setup lang="ts">
/**
 * CreatorChatPage — /creator/chat 三分屏创作者 chat 主页
 *
 * W6-R3: 镜像 BuyerChatPage, 但 nav + 副 role 检测为 creator.
 * 三栏: ChatWorkspace 容器
 *   - 左 (240px): 创作者导航
 *   - 中: AssistantChatPanel — 含 IntentCard (3 类 creator 写: PLACE_BID/UPLOAD_DELIVERABLE/CREATE_REVIEW)
 *   - 右 (400px): ResultsPane scope=creator — 列可接发包 + R3 AI 工具
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

const navItems = [
  { label: 'AI 助手（chat）', icon: '💬', route: '/creator/chat', isActive: true },
  { label: '可接发包（任务板）', icon: '📋', route: '/creator/briefs' },
  { label: '我的任务', icon: '📦', route: '/creator/tasks' },
  { label: '上传新 IP', icon: '➕', route: '/creator/ips/new' },
  { label: '我的资产', icon: '🎨', route: '/creator/assets' },
  { label: 'API Key 管理', icon: '🔑', route: '/creator/api-keys' },
  { label: '实名 (KYC)', icon: '🆔', route: '/creator/onboard' },
];

function goto(r: string) {
  router.push(r);
}

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
        <button
          v-for="(item, i) in navItems"
          :key="i"
          @click="goto(item.route)"
          :class="[
            'w-full flex items-center gap-2 px-3 py-2 text-left transition',
            item.isActive
              ? 'bg-gold/15 text-gold border-l-2 border-gold'
              : 'hover:bg-cream/70 dark:hover:bg-surface-2 text-ink/70 border-l-2 border-transparent'
          ]"
        >
          <span class="text-base">{{ item.icon }}</span>
          <span class="text-xs">{{ item.label }}</span>
        </button>
      </nav>
      <div class="border-t border-line px-3 py-2.5 text-[10px] text-ink/40 leading-relaxed">
        R3 三分屏 chat · AI 工具待开放
      </div>
    </template>

    <AssistantChatPanel />

    <template #results>
      <ResultsPane scope="creator" />
    </template>
  </ChatWorkspace>
</template>
