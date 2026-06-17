<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';

/**
 * "成为创作者" 入口 — 根据登录状态 + 角色决定目标:
 *   未登录                          → /register
 *   已登录, 仅有 BUYER 角色         → /creator/onboard (KYC + 升级引导)
 *   已登录, 已是 CREATOR / ADMIN    → 不渲染
 *
 * 用法: <BecomeCreatorLink class="px-6 py-3 ...">成为创作者</BecomeCreatorLink>
 * slot 让调用方传样式和文案,组件只负责可见性 + 目标路由
 */
const auth = useAuthStore();

const shouldShow = computed(() => {
  if (!auth.isAuthenticated) return true;
  return auth.hasAnyRole(['BUYER']) && !auth.hasAnyRole(['CREATOR', 'ADMIN']);
});

const target = computed(() => {
  if (!auth.isAuthenticated) return '/register';
  return '/creator/onboard';
});
</script>

<template>
  <RouterLink v-if="shouldShow" :to="target">
    <slot />
  </RouterLink>
</template>
