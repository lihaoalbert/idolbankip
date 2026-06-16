<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useAuthStore, type UserRole } from '@/stores/auth';
import { useDarkMode } from '@/composables/useDarkMode';
import ToastContainer from '@/components/ToastContainer.vue';

const auth = useAuthStore();
const { theme, toggle: toggleTheme } = useDarkMode();

onMounted(async () => {
  await auth.restore();
});

const showCreatorLink = computed(() => auth.hasAnyRole(['CREATOR']));
const showBuyerLinks = computed(() => auth.hasAnyRole(['BUYER']));
const isMultiRole = computed(() => auth.roles.length > 1);

function switchRole(r: UserRole) {
  auth.setActiveRole(r === auth.currentRole ? null : r);
}
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
          <RouterLink v-if="showCreatorLink" to="/creator" class="hover:text-gold">创作者中心</RouterLink>
          <RouterLink v-if="showBuyerLinks && auth.isAuthenticated" to="/orders" class="hover:text-gold">我的订单</RouterLink>
          <RouterLink v-if="showBuyerLinks" to="/my-assets" class="hover:text-gold">我的资产</RouterLink>
          <template v-if="!auth.isAuthenticated">
            <RouterLink to="/login" class="hover:text-gold">登录</RouterLink>
            <RouterLink
              to="/register"
              class="px-4 py-1.5 bg-ink text-cream rounded-full hover:bg-gold transition"
              >注册</RouterLink
            >
          </template>
          <div v-else class="flex items-center gap-3">
            <div v-if="isMultiRole" class="flex items-center gap-1 text-xs">
              <span class="text-ink/50">身份:</span>
              <button
                v-for="r in auth.roles"
                :key="r"
                @click="switchRole(r)"
                :class="auth.currentRole === r ? 'bg-ink text-cream' : 'bg-white dark:bg-surface border border-line text-ink/70'"
                class="px-2 py-0.5 rounded-full transition hover:border-gold"
              >
                {{ r === 'CREATOR' ? '创作者' : r === 'BUYER' ? '采购方' : '管理员' }}
              </button>
            </div>
            <span v-else class="text-xs text-ink/60">
              {{ auth.currentRole === 'CREATOR' ? '创作者' : auth.currentRole === 'BUYER' ? '采购方' : auth.currentRole === 'ADMIN' ? '管理员' : '' }}
            </span>
            <span class="text-xs text-ink/60">·</span>
            <span class="text-xs text-ink/60">{{ auth.user?.email }}</span>
            <button @click="auth.logout" class="text-xs underline text-ink/60 hover:text-danger">
              退出
            </button>
          </div>
          <!-- 主题切换 -->
          <button
            @click="toggleTheme"
            :title="theme === 'dark' ? '切换到亮色' : '切换到暗色'"
            aria-label="切换主题"
            class="w-8 h-8 flex items-center justify-center rounded-full border border-line hover:border-gold hover:bg-cream dark:hover:bg-surface-2 transition"
          >
            <!-- 亮色模式: 显示月亮 (点击进入暗色) -->
            <svg v-if="theme === 'light'" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-ink/70">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <!-- 暗色模式: 显示太阳 (点击回到亮色) -->
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gold">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          </button>
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

    <ToastContainer />

    <footer class="border-t border-line mt-12 py-8 text-center text-xs text-ink/50 dark:text-ink/40">
      <p>© 2026 ibi.ren · Idol Bank IP · AI 虚拟人资产银行</p>
      <p class="mt-1">所有形象已通过区块链时间戳存证 · ICP 备案中</p>
    </footer>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
