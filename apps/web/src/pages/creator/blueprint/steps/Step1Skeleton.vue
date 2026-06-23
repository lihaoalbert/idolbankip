<script setup lang="ts">
/**
 * Step 1 — L1 骨骼(Skeleton / Anthropometry)
 *
 * 8 项 anthropometry:头宽 / 头深 / 颧骨宽 / 下颌宽 / 颈长 / 肩宽 / 身高 / 体重
 * Phase A Round 3 skeleton:仅展示层标题 + 说明,真实表单 Round 4 实现
 */
defineProps<{ blueprintId: string }>();
</script>

<template>
  <article class="paper-grain rounded-md border border-ink/15 bg-cream p-6 shadow-paper">
    <header class="mb-4 border-b border-ink/10 pb-3">
      <p class="font-mono text-xs uppercase tracking-widest text-ink/40">L1 / 8</p>
      <h2 class="font-display text-2xl text-ink">骨骼 (Skeleton)</h2>
      <p class="mt-1 text-sm text-ink/60">
        8 项 anthropometry — 决定脸型的整体骨架
      </p>
    </header>
    <div class="rounded border border-dashed border-ink/15 bg-paper/50 p-8 text-center text-sm text-ink/40">
      Phase A Round 3 skeleton — 表单控件将在 Round 4 接入
    </div>
  </article>
</template>