<script setup lang="ts">
/**
 * BadgeCard — 单个徽章展示
 * tier: BRONZE | SILVER | GOLD | PLATINUM 决定边框颜色
 */
import { computed } from 'vue';
import type { HonorBadge } from '@/api/client';

const props = defineProps<{
  badge: HonorBadge;
  /** 是否已获得 (有 grantedAt = 已获得) */
  earned?: boolean;
}>();

const earned = computed(() => !!props.badge.grantedAt || props.earned);
const tierClass = computed(() => `tier-${props.badge.tier.toLowerCase()}`);
</script>

<template>
  <div class="badge-card" :class="[tierClass, { earned, locked: !earned }]">
    <div class="icon">{{ badge.icon }}</div>
    <div class="body">
      <div class="name">{{ badge.name }}</div>
      <div class="desc">{{ badge.desc }}</div>
    </div>
  </div>
</template>

<style scoped>
.badge-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--color-card-bg);
  border: 1.5px solid var(--color-border);
  transition: transform 0.15s;
}
.badge-card.earned:hover {
  transform: translateY(-1px);
}
.badge-card.locked {
  opacity: 0.45;
  filter: grayscale(0.8);
}
.badge-card .icon {
  font-size: 28px;
  flex-shrink: 0;
  width: 36px;
  text-align: center;
}
.badge-card .body {
  flex: 1;
  min-width: 0;
}
.badge-card .name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.3;
}
.badge-card .desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
  margin-top: 2px;
}
.badge-card.tier-bronze { border-color: #cd7f32; }
.badge-card.tier-silver { border-color: #c0c0c0; }
.badge-card.tier-gold { border-color: #ffd700; }
.badge-card.tier-platinum { border-color: #e5e4e2; }
</style>