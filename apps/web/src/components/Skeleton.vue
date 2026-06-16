<script setup lang="ts">
withDefaults(defineProps<{
  /** 形状: line (文本行) / circle (头像/缩略图) / block (图片块) */
  shape?: 'line' | 'circle' | 'block';
  /** line 变体的行宽比例, 0-100。用于让骨架行有自然的长度变化 */
  width?: number;
  /** block 变体的纵横比, 例如 '16/9' */
  aspect?: string;
  /** 自定义高度 (Tailwind class, 如 h-4 / h-32) */
  heightClass?: string;
  /** 自定义宽度 (Tailwind class, 如 w-32) */
  widthClass?: string;
  /** 多行 line 模式 */
  lines?: number;
}>(), {
  shape: 'line',
  width: 100,
  aspect: '1/1',
  heightClass: 'h-3',
  widthClass: '',
  lines: 1,
});
</script>

<template>
  <!-- 块: 图片 / 卡片 -->
  <div
    v-if="shape === 'block'"
    :class="['skeleton-shimmer rounded-2xl bg-line/60', widthClass]"
    :style="{ aspectRatio: aspect }"
  />
  <!-- 圆: 头像 / 缩略图 -->
  <div
    v-else-if="shape === 'circle'"
    :class="['skeleton-shimmer rounded-full bg-line/60', widthClass || 'w-10 h-10']"
  />
  <!-- 行: 文本 -->
  <div v-else class="space-y-2">
    <div
      v-for="i in lines"
      :key="i"
      class="skeleton-shimmer rounded bg-line/60"
      :class="[heightClass, widthClass]"
      :style="{
        width: i === lines && lines > 1
          ? `${Math.max(width * 0.6, 30)}%`
          : `${width}%`,
      }"
    />
  </div>
</template>

<style scoped>
.skeleton-shimmer {
  position: relative;
  overflow: hidden;
}
.skeleton-shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.55) 50%,
    transparent 100%
  );
  animation: skeleton-shimmer 1.6s ease-in-out infinite;
  transform: translateX(-100%);
}
@keyframes skeleton-shimmer {
  100% { transform: translateX(100%); }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer::after { animation: none; display: none; }
}
</style>
