<script setup lang="ts">
/**
 * AI 推断角标 — Track B Round 3
 *
 * 在 Step1~6 form field label 旁边显示,提示"此字段由 AI 从参考图反推,
 * 首次编辑后自动消失"(后端 _inferred 标记会被 PATCH whitelist 过滤掉)。
 *
 * 用法:
 *   <InferredChip v-if="isLayerInferred" />
 *
 * 父组件判 isLayerInferred:
 *   const isLayerInferred = computed(() => blueprintCtx.blueprint.value?.layers.L1_skeleton?._inferred === true);
 */
withDefaults(
  defineProps<{ tip?: string }>(),
  { tip: '此字段由 AI 从参考图反推,首次编辑后自动消失' },
);
</script>

<template>
  <span
    class="ml-2 inline-flex items-center gap-0.5 rounded-full border border-ink/15 bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium text-ink/60"
    data-testid="inferred-chip"
    :title="tip"
  >
    AI 推断
  </span>
</template>
