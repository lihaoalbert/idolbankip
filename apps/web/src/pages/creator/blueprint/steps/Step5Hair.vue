<script setup lang="ts">
/**
 * Step 5 — L5 毛发(Hair)
 *
 * 8 项:发型 / 发长 / 发色 / 刘海 / 鬓角 / 眉毛 / 睫毛 / 胡须
 * Phase A Round 3 skeleton
 */
defineProps<{ blueprintId: string }>();
</script>

<template>
  <article class="paper-grain rounded-md border border-ink/15 bg-cream p-6 shadow-paper">
    <header class="mb-4 border-b border-ink/10 pb-3">
      <p class="font-mono text-xs uppercase tracking-widest text-ink/40">L5 / 8</p>
      <h2 class="font-display text-2xl text-ink">毛发 (Hair)</h2>
      <p class="mt-1 text-sm text-ink/60">
        8 项 — 发型、发色、眉毛睫毛等
      </p>
    </header>
    <div class="rounded border border-dashed border-ink/15 bg-paper/50 p-8 text-center text-sm text-ink/40">
      Phase A Round 3 skeleton — 表单控件将在 Round 5 接入
    </div>
  </article>
</template>