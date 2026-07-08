<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
onMounted(() => auth.bootstrap());
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header v-if="auth.isAuthenticated" class="bg-ink text-cream">
      <div class="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
        <RouterLink to="/" class="flex items-center gap-2 font-display text-lg">
          <img src="/logo.png" alt="ibi.ren" class="w-7 h-7 brightness-0 invert" />
          <span>ibi.ren <span class="text-gold">·</span> Admin</span>
        </RouterLink>
        <nav class="flex items-center gap-1 text-sm">
          <RouterLink to="/" class="px-3 py-1.5 rounded-full hover:bg-white/10" active-class="bg-white/10">仪表盘</RouterLink>
          <RouterLink to="/ips/queue" class="px-3 py-1.5 rounded-full hover:bg-white/10" active-class="bg-white/10">IP 审核</RouterLink>
          <RouterLink to="/kyc/queue" class="px-3 py-1.5 rounded-full hover:bg-white/10" active-class="bg-white/10">KYC 审核</RouterLink>
          <RouterLink to="/cert/queue" class="px-3 py-1.5 rounded-full hover:bg-white/10" active-class="bg-white/10">版权证书</RouterLink>
          <RouterLink to="/tasks" class="px-3 py-1.5 rounded-full hover:bg-white/10" active-class="bg-white/10">任务中心</RouterLink>
          <RouterLink to="/orders" class="px-3 py-1.5 rounded-full hover:bg-white/10" active-class="bg-white/10">订单</RouterLink>
          <RouterLink to="/users" class="px-3 py-1.5 rounded-full hover:bg-white/10" active-class="bg-white/10">用户</RouterLink>
          <RouterLink to="/settings/llm" class="px-3 py-1.5 rounded-full hover:bg-white/10" active-class="bg-white/10">系统设置</RouterLink>
        </nav>
        <div class="flex-1"></div>
        <span class="text-xs text-cream/60">{{ auth.user?.email }}</span>
        <button @click="auth.logout()" class="text-xs px-3 py-1.5 border border-cream/20 rounded-full hover:bg-white/10">退出</button>
      </div>
    </header>
    <main class="flex-1">
      <RouterView />
    </main>
    <footer v-if="auth.isAuthenticated" class="border-t border-line py-4 text-center text-xs text-ink/40">
      <div>© 2026 ibi.ren · Admin</div>
      <div class="mt-1">
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-ink"
          >沪ICP备11033154号-29</a
        >
      </div>
    </footer>
  </div>
</template>
