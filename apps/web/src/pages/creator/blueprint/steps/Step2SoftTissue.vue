<script setup lang="ts">
/**
 * Step 2 — L2 软组织(Soft Tissue)
 *
 * 6 项:脸颊饱满度 / 脂肪厚度 / 咬肌 / 法令纹深度 / 下巴突出度 / 嘴唇厚度
 * Phase A Round 3 skeleton:仅展示层标题 + 说明
 */
defineProps<{ blueprintId: string }>();
</script>

<template>
  <article class="paper-grain rounded-md border border-ink/15 bg-cream p-6 shadow-paper">
    <header class="mb-4 border-b border-ink/10 pb-3">
      <p class="font-mono text-xs uppercase tracking-widest text-ink/40">L2 / 8</p>
      <h2 class="font-display text-2xl text-ink">软组织 (Soft Tissue)</h2>
      <p class="mt-1 text-sm text-ink/60">
        6 项 — 骨骼之上的脂肪与肌肉分布
      </p>
    </header>
    <div class="rounded border border-dashed border-ink/15 bg-paper/50 p-8 text-center text-sm text-ink/40">
      Phase A Round 3 skeleton — 表单控件将在 Round 4 接入
    </div>
  </article>
</template>