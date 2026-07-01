<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const toast = useToast();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    toast.success(`欢迎回来, ${auth.user?.displayName || auth.user?.email}`);
    const redirect = (route.query.redirect as string) || '/';
    router.push(redirect);
  } catch (e: any) {
    error.value = e?.response?.data?.message || '登录失败';
    toast.error(error.value);
  } finally { loading.value = false; }
}

function fillDemo(role: 'CREATOR' | 'BUYER') {
  email.value = role === 'CREATOR' ? 'creator@ibi.ren' : 'buyer@ibi.ren';
  password.value = 'demo1234';
}
</script>

<template>
  <div class="min-h-[88vh] bg-cream paper-grain relative">

    <!-- 顶部条 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">ibi.ren · ARCHIVE ACCESS</div>
        <div class="catalog-no text-ink/40">VOL. I — LOG-IN</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-[1320px] mx-auto px-6 lg:px-10 py-16 md:py-20 grid grid-cols-12 gap-8 lg:gap-12 relative z-10">

      <!-- 左侧 · 入馆须知 -->
      <aside class="col-span-12 md:col-span-5 lg:col-span-4 space-y-8">
        <div>
          <div class="catalog-no text-ink/50 mb-3">№ 027 · ARCHIVE ACCESS</div>
          <h1 class="font-display text-5xl md:text-6xl text-ink leading-[0.95]">
            入馆<span class="font-display-italic text-gold">凭</span>证
          </h1>
          <p class="mt-5 text-sm text-ink/60 leading-relaxed max-w-sm">
            凭档案登记的邮箱与密钥, 即可调取您的形象库、订单、已购资产与捏者工作台。
          </p>
        </div>

        <div class="hairline-t border-line pt-6">
          <div class="catalog-no text-ink/50 mb-3">CHAPTERS · 入馆后可访问</div>
          <ul class="space-y-2 font-mono text-xs uppercase tracking-widest text-ink/70">
            <li class="flex items-baseline gap-3">
              <span class="text-gold">A</span>
              <span>形象库 / 我的资产</span>
            </li>
            <li class="flex items-baseline gap-3">
              <span class="text-gold">B</span>
              <span>订单 / 授权凭证</span>
            </li>
            <li class="flex items-baseline gap-3">
              <span class="text-gold">C</span>
              <span>捏者工作台</span>
            </li>
            <li class="flex items-baseline gap-3">
              <span class="text-gold">D</span>
              <span>API Keys / 通知</span>
            </li>
          </ul>
        </div>

        <div class="hairline-t border-line pt-6">
          <div class="catalog-no text-ink/50 mb-3">CURATOR'S NOTE</div>
          <p class="font-display-italic text-sm text-ink/60 leading-relaxed">
            ibi.ren 一切凭证均经区块链时间戳校验 ·
            入馆即视为同意《用户协议》《隐私政策》。
          </p>
        </div>
      </aside>

      <!-- 右侧 · 入馆表单 -->
      <section class="col-span-12 md:col-span-7 lg:col-span-7 lg:col-start-6">
        <div class="relative bg-surface border-0.5 border-ink p-8 md:p-10">

          <!-- 印记 -->
          <div class="absolute -top-3 left-8">
            <div class="stamp text-gold bg-cream">MEMBER ACCESS</div>
          </div>

          <!-- 元数据 -->
          <div class="flex items-baseline justify-between mb-8 pb-4 hairline-b border-line">
            <div class="catalog-no text-ink/50">CREDENTIAL FORM · 入馆登记</div>
            <div class="catalog-no text-ink/30">№ 027-A</div>
          </div>

          <form @submit.prevent="submit" class="space-y-6">
            <div>
              <label class="catalog-no text-ink/60 block mb-2">EMAIL · 登记邮箱</label>
              <input
                v-model="email"
                type="email"
                required
                autocomplete="email"
                class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm"
              />
            </div>
            <div>
              <label class="catalog-no text-ink/60 block mb-2">PASSPHRASE · 密钥</label>
              <input
                v-model="password"
                type="password"
                required
                minlength="8"
                autocomplete="current-password"
                class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm"
              />
            </div>

            <div v-if="error" class="p-3 border-0.5 border-danger/40 bg-danger/5 text-danger text-sm">
              <span class="catalog-no text-danger mr-2">ERROR</span>
              {{ error }}
            </div>

            <button
              type="submit"
              :disabled="loading"
              class="w-full py-4 bg-ink text-cream hover:bg-gold transition font-display text-base tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 group"
            >
              <span class="catalog-no text-cream/70 group-hover:text-ink/70 text-[10px]">SIGN IN</span>
              <span>{{ loading ? '验证中…' : '入馆' }}</span>
              <span class="font-display-italic">→</span>
            </button>

            <div class="hairline-t border-line pt-6 flex items-center justify-between text-xs">
              <p class="text-ink/60">
                还没有档案？
                <RouterLink to="/register" class="text-gold hover:underline ml-1">立即登记 →</RouterLink>
              </p>
              <RouterLink to="/contact" class="text-ink/40 hover:text-gold transition catalog-no">
                FORGOT KEY
              </RouterLink>
            </div>
          </form>

          <!-- Demo 填充 -->
          <div class="mt-8 pt-6 hairline-t border-line">
            <div class="catalog-no text-ink/40 mb-3">DEMO KEYS · 试阅账号</div>
            <div class="grid grid-cols-2 gap-3">
              <button
                type="button"
                @click="fillDemo('CREATOR')"
                class="px-4 py-3 border-0.5 border-line bg-cream hover:border-gold hover:bg-gold/5 transition text-left group"
              >
                <div class="catalog-no text-ink/40 group-hover:text-gold">A · CREATOR</div>
                <div class="font-mono text-xs text-ink/70 mt-1">creator@ibi.ren</div>
              </button>
              <button
                type="button"
                @click="fillDemo('BUYER')"
                class="px-4 py-3 border-0.5 border-line bg-cream hover:border-gold hover:bg-gold/5 transition text-left group"
              >
                <div class="catalog-no text-ink/40 group-hover:text-gold">B · BUYER</div>
                <div class="font-mono text-xs text-ink/70 mt-1">buyer@ibi.ren</div>
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. ACCESS-027</span>
        <span>CATALOGUED BY IBI.REN ARCHIVE DEPT.</span>
        <span>© 2026</span>
      </div>
    </footer>
  </div>
</template>
