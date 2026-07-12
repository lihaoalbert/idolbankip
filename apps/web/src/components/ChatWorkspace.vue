<script setup lang="ts">
/**
 * ChatWorkspace — W6 三分屏布局容器
 *
 * 设计: 三栏 Grid
 *   - 左栏 (240px 可折叠到 0,fixed 「‹」按钮切换)
 *   - 中栏 (flex-1)   — Chat 流 (AssistantMessage + 卡片)
 *   - 右栏 (默认 400px,280~80vw 拖动范围,localStorage 持久化)
 *
 * W6-R7: fullscreen 模式 (route.query.fullscreen === 'true')
 *   - 隐藏中栏 chat, 右栏占满 flex-1 (resize 锁住)
 *
 * W6-R7+: 右栏可拖动 — 中-右之间一根 4px 透明 split,hover 时变 gold;
 *   拖动时 cursor:col-resize; min 280px / max 80vw。
 *   宽度写到 localStorage['chat-right-w'] (默认 400),刷新或路由切换后保留。
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';

interface Props {
  /**
   * 默认折叠状态 — 由父组件用 prop 控制(如 BuyerChatPage / CreatorChatPage 都未传,默认展开)。
   * 折叠状态本身走内部 ref 自管,避免 v-model 双向绑定时 boolean coerce 把 undefined 误判为 false。
   * Why: Vue 3 boolean prop 没传会被 coerce 成 false,父组件不传 v-model:sidebarCollapsed 时永远走 collapsed 分支,
   *      emit 给没人监听的 parent → 永远不变。改用单一字段 defaultCollapsed + 内部 ref 是最简稳的方案。
   */
  defaultCollapsed?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  defaultCollapsed: false,
});

const route = useRoute();
const COLLAPSED_KEY = 'chat-left-collapsed';
const initCollapsed = ref(props.defaultCollapsed);
const effectiveCollapsed = computed(() => initCollapsed.value);

/** W6-R7: fullscreen 模式 — 隐藏中栏 chat, 让右屏占满 */
const isFullscreen = computed(() => route.query.fullscreen === 'true');

function toggleSidebar() {
  initCollapsed.value = !initCollapsed.value;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(COLLAPSED_KEY, initCollapsed.value ? '1' : '0');
  }
}

function loadCollapsed() {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(COLLAPSED_KEY);
  if (raw === '1') initCollapsed.value = true;
}

// 右栏宽度 — 持久化到 localStorage; 默认 400, 范围 [280, 80vw]
const RIGHT_W_KEY = 'chat-right-w';
const RIGHT_MIN = 280;
const RIGHT_MAX_RATIO = 0.8;
const rightWidthPx = ref(400);

function loadRightWidth() {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(RIGHT_W_KEY);
  if (!raw) return;
  const v = Number(raw);
  if (Number.isFinite(v) && v >= RIGHT_MIN && v <= window.innerWidth * RIGHT_MAX_RATIO) {
    rightWidthPx.value = v;
  }
}
function saveRightWidth() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RIGHT_W_KEY, String(Math.round(rightWidthPx.value)));
}

/** Drag 状态机 */
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartWidth = ref(0);

function startRightDrag(e: MouseEvent) {
  if (isFullscreen.value) return;
  isDragging.value = true;
  dragStartX.value = e.clientX;
  dragStartWidth.value = rightWidthPx.value;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
}
function onDragMove(e: MouseEvent) {
  if (!isDragging.value) return;
  // 拖左边把手的"右侧"宽度 = 起始宽度 + (起始 x - 当前 x), 因为拖左把手让右栏缩窄
  const dx = dragStartX.value - e.clientX;
  const next = dragStartWidth.value + dx;
  const max = window.innerWidth * RIGHT_MAX_RATIO;
  rightWidthPx.value = Math.min(max, Math.max(RIGHT_MIN, next));
}
function endDrag() {
  if (!isDragging.value) return;
  isDragging.value = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  saveRightWidth();
}

function resetRightWidth() {
  rightWidthPx.value = 400;
  saveRightWidth();
}

onMounted(() => {
  loadCollapsed();
  loadRightWidth();
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', endDrag);
});
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', endDrag);
});
</script>

<template>
  <div class="flex h-[calc(100vh-4rem)] bg-cream/30 dark:bg-surface/30 overflow-hidden">
    <!-- 左栏 (fullscreen 时也保留, 方便用户点击「AI 助手」切回) -->
    <aside
      :class="[
        'border-r border-line bg-cream/80 dark:bg-surface/80 backdrop-blur flex flex-col shrink-0 transition-all duration-200 overflow-hidden',
        effectiveCollapsed ? 'w-0' : 'w-60',
      ]"
    >
      <slot name="sidebar" />
    </aside>

    <!-- 折叠按钮 (fixed 左侧中部) — 24×56,hover 边框 -->
    <button
      type="button"
      @click="toggleSidebar"
      :class="[
        'fixed top-1/2 -translate-y-1/2 z-30 w-6 h-14 bg-cream dark:bg-surface border border-line rounded-r-lg flex items-center justify-center text-ink/60 hover:bg-gold hover:text-cream hover:border-gold transition shadow-sm',
        effectiveCollapsed ? 'left-0' : 'left-60',
      ]"
      :aria-label="effectiveCollapsed ? '展开侧栏' : '折叠侧栏'"
      :title="effectiveCollapsed ? '展开侧栏' : '折叠侧栏'"
    >
      <span class="text-base font-bold leading-none">{{ effectiveCollapsed ? '›' : '‹' }}</span>
    </button>

    <!-- 中栏 (chat) — fullscreen 时隐藏 -->
    <main v-show="!isFullscreen" class="flex-1 flex flex-col min-w-0">
      <slot />
    </main>

    <!-- 中-右 之间拖把手 (fullscreen 时不显示) -->
    <div
      v-show="!isFullscreen"
      @mousedown="startRightDrag"
      class="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-gold/40 transition-colors relative group"
      :title="'拖动调整右屏宽度 (当前 ' + Math.round(rightWidthPx) + 'px)'"
    >
      <div class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-line group-hover:bg-gold transition-colors" />
    </div>

    <!-- 右栏 (results) — fullscreen 占满; 否则按 rightWidthPx -->
    <aside
      :class="[
        'border-l border-line bg-cream/50 dark:bg-surface/50 flex flex-col shrink-0 overflow-y-auto transition-[width] duration-150',
        isFullscreen ? 'flex-1 max-w-none' : '',
      ]"
      :style="isFullscreen ? undefined : { width: rightWidthPx + 'px', maxWidth: '80vw' }"
    >
      <slot name="results" />
    </aside>

    <!-- Reset 按钮 — 极小, 右下角, hover 才显 — 把右屏恢复默认 400px -->
    <button
      v-show="!isFullscreen && rightWidthPx !== 400"
      type="button"
      @click="resetRightWidth"
      class="fixed right-2 bottom-16 z-20 text-[10px] px-2 py-1 rounded-full bg-cream/80 dark:bg-surface/80 border border-line text-ink/60 hover:border-gold hover:text-gold transition shadow-sm"
      :title="'重置右屏宽度 (' + Math.round(rightWidthPx) + 'px → 400px)'"
    >
      ↺ 重置右屏
    </button>
  </div>
</template>
