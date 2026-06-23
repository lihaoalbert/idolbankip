<script setup lang="ts">
/**
 * Step 3 — L3 五官定位(Facial Features)
 *
 * 12 项:眉形/眉距/眼形/眼距/眼角度/鼻梁/鼻翼/唇形/唇厚度/下巴/颧骨/下颌角
 * 矛盾组合校验:触发金色 banner,提示用户接受/忽略
 * Phase A Round 3 skeleton:仅展示层标题
 */
defineProps<{ blueprintId: string }>();
</script>

<template>
  <article class="paper-grain rounded-md border border-ink/15 bg-cream p-6 shadow-paper">
    <header class="mb-4 border-b border-ink/10 pb-3">
      <p class="font-mono text-xs uppercase tracking-widest text-ink/40">L3 / 8</p>
      <h2 class="font-display text-2xl text-ink">五官定位 (Facial Features)</h2>
      <p class="mt-1 text-sm text-ink/60">
        12 项 — 五官形态与位置(矛盾组合会触发提示)
      </p>
    </header>
    <div class="rounded border border-dashed border-ink/15 bg-paper/50 p-8 text-center text-sm text-ink/40">
      Phase A Round 3 skeleton — 表单 + 矛盾校验将在 Round 5 接入
    </div>
  </article>
</template>