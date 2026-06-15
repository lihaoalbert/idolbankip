<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  text: string;
  density?: 'low' | 'medium' | 'high';
  color?: string;
  rotate?: number;
}>(), {
  density: 'medium',
  color: 'rgba(255,255,255,0.32)',
  rotate: -30,
});

const tile = computed(() => {
  const fontSize = props.density === 'high' ? 14 : props.density === 'low' ? 22 : 18;
  const stepX = props.density === 'high' ? 140 : props.density === 'low' ? 280 : 200;
  const stepY = props.density === 'high' ? 100 : props.density === 'low' ? 200 : 150;
  const rows: string[] = [];
  for (let y = 0; y < 1000; y += stepY) {
    for (let x = -200; x < 1200; x += stepX) {
      rows.push(`<text x="${x}" y="${y}" font-size="${fontSize}" fill="${props.color}" transform="rotate(${props.rotate} ${x} ${y})">${escape(props.text)}</text>`);
    }
  }
  return rows.join('');
});

function escape(s: string): string {
  return s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
}
</script>

<template>
  <svg
    class="pointer-events-none absolute inset-0 w-full h-full mix-blend-overlay"
    viewBox="0 0 1000 1000"
    preserveAspectRatio="xMidYMid slice"
    v-html="`<g>${tile}</g>`"
  />
</template>