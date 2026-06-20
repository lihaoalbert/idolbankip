<script setup lang="ts">
/**
 * HonorChip — 等级 + 称号 + emoji, 用在作者名旁 / 头部
 * 接受 HonorLevelInfo 形状 (api/client.ts 已定义)
 */
import { computed } from 'vue';
import type { HonorLevelInfo } from '@/api/client';

const props = defineProps<{
  level: HonorLevelInfo;
  /** 'chip' = 小色块; 'block' = 大块带名字 (用于个人主页头部) */
  variant?: 'chip' | 'block';
}>();

const variant = computed(() => props.variant ?? 'chip');
</script>

<template>
  <span
    v-if="variant === 'chip'"
    class="honor-chip"
    :style="{ backgroundColor: level.colorHex + '20', borderColor: level.colorHex, color: level.colorHex }"
    :title="`Lv.${level.level} ${level.title}`"
  >
    <span class="icon">{{ level.icon }}</span>
    <span class="title">Lv.{{ level.level }} {{ level.title }}</span>
  </span>
  <div
    v-else
    class="honor-block"
    :style="{ borderColor: level.colorHex, backgroundColor: level.colorHex + '15' }"
  >
    <span class="big-icon" :style="{ color: level.colorHex }">{{ level.icon }}</span>
    <div class="info">
      <div class="level" :style="{ color: level.colorHex }">Lv.{{ level.level }}</div>
      <div class="title">{{ level.title }}</div>
    </div>
  </div>
</template>

<style scoped>
.honor-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}
.honor-chip .icon {
  font-size: 14px;
}
.honor-chip .title {
  letter-spacing: 0.02em;
}

.honor-block {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-radius: 12px;
  border: 2px solid;
}
.honor-block .big-icon {
  font-size: 36px;
  line-height: 1;
}
.honor-block .info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.honor-block .level {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.honor-block .title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}
</style>