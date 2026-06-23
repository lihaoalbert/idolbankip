<script setup lang="ts">
/**
 * ContradictionBanner — 矛盾组合黄色提示条
 *
 * - 检测到至少 1 条矛盾时显示
 * - warning 黄色 / info 浅蓝
 * - 用户可"忽略"关闭(本会话内不再显示),刷新后重新显示
 * - 跟后端 detectContradictions() 同源(规则库同步维护)
 */
import { computed, ref } from 'vue';
import { detectContradictions } from '@/api/contradictions';
import type { Contradiction } from '@/api/blueprint';

const props = defineProps<{
  layers: {
    L1_skeleton?: Record<string, unknown> | null;
    L2_softTissue?: Record<string, unknown> | null;
    L3_features?: Record<string, unknown> | null;
    L5_hair?: Record<string, unknown> | null;
  };
}>();

const dismissed = ref(false);

const contradictions = computed<Contradiction[]>(() => {
  if (dismissed.value) return [];
  return detectContradictions(props.layers as any);
});

const visible = computed(() => contradictions.value.length > 0);

const warningCount = computed(() => contradictions.value.filter((c) => c.severity === 'warning').length);
const infoCount = computed(() => contradictions.value.filter((c) => c.severity === 'info').length);

function dismiss() {
  dismissed.value = true;
}
</script>

<template>
  <div
    v-if="visible"
    class="rounded-md border p-3 text-sm"
    :class="warningCount > 0
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-sky-300 bg-sky-50 text-sky-900'"
  >
    <div class="mb-2 flex items-start justify-between gap-2">
      <div class="font-medium">
        <span v-if="warningCount > 0">⚠ 风格提醒</span>
        <span v-else>ℹ 风格提示</span>
        <span class="ml-2 text-xs opacity-75">
          {{ warningCount + infoCount }} 条
          <template v-if="warningCount > 0 && infoCount > 0">
            ({{ warningCount }} 警告 / {{ infoCount }} 提示)
          </template>
        </span>
      </div>
      <button
        type="button"
        class="text-xs opacity-60 hover:opacity-100"
        @click="dismiss"
      >
        忽略 ✕
      </button>
    </div>
    <ul class="space-y-1.5 text-xs">
      <li v-for="c in contradictions" :key="c.id" class="leading-relaxed">
        <span class="font-medium">{{ c.title }}</span>
        <span class="mx-1 opacity-40">·</span>
        <span class="opacity-80">{{ c.description }}</span>
        <span class="ml-2 font-mono opacity-50">[{{ c.layer }}]</span>
      </li>
    </ul>
    <p class="mt-2 text-xs opacity-60">
      这是"风格提醒",不是错误 — 出图前可点击"忽略"继续保存。
    </p>
  </div>
</template>