<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

onMounted(async () => {
  await auth.restore();
});
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-line bg-cream/90 backdrop-blur sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <RouterLink to="/" class="flex items-center gap-2 font-display text-xl">
          <span class="inline-block w-7 h-7 rounded-full bg-ink"></span>
          <span>ibi<span class="text-gold">.ren</span></span>
        </RouterLink>
        <nav class="flex items-center gap-6 text-sm">
          <RouterLink to="/ips" class="hover:text-gold">形象库</RouterLink>
          <RouterLink v-if="auth.role === 'CREATOR'" to="/creator" class="hover:text-gold">创作者中心</RouterLink>
          <RouterLink v-if="auth.isAuthenticated" to="/orders" class="hover:text-gold">我的订单</RouterLink>
          <RouterLink v-if="auth.isAuthenticated" to="/my-assets" class="hover:text-gold">我的资产</RouterLink>
          <template v-if="!auth.isAuthenticated">
            <RouterLink to="/login" class="hover:text-gold">登录</RouterLink>
            <RouterLink
              to="/register"
              class="px-4 py-1.5 bg-ink text-cream rounded-full hover:bg-gold transition"
              >注册</RouterLink
            >
          </template>
          <div v-else class="flex items-center gap-3">
            <span class="text-xs text-ink/60">{{ auth.user?.email }}</span>
            <button @click="auth.logout" class="text-xs underline text-ink/60 hover:text-danger">
              退出
            </button>
          </div>
        </nav>
      </div>
    </header>

    <main class="flex-1">
      <RouterView v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>

    <footer class="border-t border-line mt-12 py-8 text-center text-xs text-ink/50">
      <p>© 2026 ibi.ren · Idol Bank IP · AI 虚拟人资产银行</p>
      <p class="mt-1">所有形象已通过区块链时间戳存证 · ICP 备案中</p>
    </footer>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>