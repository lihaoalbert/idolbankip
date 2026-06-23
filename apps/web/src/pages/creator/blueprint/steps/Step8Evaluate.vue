<script setup lang="ts">
/**
 * Step 8 — L8 评估(Evaluation)
 *
 * 8 维参数 → mock 评分(originality/consistency/aesthetics)
 * 雷达图 + 单项分(Round 7 实现,SVG 手写无新依赖)
 * Phase A Round 3 skeleton
 */
defineProps<{ blueprintId: string }>();
</script>

<template>
  <article class="paper-grain rounded-md border border-ink/15 bg-cream p-6 shadow-paper">
    <header class="mb-4 border-b border-ink/10 pb-3">
      <p class="font-mono text-xs uppercase tracking-widest text-ink/40">L8 / 8</p>
      <h2 class="font-display text-2xl text-ink">评估 (Evaluation)</h2>
      <p class="mt-1 text-sm text-ink/60">
        原创度 / 一致性 / 美学 — mock 评分,Phase 3 接 FLAME
      </p>
    </header>
    <div class="rounded border border-dashed border-ink/15 bg-paper/50 p-8 text-center text-sm text-ink/40">
      Phase A Round 3 skeleton — 雷达图 + mock 评分将在 Round 7 接入(RC-3 老板拍板公式)
    </div>
  </article>
</template>