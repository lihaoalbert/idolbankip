<script setup lang="ts">
/**
 * ChatWorkspace — W6 三分屏布局容器
 *
 * 设计: 三栏 Grid
 *   - 左栏 (240px 可折叠到 0) — 导航/会话列表/设置
 *   - 中栏 (minmax(360, 1fr))   — Chat 流 (AssistantMessage + 卡片)
 *   - 右栏 (minmax(320, 480px)) — Results Pane (intent → 卡片)
 *
 * 用法:
 *   <ChatWorkspace
 *     :sidebar="sidebarSlots"
 *     :results-pane="resultsSlots"
 *     embed-only
 *   >
 *     <!-- 中栏默认 slot 放 AssistantChatPanel -->
 *   </ChatWorkspace>
 *
 * R2: 三分屏主框架. R3: Creator 复用同组件. R4: 全量上线.
 */
import { ref, computed } from 'vue';

interface Props {
  /** 左栏折叠状态 (v-model:sidebarCollapsed) */
  sidebarCollapsed?: boolean;
  /** 默认 false — R2 留 true 方便老路由嵌入 */
  defaultCollapsed?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  sidebarCollapsed: false,
  defaultCollapsed: false,
});

const emit = defineEmits<{
  (e: 'update:sidebarCollapsed', v: boolean): void;
}>();

const collapsed = computed({
  get: () => props.sidebarCollapsed,
  set: (v) => emit('update:sidebarCollapsed', v),
});

const initCollapsed = ref(props.defaultCollapsed);
const effectiveCollapsed = computed(() =>
  props.sidebarCollapsed !== undefined ? collapsed.value : initCollapsed.value,
);

function toggleSidebar() {
  if (props.sidebarCollapsed !== undefined) {
    collapsed.value = !collapsed.value;
  } else {
    initCollapsed.value = !initCollapsed.value;
  }
}
</script>

<template>
  <div class="flex h-[calc(100vh-4rem)] bg-cream/30 dark:bg-surface/30 overflow-hidden">
    <!-- 左栏 -->
    <aside
      :class="[
        'border-r border-line bg-cream/80 dark:bg-surface/80 backdrop-blur flex flex-col shrink-0 transition-all duration-200',
        effectiveCollapsed ? 'w-0' : 'w-60',
      ]"
    >
      <slot name="sidebar" />
    </aside>

    <!-- 折叠按钮 (fixed 左侧中部) -->
    <button
      @click="toggleSidebar"
      :class="[
        'fixed left-0 top-1/2 -translate-y-1/2 z-20 w-5 h-12 bg-cream/90 dark:bg-surface/90 border border-line rounded-r-lg flex items-center justify-center text-ink/50 hover:text-gold transition',
        effectiveCollapsed ? 'left-0' : 'left-60',
      ]"
      :aria-label="effectiveCollapsed ? '展开侧栏' : '折叠侧栏'"
    >
      <span class="text-[10px]">{{ effectiveCollapsed ? '›' : '‹' }}</span>
    </button>

    <!-- 中栏 (chat) -->
    <main class="flex-1 flex flex-col min-w-0">
      <slot />
    </main>

    <!-- 右栏 (results) -->
    <aside class="w-[400px] max-w-[40vw] border-l border-line bg-cream/50 dark:bg-surface/50 flex flex-col shrink-0 overflow-y-auto">
      <slot name="results" />
    </aside>
  </div>
</template>