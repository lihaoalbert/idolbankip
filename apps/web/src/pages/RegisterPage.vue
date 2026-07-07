<script setup lang="ts">
/**
 * RegisterPage — W3 W1 D4 手机号注册全链路
 * 3 Tab: [邮箱密码] [手机验证码] [微信扫码] (D5)
 * 01 IDENTITY 身份勾选对所有 Tab 通用;02 CREDENTIAL 凭证按 Tab 切换
 * 手机 Tab:从 ?tab=phone&phone=&code= query 预填(LoginPage needRegister 重定向)
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore, type UserRole } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import { sendPhoneCode } from '@/api/auth-phone';

type Tab = 'email' | 'phone' | 'wechat';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const toast = useToast();

const tab = ref<Tab>('email');

const form = ref({
  email: '',
  password: '',
  phone: '',
  phoneCode: '',
  displayName: '',
  roles: { CREATOR: false, BUYER: true },
  companyName: '',
  agree: false,
});
const error = ref('');
const loading = ref(false);

// 手机号验证码 — D4
const phoneError = ref('');
const countdown = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  // 从 LoginPage needRegister 重定向过来: ?tab=phone&phone=...&code=...
  const qTab = route.query.tab as string | undefined;
  const qPhone = route.query.phone as string | undefined;
  const qCode = route.query.code as string | undefined;
  if (qTab === 'phone' && qPhone) {
    tab.value = 'phone';
    form.value.phone = qPhone;
    if (qCode) form.value.phoneCode = qCode;
  }
});

const phoneValid = computed(() => /^1[3-9]\d{9}$/.test(form.value.phone));
const phoneCanSubmit = computed(() =>
  phoneValid.value && /^\d{4,8}$/.test(form.value.phoneCode) && form.value.displayName.trim().length > 0 && !loading.value,
);

async function sendCode() {
  if (!phoneValid.value) { phoneError.value = '手机号格式不对'; return; }
  phoneError.value = '';
  try {
    const r = await sendPhoneCode(form.value.phone);
    toast.success(`验证码已发送, ${r.ttlSec} 秒内有效`);
    countdown.value = 60;
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0 && countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }, 1000);
  } catch (e: any) {
    phoneError.value = e?.response?.data?.message || '发送失败';
    toast.error(phoneError.value);
  }
}

const selectedRoles = computed<UserRole[]>(() => {
  const out: UserRole[] = [];
  if (form.value.roles.CREATOR) out.push('CREATOR');
  if (form.value.roles.BUYER) out.push('BUYER');
  return out;
});

const isBuyer = computed(() => form.value.roles.BUYER);
const isCreator = computed(() => form.value.roles.CREATOR);

async function submit() {
  if (!form.value.agree) { error.value = '请先同意用户协议'; return; }
  if (selectedRoles.value.length === 0) {
    error.value = '请至少勾选一个身份 (捏者 / 采购方)';
    return;
  }
  error.value = '';
  if (tab.value === 'email') {
    loading.value = true;
    try {
      await auth.register({
        email: form.value.email,
        password: form.value.password,
        roles: selectedRoles.value,
        displayName: form.value.displayName,
        companyName: isBuyer.value ? form.value.companyName : undefined,
      });
      toast.success('登记成功, 欢迎加入 ibi.ren');
      if (isCreator.value) router.push('/creator');
      else router.push('/');
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      error.value = Array.isArray(msg) ? msg.join('; ') : (msg || '注册失败');
      toast.error(error.value);
    } finally { loading.value = false; }
    return;
  }
  if (tab.value === 'phone') {
    if (!phoneCanSubmit.value) {
      error.value = '请填写完整的手机号 + 验证码 + 显示名';
      return;
    }
    loading.value = true;
    try {
      const r = await auth.loginWithPhone(form.value.phone, form.value.phoneCode, {
        role: selectedRoles.value[0], // 后端目前接受单个 role
        displayName: form.value.displayName.trim(),
      });
      if (r.needRegister) {
        toast.info('验证码已通过, 请填写完整身份信息后提交');
        error.value = '';
        return;
      }
      toast.success('登记成功, 欢迎加入 ibi.ren');
      if (isCreator.value) router.push('/creator');
      else router.push('/');
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      error.value = Array.isArray(msg) ? msg.join('; ') : (msg || '注册失败');
      toast.error(error.value);
    } finally { loading.value = false; }
    return;
  }
  if (tab.value === 'wechat') {
    error.value = '微信扫码注册走 D5 流程, 请到登录页扫码';
    toast.error(error.value);
    return;
  }
}

onUnmounted(() => { if (countdownTimer) clearInterval(countdownTimer); });

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
        <div class="catalog-no text-ink/50">ibi.ren · NEW ENTRY</div>
        <div class="catalog-no text-ink/40">VOL. I — ENROLMENT</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-[1320px] mx-auto px-6 lg:px-10 py-16 md:py-20 grid grid-cols-12 gap-8 lg:gap-12 relative z-10">

      <!-- 左侧 · 登记说明 -->
      <aside class="col-span-12 md:col-span-5 lg:col-span-4 space-y-8">
        <div>
          <div class="catalog-no text-ink/50 mb-3">№ 028 · NEW ENTRY</div>
          <h1 class="font-display text-5xl md:text-6xl text-ink leading-[0.95]">
            新入<span class="font-display-italic text-gold">馆</span>登记
          </h1>
          <p class="mt-5 text-sm text-ink/60 leading-relaxed max-w-sm">
            任选一种登记方式, 可同时勾选 A + B 两端身份, 一个账号完整流转。
          </p>
        </div>

        <div class="hairline-t border-line pt-6">
          <div class="catalog-no text-ink/50 mb-3">DUAL ENTRY · 双身份</div>
          <ul class="space-y-3 font-sans text-sm">
            <li class="flex items-baseline gap-3">
              <span class="catalog-no text-gold shrink-0">A</span>
              <div>
                <div class="text-ink">捏者 CREATOR</div>
                <div class="text-xs text-ink/50">上传资产 / 设置授权价 / 获得分成</div>
              </div>
            </li>
            <li class="flex items-baseline gap-3">
              <span class="catalog-no text-gold shrink-0">B</span>
              <div>
                <div class="text-ink">采购方 BUYER</div>
                <div class="text-xs text-ink/50">浏览形象 / 支付意向金 / 下载资产</div>
              </div>
            </li>
          </ul>
        </div>

        <div class="hairline-t border-line pt-6">
          <div class="catalog-no text-ink/50 mb-3">SECURITY · 安全</div>
          <p class="font-display-italic text-sm text-ink/60 leading-relaxed">
            所有登记信息均经国密 SM2 加密 ·
            区块链时间戳登记 · 不可篡改。
          </p>
        </div>

        <div class="hairline-t border-line pt-6">
          <p class="text-sm text-ink/60">
            已有档案？
            <RouterLink to="/login" class="text-gold hover:underline ml-1">直接入馆 →</RouterLink>
          </p>
        </div>
      </aside>

      <!-- 右侧 · 登记表 -->
      <section class="col-span-12 md:col-span-7 lg:col-span-7 lg:col-start-6">
        <div class="relative bg-surface border-0.5 border-ink p-8 md:p-10">

          <div class="absolute -top-3 left-8">
            <div class="stamp text-gold bg-cream">ENROLMENT FORM</div>
          </div>

          <!-- W3 W1 D3: 凭证方式 Tab -->
          <div class="grid grid-cols-3 gap-1 mb-8 border-0.5 border-line bg-cream/50 p-1">
            <button
              v-for="(t, idx) in (['email', 'phone', 'wechat'] as Tab[])"
              :key="t"
              type="button"
              @click="tab = t"
              :data-testid="`register-tab-${t}`"
              class="py-2.5 px-2 font-mono text-[10px] tracking-widest uppercase transition border-0.5"
              :class="tab === t
                ? 'bg-ink text-cream border-ink'
                : 'bg-transparent text-ink/60 border-transparent hover:text-ink hover:bg-cream'"
            >
              {{ String(idx + 1).padStart(2, '0') }} · {{ tabLabel[t] }}
            </button>
          </div>

          <!-- 步骤 · 01 身份选择 (三 Tab 通用) -->
          <div class="mb-8">
            <div class="flex items-baseline justify-between mb-4">
              <div class="catalog-no text-ink/60">— 01 — IDENTITY · 身份</div>
              <div class="catalog-no text-ink/30">{{ selectedRoles.length }} of 2 selected</div>
            </div>
            <div class="space-y-3">
              <label
                class="flex items-start gap-4 p-4 border-0.5 cursor-pointer transition"
                :class="form.roles.CREATOR ? 'border-gold bg-gold/5' : 'border-line bg-cream hover:border-ink'"
              >
                <input v-model="form.roles.CREATOR" type="checkbox" class="mt-1 accent-gold" />
                <div class="flex-1">
                  <div class="flex items-baseline gap-2">
                    <span class="catalog-no text-gold">A</span>
                    <span class="font-display text-base text-ink">捏者 CREATOR</span>
                  </div>
                  <div class="text-xs text-ink/60 mt-1">上传虚拟人资产 / 设置授权价 / 获分成</div>
                </div>
              </label>

              <label
                class="flex items-start gap-4 p-4 border-0.5 cursor-pointer transition"
                :class="form.roles.BUYER ? 'border-gold bg-gold/5' : 'border-line bg-cream hover:border-ink'"
              >
                <input v-model="form.roles.BUYER" type="checkbox" class="mt-1 accent-gold" />
                <div class="flex-1">
                  <div class="flex items-baseline gap-2">
                    <span class="catalog-no text-gold">B</span>
                    <span class="font-display text-base text-ink">采购方 BUYER</span>
                  </div>
                  <div class="text-xs text-ink/60 mt-1">浏览形象库 / 支付意向金 / 下载资产包</div>
                </div>
              </label>
            </div>
          </div>

          <!-- 步骤 · 02 凭证 (按 Tab 切换) -->
          <div class="hairline-t border-line pt-8">
            <div class="catalog-no text-ink/60 mb-4">— 02 — CREDENTIAL · 凭证</div>

            <!-- 02-A: 邮箱密码 (现有功能) -->
            <form v-if="tab === 'email'" @submit.prevent="submit" class="space-y-5">
              <div>
                <label class="catalog-no text-ink/60 block mb-2">EMAIL · 邮箱</label>
                <input v-model="form.email" type="email" required autocomplete="email"
                  class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm" />
              </div>
              <div>
                <label class="catalog-no text-ink/60 block mb-2">PASSPHRASE · 密钥 (≥8 位)</label>
                <input v-model="form.password" type="password" required minlength="8" autocomplete="new-password"
                  class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm" />
              </div>
              <div>
                <label class="catalog-no text-ink/60 block mb-2">DISPLAY NAME · 显示名</label>
                <input v-model="form.displayName" required
                  class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-sans text-sm" />
              </div>
              <div v-if="isBuyer">
                <label class="catalog-no text-ink/60 block mb-2">COMPANY · 公司名称 <span class="text-ink/30">(选填)</span></label>
                <input v-model="form.companyName"
                  class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-sans text-sm" />
              </div>
              <div class="hairline-t border-line pt-6">
                <label class="flex items-start gap-3 text-xs text-ink/60 cursor-pointer">
                  <input v-model="form.agree" type="checkbox" class="mt-0.5 accent-gold" />
                  <span>
                    我已阅读并同意
                    <a href="#" class="text-gold hover:underline">《用户协议》</a>
                    <a href="#" class="text-gold hover:underline">《隐私政策》</a>
                    <a href="#" class="text-gold hover:underline">《AI 形象版权声明》</a>
                  </span>
                </label>
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
                <span class="catalog-no text-cream/70 group-hover:text-ink/70 text-[10px]">FILE ENTRY</span>
                <span>{{ loading ? '提交中…' : '登记并入馆' }}</span>
                <span class="font-display-italic">→</span>
              </button>
            </form>

            <!-- 02-B: 手机验证码 (D4) -->
            <form v-else-if="tab === 'phone'" @submit.prevent="submit" class="space-y-5">
              <div>
                <label class="catalog-no text-ink/60 block mb-2">PHONE · 手机号</label>
                <input
                  v-model="form.phone"
                  type="tel"
                  inputmode="numeric"
                  maxlength="11"
                  placeholder="11 位国内手机号"
                  :data-testid="'register-phone-input'"
                  class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm"
                />
              </div>
              <div>
                <label class="catalog-no text-ink/60 block mb-2">CODE · 6 位验证码</label>
                <div class="flex gap-2">
                  <input
                    v-model="form.phoneCode"
                    type="text"
                    inputmode="numeric"
                    maxlength="6"
                    placeholder="6 位码"
                    :data-testid="'register-phone-code-input'"
                    class="flex-1 px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm tracking-widest"
                  />
                  <button
                    type="button"
                    @click="sendCode"
                    :disabled="!phoneValid || countdown > 0"
                    :data-testid="'register-phone-send-code'"
                    class="px-4 py-3 border-0.5 border-ink bg-ink text-cream text-xs catalog-no disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gold hover:border-gold transition"
                  >
                    {{ countdown > 0 ? `${countdown}s 后重发` : '发送验证码' }}
                  </button>
                </div>
              </div>
              <div>
                <label class="catalog-no text-ink/60 block mb-2">DISPLAY NAME · 显示名</label>
                <input
                  v-model="form.displayName"
                  :data-testid="'register-display-name'"
                  placeholder="在 ibi.ren 展示的名字"
                  class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-sans text-sm"
                />
              </div>
              <div v-if="isBuyer">
                <label class="catalog-no text-ink/60 block mb-2">COMPANY · 公司名称 <span class="text-ink/30">(选填)</span></label>
                <input v-model="form.companyName"
                  class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-sans text-sm" />
              </div>
              <div class="hairline-t border-line pt-6">
                <label class="flex items-start gap-3 text-xs text-ink/60 cursor-pointer">
                  <input v-model="form.agree" type="checkbox" class="mt-0.5 accent-gold" />
                  <span>
                    我已阅读并同意
                    <a href="#" class="text-gold hover:underline">《用户协议》</a>
                    <a href="#" class="text-gold hover:underline">《隐私政策》</a>
                    <a href="#" class="text-gold hover:underline">《AI 形象版权声明》</a>
                  </span>
                </label>
              </div>

              <div v-if="error" class="p-3 border-0.5 border-danger/40 bg-danger/5 text-danger text-sm">
                <span class="catalog-no text-danger mr-2">ERROR</span>
                {{ error }}
              </div>
              <div v-else-if="phoneError" class="p-3 border-0.5 border-danger/40 bg-danger/5 text-danger text-sm">
                <span class="catalog-no text-danger mr-2">ERROR</span>
                {{ phoneError }}
              </div>

              <button
                type="submit"
                :disabled="!phoneCanSubmit || loading"
                class="w-full py-4 bg-ink text-cream hover:bg-gold transition font-display text-base tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 group"
              >
                <span class="catalog-no text-cream/70 group-hover:text-ink/70 text-[10px]">FILE ENTRY</span>
                <span>{{ loading ? '提交中…' : '登记并入馆' }}</span>
                <span class="font-display-italic">→</span>
              </button>
            </form>

            <!-- 02-C: 微信扫码 (D5 接入) -->
            <div v-else class="space-y-5">
              <div class="p-6 border-0.5 border-dashed border-line text-center text-ink/50">
                <div class="catalog-no text-gold mb-2">D5 · COMING SOON</div>
                <p class="text-sm">微信扫码注册在 D5 接入</p>
                <p class="text-xs mt-2">首次扫码 → 引导补手机号 → 选身份 → 入馆</p>
              </div>
              <div class="text-xs text-ink/40 space-y-1 px-2">
                <div>· 完成 01 步骤身份勾选后, 在登录页扫码触发</div>
                <div>· 同手机号 = 同账号, 已有账号直接合并</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. ENTRY-028</span>
        <span>CATALOGUED BY IBI.REN ARCHIVE DEPT.</span>
        <span>© 2026</span>
      </div>
    </footer>
  </div>
</template>