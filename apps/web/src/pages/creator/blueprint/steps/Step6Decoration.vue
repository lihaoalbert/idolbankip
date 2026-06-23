<script setup lang="ts">
/**
 * Step 6 — L6 修饰(Decoration)
 *
 * 6 项:妆容 / 配饰 / 服装 / 场景 / 灯光 / 后期
 * Phase A Round 3 skeleton
 */
defineProps<{ blueprintId: string }>();
</script>

<template>
  <article class="paper-grain rounded-md border border-ink/15 bg-cream p-6 shadow-paper">
    <header class="mb-4 border-b border-ink/10 pb-3">
      <p class="font-mono text-xs uppercase tracking-widest text-ink/40">L6 / 8</p>
      <h2 class="font-display text-2xl text-ink">修饰 (Decoration)</h2>
      <p class="mt-1 text-sm text-ink/60">
        6 项 — 妆容、配饰、场景等附加元素
      </p>
    </header>
    <div class="rounded border border-dashed border-ink/15 bg-paper/50 p-8 text-center text-sm text-ink/40">
      Phase A Round 3 skeleton — 表单控件将在 Round 6 接入
    </div>
  </article>
</template>