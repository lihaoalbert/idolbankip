<script setup lang="ts">
/**
 * Toast 容器 — 挂在 App.vue 根节点, 右上角堆叠展示。
 * 跟 useToast() 共用 provide/inject 状态。
 */
import { useToast } from '@/composables/useToast';
import { TransitionGroup } from 'vue';

const { toasts, dismiss } = useToast();

const variantClass: Record<string, string> = {
  success: 'bg-success text-white',
  error: 'bg-danger text-white',
  info: 'bg-ink text-cream',
};
</script>

<template>
  <div class="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-x-4"
      enter-to-class="opacity-100 translate-x-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0 translate-x-4"
    >
      <div
        v-for="t in toasts"
        :key="t.id"
        :class="[
          'pointer-events-auto min-w-[240px] max-w-sm px-4 py-3 rounded-xl shadow-soft text-sm flex items-start gap-3',
          variantClass[t.variant],
        ]"
        role="status"
      >
        <span class="flex-1">{{ t.message }}</span>
        <button
          @click="dismiss(t.id)"
          class="opacity-70 hover:opacity-100 transition text-xs leading-none"
          aria-label="关闭"
        >✕</button>
      </div>
    </TransitionGroup>
  </div>
</template>
