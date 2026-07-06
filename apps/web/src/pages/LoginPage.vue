<script setup lang="ts">
/**
 * LoginPage — W3 W1 D3 Tab 框架
 * 3 Tab: [邮箱密码] [手机验证码] [微信扫码]
 * 邮箱密码保持原功能;手机/微信 D4/D5 接入, D3 阶段显示"开发中"
 */
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';

type Tab = 'email' | 'phone' | 'wechat';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const toast = useToast();

const tab = ref<Tab>('email');

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submitEmail() {
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

const tabLabel: Record<Tab, string> = {
  email: 'EMAIL · 邮箱',
  phone: 'PHONE · 手机',
  wechat: 'WECHAT · 微信',
};
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
            任选一种登记方式入馆：邮箱密钥、手机验证码、微信扫码。首次入馆即开档。
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
          <div class="flex items-baseline justify-between mb-6 pb-4 hairline-b border-line">
            <div class="catalog-no text-ink/50">CREDENTIAL FORM · 入馆登记</div>
            <div class="catalog-no text-ink/30">№ 027-{{ tab === 'email' ? 'A' : tab === 'phone' ? 'B' : 'C' }}</div>
          </div>

          <!-- W3 W1 D3: Tab 切换 (邮箱/手机/微信) -->
          <div class="grid grid-cols-3 gap-1 mb-8 border-0.5 border-line bg-cream/50 p-1">
            <button
              v-for="(t, idx) in (['email', 'phone', 'wechat'] as Tab[])"
              :key="t"
              type="button"
              @click="tab = t"
              :data-testid="`login-tab-${t}`"
              class="py-2.5 px-2 font-mono text-[10px] tracking-widest uppercase transition border-0.5"
              :class="tab === t
                ? 'bg-ink text-cream border-ink'
                : 'bg-transparent text-ink/60 border-transparent hover:text-ink hover:bg-cream'"
            >
              {{ String(idx + 1).padStart(2, '0') }} · {{ tabLabel[t] }}
            </button>
          </div>

          <!-- Tab: 邮箱密码 (现有功能, 不变) -->
          <form v-if="tab === 'email'" @submit.prevent="submitEmail" class="space-y-6">
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
          </form>

          <!-- Tab: 手机验证码 (D4 接入) -->
          <div v-else-if="tab === 'phone'" class="space-y-4">
            <div class="p-6 border-0.5 border-dashed border-line text-center text-ink/50">
              <div class="catalog-no text-gold mb-2">D4 · COMING SOON</div>
              <p class="text-sm">手机验证码登录将在 D4 接入<br>（短信 driver mock / aliyun 可切换）</p>
            </div>
            <div class="text-xs text-ink/40 space-y-1">
              <div>· 6 位数字码 · 5 分钟过期</div>
              <div>· 同号 60s 1 条 + 日 10 条上限</div>
              <div>· 错 5 次强制重发</div>
            </div>
          </div>

          <!-- Tab: 微信扫码 (D5 接入) -->
          <div v-else class="space-y-4">
            <div class="p-6 border-0.5 border-dashed border-line text-center text-ink/50">
              <div class="catalog-no text-gold mb-2">D5 · COMING SOON</div>
              <p class="text-sm">微信扫码登录将在 D5 接入<br>（开放平台 OAuth · PC 端扫码）</p>
            </div>
            <div class="text-xs text-ink/40 space-y-1">
              <div>· 开放平台网站应用 AppID</div>
              <div>· 首次扫码引导补手机号</div>
              <div>· 同手机号 = 同账号</div>
            </div>
          </div>

          <div class="hairline-t border-line pt-6 mt-8 flex items-center justify-between text-xs">
            <p class="text-ink/60">
              还没有档案？
              <RouterLink to="/register" class="text-gold hover:underline ml-1">立即登记 →</RouterLink>
            </p>
            <RouterLink to="/contact" class="text-ink/40 hover:text-gold transition catalog-no">
              FORGOT KEY
            </RouterLink>
          </div>

          <!-- Demo 填充 (仅邮箱 Tab 可见) -->
          <div v-if="tab === 'email'" class="mt-8 pt-6 hairline-t border-line">
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
