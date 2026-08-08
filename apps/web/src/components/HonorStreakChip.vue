<script setup lang="ts">
/**
 * HonorStreakChip — 🔥 连续活跃天数, 可点击跳转到个人主页
 */
import { computed } from 'vue';

const props = defineProps<{
  current: number;
  longest?: number;
  variant?: 'chip' | 'inline';
}>();

const variant = computed(() => props.variant ?? 'chip');
</script>

<template>
  <span v-if="variant === 'chip'" class="streak-chip" :title="longest ? `最长 ${longest} 天` : ''">
    <span class="fire">🔥</span>
    <span class="count">连续 {{ current }} 天</span>
    <span v-if="longest && longest > current" class="longest">· 最长 {{ longest }}</span>
  </span>
  <span v-else class="streak-inline">
    <span class="fire">🔥</span> 连续 {{ current }} 天
  </span>
</template>

<style scoped>
.streak-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #fff7ed, #fed7aa);
  border: 1px solid #fb923c;
  color: #9a3412;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
.streak-chip .fire {
  font-size: 14px;
}
.streak-chip .longest {
  color: #c2410c;
  font-size: 11px;
  opacity: 0.85;
}

.streak-inline {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: #9a3412;
  font-size: 13px;
}
.streak-inline .fire {
  font-size: 15px;
}
</style>