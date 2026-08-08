<script setup lang="ts">
/**
 * BindPhonePage — W3 W1 D5
 *
 * 微信首次扫码后, 跳到此页:
 *   1. 输手机号 + 收验证码
 *   2. 选身份 (CREATOR / BUYER) + displayName
 *   3. 调 /auth/wechat/bind 完成注册/合并
 *   4. 跳首页
 */
import { ref, computed, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore, type UserRole } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import { sendPhoneCode } from '@/api/auth-phone';
import { bindWechat } from '@/api/auth-wechat';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const toast = useToast();

const phone = ref((route.query.phone as string) || '');
const code = ref((route.query.code as string) || '');
const wechatCode = ref((route.query.wechatCode as string) || '');
const wechatState = ref((route.query.state as string) || '');
const displayName = ref('');
const role = ref<UserRole>('BUYER');
const error = ref('');
const phoneError = ref('');
const phoneLoading = ref(false);
const submitLoading = ref(false);
const countdown = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

const phoneValid = computed(() => /^1[3-9]\d{9}$/.test(phone.value));
const codeValid = computed(() => /^\d{4,8}$/.test(code.value));
const displayNameValid = computed(() => displayName.value.trim().length > 0);
const canSubmit = computed(() =>
  phoneValid.value && codeValid.value && displayNameValid.value && !submitLoading.value,
);

async function sendCode() {
  if (!phoneValid.value) { phoneError.value = '手机号格式不对'; return; }
  phoneError.value = '';
  try {
    const r = await sendPhoneCode(phone.value);
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

async function submit() {
  if (!canSubmit.value) return;
  error.value = '';
  submitLoading.value = true;
  try {
    const r = await bindWechat({
      wechatCode: wechatCode.value || 'mock',
      state: wechatState.value,
      phone: phone.value,
      phoneCode: code.value,
      displayName: displayName.value.trim(),
      role: role.value,
    });
    if (r.user && r.tokens) {
      auth.user = r.user;
      auth.accessToken = r.tokens.accessToken;
      auth.refreshToken = r.tokens.refreshToken;
      localStorage.setItem('ibi.auth', JSON.stringify({
        user: r.user,
        accessToken: r.tokens.accessToken,
        refreshToken: r.tokens.refreshToken,
      }));
      toast.success('绑定成功, 欢迎加入 IBIren');
      router.replace(role.value === 'CREATOR' ? '/creator' : '/');
    } else {
      // 仅绑定 (已登录用户 BIND 流程)
      toast.success('微信已绑定');
      router.replace('/');
    }
  } catch (e: any) {
    error.value = e?.response?.data?.message || '绑定失败';
    toast.error(error.value);
  } finally { submitLoading.value = false; }
}

onUnmounted(() => { if (countdownTimer) clearInterval(countdownTimer); });
</script>

<template>
  <div class="min-h-[88vh] bg-cream paper-grain relative">
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">IBIren · WECHAT BIND</div>
        <div class="catalog-no text-ink/40">VOL. I — SUPPLEMENT</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-[1320px] mx-auto px-6 lg:px-10 py-16 md:py-20">
      <div class="max-w-2xl mx-auto">
        <div class="catalog-no text-ink/50 mb-3">№ 030 · WECHAT BIND</div>
        <h1 class="font-display text-4xl md:text-5xl text-ink leading-[0.95] mb-4">
          补一个<span class="font-display-italic text-gold">手机号</span>
        </h1>
        <p class="text-sm text-ink/60 leading-relaxed max-w-md mb-10">
          微信扫码登录首次需要绑定一个手机号, 后续可直接用微信或手机号任一方式入馆。
        </p>

        <div class="relative bg-surface border-0.5 border-ink p-8 md:p-10 space-y-6">
          <div class="absolute -top-3 left-8">
            <div class="stamp text-gold bg-cream">PHONE BIND</div>
          </div>

          <div>
            <label class="catalog-no text-ink/60 block mb-2">PHONE · 手机号</label>
            <input
              v-model="phone"
              type="tel"
              inputmode="numeric"
              maxlength="11"
              placeholder="11 位国内手机号"
              :data-testid="'bindphone-phone-input'"
              class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm"
            />
          </div>

          <div>
            <label class="catalog-no text-ink/60 block mb-2">CODE · 6 位验证码</label>
            <div class="flex gap-2">
              <input
                v-model="code"
                type="text"
                inputmode="numeric"
                maxlength="6"
                placeholder="6 位码"
                :data-testid="'bindphone-code-input'"
                class="flex-1 px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm tracking-widest"
              />
              <button
                type="button"
                @click="sendCode"
                :disabled="!phoneValid || countdown > 0"
                :data-testid="'bindphone-send-code'"
                class="px-4 py-3 border-0.5 border-ink bg-ink text-cream text-xs catalog-no disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gold hover:border-gold transition"
              >
                {{ countdown > 0 ? `${countdown}s 后重发` : '发送验证码' }}
              </button>
            </div>
          </div>

          <div>
            <label class="catalog-no text-ink/60 block mb-2">DISPLAY NAME · 显示名</label>
            <input
              v-model="displayName"
              :data-testid="'bindphone-displayname'"
              placeholder="在 IBIren 展示的名字"
              class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-sans text-sm"
            />
          </div>

          <div>
            <label class="catalog-no text-ink/60 block mb-2">IDENTITY · 身份</label>
            <div class="grid grid-cols-2 gap-2">
              <label
                class="flex items-center gap-3 p-3 border-0.5 cursor-pointer transition"
                :class="role === 'CREATOR' ? 'border-gold bg-gold/5' : 'border-line bg-cream hover:border-ink'"
              >
                <input v-model="role" type="radio" value="CREATOR" class="accent-gold" />
                <div>
                  <div class="font-display text-sm">捏者 CREATOR</div>
                </div>
              </label>
              <label
                class="flex items-center gap-3 p-3 border-0.5 cursor-pointer transition"
                :class="role === 'BUYER' ? 'border-gold bg-gold/5' : 'border-line bg-cream hover:border-ink'"
              >
                <input v-model="role" type="radio" value="BUYER" class="accent-gold" />
                <div>
                  <div class="font-display text-sm">采购方 BUYER</div>
                </div>
              </label>
            </div>
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
            type="button"
            @click="submit"
            :disabled="!canSubmit"
            class="w-full py-4 bg-ink text-cream hover:bg-gold transition font-display text-base tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 group"
          >
            <span class="catalog-no text-cream/70 group-hover:text-ink/70 text-[10px]">CONFIRM</span>
            <span>{{ submitLoading ? '绑定中…' : '绑定并入馆' }}</span>
            <span class="font-display-italic">→</span>
          </button>

          <div class="hairline-t border-line pt-6 flex items-center justify-between text-xs">
            <p class="text-ink/60">
              已有档案？
              <RouterLink to="/login" class="text-gold hover:underline ml-1">直接入馆 →</RouterLink>
            </p>
            <RouterLink to="/contact" class="text-ink/40 hover:text-gold transition catalog-no">
              HELP
            </RouterLink>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>