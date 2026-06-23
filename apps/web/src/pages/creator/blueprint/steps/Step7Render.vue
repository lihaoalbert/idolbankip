<script setup lang="ts">
/**
 * Step 7 — L7 渲染 Prompt(Render Prompt)
 *
 * 自动拼中英双语 prompt(参考 IMAGE_GEN_PROMPTS 风格),
 * 创作者可直接复制喂 MJ / SD / 即梦
 * Phase A Round 3 skeleton
 */
defineProps<{ blueprintId: string }>();
</script>

<template>
  <article class="paper-grain rounded-md border border-ink/15 bg-cream p-6 shadow-paper">
    <header class="mb-4 border-b border-ink/10 pb-3">
      <p class="font-mono text-xs uppercase tracking-widest text-ink/40">L7 / 8</p>
      <h2 class="font-display text-2xl text-ink">渲染 Prompt (Render)</h2>
      <p class="mt-1 text-sm text-ink/60">
        自动生成中英双语 prompt,直接喂 MJ / SD / 即梦
      </p>
    </header>
    <div class="rounded border border-dashed border-ink/15 bg-paper/50 p-8 text-center text-sm text-ink/40">
      Phase A Round 3 skeleton — 模板将在 Round 6 接入(RC-2 老板拍板)
    </div>
  </article>
</template>