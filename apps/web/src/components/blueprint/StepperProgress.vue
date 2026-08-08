<script setup lang="ts">
/**
 * 8 步进度条 — 通用组件,后续 task board / Honor 升级都可能复用
 *
 * 设计:
 * - 桌面:横排 8 个 step 圆点 + 连接线
 * - 移动:竖排(step < 8 高度屏)or 横排带横向滚动(step ≥ 8)
 * - 当前步:实心圆 + 高亮标签
 * - 已完成步:实心圆 + 浅色,点击可回访
 * - 未访问步:空心圆 + 灰色,不可点
 *
 * 解锁规则 (Phase C Beta 修):
 *   - 当前步永远可点(看自己当前在哪)
 *   - 已完成步可点(回访)
 *   - 顺序解锁:step N 可点 ⇔ step N-1 已完成(用户填完上一步就能进下一步)
 *   - 否则不可点(灰色)
 *
 * 这个规则替代了最初的"只标 current 之前的"逻辑 — 后者会让 step 2 永远 disabled。
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
    /** 已完成的 step 集合(由父组件根据 layers 数据计算) */
    completed?: number[];
  }>(),
  { completed: () => [] },
);

const emit = defineEmits<{
  (e: 'step-click', step: number): void;
}>();

const completedSet = computed(() => new Set(props.completed));

function isClickable(num: number): boolean {
  // 1. 当前步永远可点
  if (num === props.current) return true;
  // 2. 已完成步可点(回访)
  if (completedSet.value.has(num)) return true;
  // 3. 顺序解锁:step N 可点 ⇔ step N-1 已完成
  //    这是用户最自然的心理模型 — 填完 step 1 就想点 step 2
  if (num > 1 && completedSet.value.has(num - 1)) return true;
  return false;
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
            'flex shrink-0 items-center justify-center rounded-full border-2 font-semibold transition',
            // 当前步加大 (h-11 w-11) + 强阴影,跟其他 9x9 明显区分
            step.num === current
              ? 'h-11 w-11 text-base border-stamp-red bg-stamp-red text-cream shadow-md ring-2 ring-stamp-red/20 ring-offset-2 ring-offset-cream'
              : completedSet.has(step.num)
              ? 'h-9 w-9 text-sm border-ink/40 bg-ink/10 text-ink hover:border-stamp-red hover:bg-stamp-red/10 cursor-pointer'
              : isClickable(step.num)
              ? 'h-9 w-9 text-sm border-dashed border-stamp-red/50 bg-cream text-stamp-red hover:bg-stamp-red hover:text-cream cursor-pointer'
              : 'h-9 w-9 text-sm border-ink/15 bg-cream text-ink/30 cursor-not-allowed',
          ]"
          :title="!isClickable(step.num) ? '先完成上一步才能解锁' : undefined"
          @click="handleClick(step.num)"
        >
          {{ step.num }}
        </button>
        <span
          :class="[
            'mt-2 text-center text-xs leading-tight max-w-[5rem]',
            step.num === current
              ? 'text-stamp-red font-semibold'
              : completedSet.has(step.num)
              ? 'text-ink/70'
              : isClickable(step.num)
              ? 'text-stamp-red/80'
              : 'text-ink/30',
          ]"
        >
          {{ step.label }}
        </span>
      </li>
    </ol>
  </nav>
</template>