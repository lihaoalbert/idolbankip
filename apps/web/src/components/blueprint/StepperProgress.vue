<script setup lang="ts">
/**
 * 8 步进度条 — 通用组件,后续 task board / Honor 升级都可能复用
 *
 * 设计:
 * - 桌面:横排 8 个 step 圆点 + 连接线
 * - 移动:竖排(step < 8 高度屏)or 横排带横向滚动(step ≥ 8)
 * - 当前步:实心圆 + 高亮标签
 * - 已完成步:实心圆 + 浅色,点击可回访
 * - 未访问步:空心圆 + 灰色,不可点(等 Phase B 接数据后改成"锁定"图标)
 */
import { computed } from 'vue';

interface Step {
  num: number;
  label: string;
}

const props = withDefaults(
  defineProps<{
    steps: Step[];
    current: number;
    /** 已完成的 step 集合(默认只标 current 之前的) */
    completed?: number[];
  }>(),
  { completed: () => [] },
);

const emit = defineEmits<{
  (e: 'step-click', step: number): void;
}>();

const completedSet = computed(() => new Set(props.completed));

function isClickable(num: number): boolean {
  return completedSet.value.has(num) || num === props.current;
}

function handleClick(num: number) {
  if (!isClickable(num)) return;
  emit('step-click', num);
}
</script>

<template>
  <nav class="w-full" aria-label="Blueprint 步骤进度">
    <ol class="flex items-start justify-between gap-1 overflow-x-auto py-2">
      <li
        v-for="step in steps"
        :key="step.num"
        class="flex flex-1 min-w-0 flex-col items-center"
      >
        <button
          type="button"
          :aria-current="step.num === current ? 'step' : undefined"
          :disabled="!isClickable(step.num)"
          :class="[
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition',
            step.num === current
              ? 'border-stamp-red bg-stamp-red text-cream shadow-sm'
              : completedSet.has(step.num)
              ? 'border-ink/40 bg-ink/10 text-ink hover:border-stamp-red hover:bg-stamp-red/10 cursor-pointer'
              : 'border-ink/15 bg-cream text-ink/30 cursor-not-allowed',
          ]"
          @click="handleClick(step.num)"
        >
          {{ step.num }}
        </button>
        <span
          :class="[
            'mt-2 text-center text-xs leading-tight max-w-[5rem]',
            step.num === current
              ? 'text-stamp-red font-medium'
              : completedSet.has(step.num)
              ? 'text-ink/70'
              : 'text-ink/30',
          ]"
        >
          {{ step.label }}
        </span>
      </li>
    </ol>
  </nav>
</template>