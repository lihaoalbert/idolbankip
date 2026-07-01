<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore, type UserRole } from '@/stores/auth';
import { useToast } from '@/composables/useToast';

const router = useRouter();
const auth = useAuthStore();
const toast = useToast();

const form = ref({
  email: '',
  password: '',
  displayName: '',
  roles: { CREATOR: false, BUYER: true },
  companyName: '',
  agree: false,
});
const error = ref('');
const loading = ref(false);

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
    if (selectedRoles.value.length > 1) router.push('/');
    else if (isCreator.value) router.push('/creator');
    else router.push('/');
  } catch (e: any) {
    const msg = e?.response?.data?.message;
    error.value = Array.isArray(msg) ? msg.join('; ') : (msg || '注册失败');
    toast.error(error.value);
  } finally { loading.value = false; }
}
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
            填写以下表单, 即可在 ibi.ren 档案库登记新条目 ·
            可同时勾选 A + B 两端身份, 一个账号完整流转。
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

          <!-- 步骤 · 01 身份选择 -->
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

          <!-- 步骤 · 02 凭证 -->
          <div class="hairline-t border-line pt-8">
            <div class="catalog-no text-ink/60 mb-4">— 02 — CREDENTIAL · 凭证</div>
            <form @submit.prevent="submit" class="space-y-5">
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
