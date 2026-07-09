<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useDarkMode } from '@/composables/useDarkMode';
import { ossUrl } from '@/api/client';
import ToastContainer from '@/components/ToastContainer.vue';
import BecomeCreatorLink from '@/components/BecomeCreatorLink.vue';
import NotificationBell from '@/components/NotificationBell.vue';
import FloatingChat from '@/components/assistant/FloatingChat.vue';

const auth = useAuthStore();
const { theme, toggle: toggleTheme } = useDarkMode();

onMounted(async () => {
  await auth.restore();
});

const showCreatorLink = computed(() => auth.hasAnyRole(['CREATOR']));
const showBuyerLinks = computed(() => auth.hasAnyRole(['BUYER']));

// 用户菜单 — header 头像下拉
const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);
function onDocClick(e: MouseEvent) {
  if (menuOpen.value && menuRef.value && !menuRef.value.contains(e.target as Node)) {
    menuOpen.value = false;
  }
}
onMounted(() => document.addEventListener('click', onDocClick));
onUnmounted(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-line bg-cream/90 backdrop-blur sticky top-0 z-40 print:hidden">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <RouterLink to="/" class="flex items-center gap-2 font-display text-xl">
          <img src="/logo.svg" alt="IBIren" class="w-8 h-8" />
          <span>ibi<span class="text-gold">.ren</span></span>
        </RouterLink>
        <nav class="flex items-center gap-6 text-sm">
          <RouterLink to="/ips" class="hover:text-gold">形象库</RouterLink>
          <RouterLink to="/studio/catalog" class="hover:text-gold">标准服务</RouterLink>
          <RouterLink to="/studio/standards" class="hover:text-gold">平台标准</RouterLink>
          <RouterLink to="/contact" class="hover:text-gold">联系商务</RouterLink>
          <RouterLink to="/assistant" class="hover:text-gold">AI 助手</RouterLink>
          <RouterLink v-if="showCreatorLink" to="/creator" class="hover:text-gold">捏者中心</RouterLink>
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
            <NotificationBell />
            <div ref="menuRef" class="relative">
              <button
                @click="menuOpen = !menuOpen"
                class="flex items-center gap-2 hover:opacity-80 transition"
                aria-label="用户菜单"
              >
                <img
                  v-if="auth.user?.avatarUrl"
                  :src="ossUrl(auth.user.avatarUrl)"
                  :alt="auth.user.displayName"
                  class="w-8 h-8 rounded-full object-cover border-0.5 border-line"
                  referrerpolicy="no-referrer"
                />
                <div
                  v-else
                  class="w-8 h-8 rounded-full bg-ink text-cream flex items-center justify-center text-xs font-display border-0.5 border-line"
                >
                  {{ auth.user?.displayName?.slice(0, 1) }}
                </div>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="currentColor"
                  class="text-ink/40"
                  :class="{ 'rotate-180': menuOpen }"
                  style="transition: transform 0.18s"
                >
                  <path d="M2 3.5l3 3 3-3" />
                </svg>
              </button>
              <transition name="fade">
                <div
                  v-if="menuOpen"
                  class="absolute right-0 top-full mt-2 w-56 bg-surface border-0.5 border-ink shadow-xl z-50"
                >
                  <div class="px-4 py-3 border-b border-line">
                    <div class="text-sm text-ink truncate font-medium">{{ auth.user?.displayName }}</div>
                    <div class="text-[10px] text-ink/50 truncate font-mono mt-0.5">{{ auth.user?.email }}</div>
                  </div>
                  <RouterLink
                    to="/settings"
                    @click="menuOpen = false"
                    class="block px-4 py-2.5 text-sm text-ink hover:bg-cream transition"
                  >
                    个人设置
                  </RouterLink>
                  <RouterLink
                    :to="`/u/${auth.user?.id}`"
                    @click="menuOpen = false"
                    class="block px-4 py-2.5 text-sm text-ink hover:bg-cream transition"
                  >
                    我的公开主页
                  </RouterLink>
                  <RouterLink
                    v-if="showCreatorLink"
                    to="/creator"
                    @click="menuOpen = false"
                    class="block px-4 py-2.5 text-sm text-ink hover:bg-cream transition"
                  >
                    捏者中心
                  </RouterLink>
                  <RouterLink
                    v-if="showBuyerLinks"
                    to="/orders"
                    @click="menuOpen = false"
                    class="block px-4 py-2.5 text-sm text-ink hover:bg-cream transition"
                  >
                    我的订单
                  </RouterLink>
                  <button
                    @click="auth.logout"
                    class="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-cream hover:text-danger transition border-t border-line"
                  >
                    退出登录
                  </button>
                </div>
              </transition>
            </div>
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
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41 1.41" />
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

    <FloatingChat />

    <footer class="border-t border-line mt-12 py-10 print:hidden">
      <div class="max-w-7xl mx-auto px-6 grid md:grid-cols-3 gap-8 text-sm">
        <div>
          <div class="flex items-center gap-2 font-display text-lg mb-2">
            <span class="inline-block w-6 h-6 rounded-full bg-ink"></span>
            <span>ibi<span class="text-gold">.ren</span></span>
          </div>
          <p class="text-xs text-ink/50 leading-relaxed">中国首个 AI 虚拟人资产银行 · 把 AI 创造的虚拟形象, 变成可确权、可授权、可交易的标准化数字资产。</p>
        </div>
        <div>
          <h4 class="font-medium mb-3">商务合作</h4>
          <ul class="space-y-1.5 text-xs text-ink/60">
            <li>🐧 企业微信: <span class="font-mono">ibi-ren-biz</span></li>
            <li>📧 邮箱: <a href="mailto:biz@ibi.ren" class="text-gold hover:underline">biz@ibi.ren</a></li>
            <li>📞 电话: <span class="font-mono">400 880 1380</span> (工作日 10:00–19:00)</li>
            <li><RouterLink to="/contact" class="text-gold hover:underline">联系商务 →</RouterLink></li>
          </ul>
        </div>
        <div>
          <h4 class="font-medium mb-3">产品</h4>
          <ul class="space-y-1.5 text-xs text-ink/60">
            <li><RouterLink to="/ips" class="hover:text-ink">形象库</RouterLink></li>
            <li><BecomeCreatorLink class="hover:text-ink">成为捏者</BecomeCreatorLink></li>
            <li><RouterLink to="/guide/creator" class="hover:text-ink">捏者使用手册</RouterLink></li>
            <li><RouterLink to="/guide/face" class="hover:text-ink">捏脸提示词教程</RouterLink></li>
            <li><span class="text-ink/30">所有形象已通过区块链时间戳存证</span></li>
          </ul>
        </div>
      </div>
      <div class="max-w-7xl mx-auto px-6 mt-8 pt-6 border-t border-line text-center text-xs text-ink/40 space-y-1">
        <div>© 2026 IBIren</div>
        <div>
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-ink"
            >沪ICP备11033154号-29</a
          >
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
