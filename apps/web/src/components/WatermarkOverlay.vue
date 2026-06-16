<script setup lang="ts">
/**
 * 双层水印覆盖:
 *  1) 品牌水印 (大号稀疏): "IBI.REN · IDOL BANK IP" — 公司名 / 平台名宣示
 *  2) 用户水印 (小号密铺): 当前访问者的 email + IP code — 溯源取证
 *
 * 两层旋转角不同 (-30° / +30°), 防止截图裁剪后两水印同时丢失
 */
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  /** 用户溯源水印文本 (email · code) */
  text: string;
  /** 公司品牌水印 (默认 IBI.REN) */
  brandText?: string;
  density?: 'low' | 'medium' | 'high';
  brandColor?: string;
  userColor?: string;
}>(), {
  density: 'medium',
  brandText: 'IBI.REN · IDOL BANK IP',
  brandColor: 'rgba(255,255,255,0.18)',
  userColor: 'rgba(255,255,255,0.32)',
});

function escape(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
}

const brandLayer = computed(() => {
  // 大号稀疏, 旋转 -30°, 半透明, 占主导视觉
  const fontSize = props.density === 'high' ? 28 : props.density === 'low' ? 38 : 32;
  const stepX = 380;
  const stepY = 220;
  const rows: string[] = [];
  for (let y = 0; y < 1000; y += stepY) {
    for (let x = -200; x < 1400; x += stepX) {
      rows.push(`<text x="${x}" y="${y}" font-size="${fontSize}" font-weight="700" letter-spacing="6" fill="${props.brandColor}" transform="rotate(-30 ${x} ${y})">${escape(props.brandText)}</text>`);
    }
  }
  return rows.join('');
});

const userLayer = computed(() => {
  // 小号密铺, 旋转 +30°, 用户溯源
  const fontSize = props.density === 'high' ? 12 : props.density === 'low' ? 20 : 16;
  const stepX = props.density === 'high' ? 140 : props.density === 'low' ? 280 : 200;
  const stepY = props.density === 'high' ? 100 : props.density === 'low' ? 200 : 150;
  const rows: string[] = [];
  for (let y = 0; y < 1000; y += stepY) {
    for (let x = -200; x < 1200; x += stepX) {
      rows.push(`<text x="${x}" y="${y}" font-size="${fontSize}" fill="${props.userColor}" transform="rotate(30 ${x} ${y})">${escape(props.text)}</text>`);
    }
  }
  return rows.join('');
});
</script>

<template>
  <!-- 品牌水印层: mix-blend-overlay, 更显眼 -->
  <svg
    class="pointer-events-none absolute inset-0 w-full h-full mix-blend-overlay"
    viewBox="0 0 1000 1000"
    preserveAspectRatio="xMidYMid slice"
    v-html="`<g>${brandLayer}</g>`"
    aria-hidden="true"
  />
  <!-- 用户水印层: 普通混合, 较透明 -->
  <svg
    class="pointer-events-none absolute inset-0 w-full h-full"
    viewBox="0 0 1000 1000"
    preserveAspectRatio="xMidYMid slice"
    v-html="`<g>${userLayer}</g>`"
    aria-hidden="true"
  />
</template>