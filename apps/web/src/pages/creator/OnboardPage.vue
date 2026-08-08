<script setup lang="ts">
/**
 * 升级为创作者 · ARCHIVE ONBOARDING
 * KYC 实名认证 + 进入捏者中心的引导流程
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';
import Skeleton from '@/components/Skeleton.vue';

const toast = useToast();
const router = useRouter();
const auth = useAuthStore();

const loading = ref(true);
const kycStatus = ref<string>('NOT_SUBMITTED');
const rejectReason = ref<string | null>(null);
const submittedAt = ref<string | null>(null);
const submitting = ref(false);
const upgrading = ref(false);

const form = ref({
  realName: '',
  idNumber: '',
  phone: '',
});

async function fetchStatus() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/kyc/status');
    kycStatus.value = data.status ?? 'NOT_SUBMITTED';
    rejectReason.value = data.latest?.notes ?? null;
    submittedAt.value = data.latest?.createdAt ?? null;
  } catch (e) {
    toast.error('获取 KYC 状态失败');
  } finally {
    loading.value = false;
  }
}

const pendingDays = computed(() => {
  if (!submittedAt.value) return null;
  const ms = Date.now() - new Date(submittedAt.value).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
});

async function submit() {
  if (!form.value.realName.trim() || !form.value.idNumber.trim()) {
    toast.error('请填写真实姓名和身份证号');
    return;
  }
  submitting.value = true;
  try {
    const { data } = await apiClient.post('/kyc/submit', form.value);
    toast.success('KYC 已提交, 审核结果会通过站内通知');
    if (data?.submission?.status === 'APPROVED') {
      try { await auth.refresh(); } catch {}
      await auth.fetchMe();
    }
    await fetchStatus();
  } catch (e: any) {
    const msg = e?.response?.data?.message ?? '提交失败';
    toast.error(Array.isArray(msg) ? msg.join('; ') : msg);
  } finally {
    submitting.value = false;
  }
}

async function goToCreator() {
  upgrading.value = true;
  try {
    try { await auth.refresh(); } catch {}
    await auth.fetchMe();
    if (!auth.isCreator) {
      toast.error('CREATOR 角色未生效, 请重新登录');
      upgrading.value = false;
      return;
    }
    await router.push('/creator');
  } catch {
    toast.error('进入捏者中心失败');
    upgrading.value = false;
  }
}

onMounted(fetchStatus);
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <!-- 顶部条 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">IBIren · ARCHIVE ONBOARDING</div>
        <div class="catalog-no text-ink/40">VOL. I — KYC</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-6 lg:px-10 py-12 md:py-20">

      <!-- HERO -->
      <section class="mb-12 md:mb-16">
        <div class="catalog-no text-ink/50 mb-3">№ 030 · ARCHIVE ONBOARDING</div>
        <h1 class="font-display text-5xl md:text-7xl text-ink leading-[0.95]">
          升级为<span class="font-display-italic text-gold">捏</span>脸师
        </h1>
        <p class="mt-5 text-base md:text-lg text-ink/60 max-w-xl leading-relaxed">
          想把自己创造的虚拟形象上架到 IBIren?
          <span class="font-display-italic text-ink">完成 KYC 认证即可开通捏者权限</span>
          —— 通常 1-2 个工作日审核完成。
        </p>
      </section>

      <!-- PENDING 顶部 banner -->
      <div
        v-if="!loading && kycStatus === 'PENDING'"
        class="mb-10 bg-surface border-0.5 border-blue-200/60 p-6 md:p-8 relative overflow-hidden"
      >
        <div class="absolute top-4 right-4 stamp text-blue-700 border-blue-700">PENDING</div>
        <div class="flex items-start gap-4">
          <span class="font-display-italic text-4xl text-blue-700 shrink-0">⌛</span>
          <div class="flex-1 text-sm leading-relaxed">
            <div class="catalog-no text-blue-700 mb-2">UNDER REVIEW · 实名认证审核中</div>
            <div class="text-ink/70">
              <template v-if="submittedAt">你于 <strong class="font-mono">{{ new Date(submittedAt).toLocaleString('zh-CN') }}</strong> 提交的申请</template>
              <template v-else>你的申请已提交</template>
              <template v-if="pendingDays !== null">
                ,已等待 <strong class="font-mono text-gold">{{ pendingDays }}</strong> 天
              </template>
              。审核通常 <strong>1-2 个工作日</strong>完成 · 审核结果会通过站内消息通知。
            </div>
            <div class="mt-3 text-xs catalog-no text-ink/50">
              如超过 3 个工作日未收到结果, 可联系
              <a href="mailto:kyc@ibi.ren" class="text-gold hover:underline">kyc@ibi.ren</a>
              加急。
            </div>
          </div>
        </div>
      </div>

      <div v-if="loading" class="space-y-6">
        <Skeleton shape="block" height-class="h-40" />
        <Skeleton shape="block" height-class="h-32" />
      </div>

      <template v-else>
        <!-- 步骤 1 · KYC -->
        <section class="mb-10 bg-surface border-0.5 border-ink p-8 md:p-10 relative">
          <div class="absolute -top-3 left-8">
            <div
              :class="[
                'stamp',
                kycStatus === 'APPROVED' ? 'text-success border-success' :
                kycStatus === 'PENDING' ? 'text-blue-700 border-blue-700' :
                kycStatus === 'REJECTED' ? 'text-danger border-danger' :
                'text-gold border-gold'
              ]"
              :style="{ background: 'var(--color-cream)' }"
            >STEP 01</div>
          </div>

          <div class="flex items-start gap-6">
            <div
              :class="[
                'w-14 h-14 shrink-0 flex items-center justify-center font-display text-2xl border-0.5 transition',
                kycStatus === 'APPROVED' ? 'bg-success/15 text-success border-success' :
                kycStatus === 'PENDING' ? 'bg-blue-100/40 text-blue-700 border-blue-200' :
                kycStatus === 'REJECTED' ? 'bg-danger/10 text-danger border-danger' :
                'bg-gold/15 text-gold border-gold'
              ]"
            >
              {{ kycStatus === 'APPROVED' ? '✓' : 'I' }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="catalog-no text-ink/50 mb-2">KYC · 实名认证</div>
              <h2 class="font-display text-2xl text-ink mb-3 leading-tight">身份核验与权益归属</h2>
              <p class="text-sm text-ink/60 leading-relaxed mb-6">
                用于创作者权益归属与结算 · 提交后通常 1–2 个工作日审核完成 ·
                身份证号经国密 SM2 加密, 仅版权登记机构可见。
              </p>

              <!-- NOT_SUBMITTED: 表单 -->
              <div v-if="kycStatus === 'NOT_SUBMITTED'" class="space-y-5">
                <div>
                  <label class="catalog-no text-ink/60 block mb-2">REAL NAME · 真实姓名</label>
                  <input
                    v-model="form.realName"
                    type="text"
                    placeholder="请输入身份证上的真实姓名"
                    class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition"
                  />
                </div>
                <div>
                  <label class="catalog-no text-ink/60 block mb-2">ID NUMBER · 身份证号</label>
                  <input
                    v-model="form.idNumber"
                    type="text"
                    placeholder="18 位身份证号"
                    class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm"
                  />
                </div>
                <div>
                  <label class="catalog-no text-ink/60 block mb-2">PHONE · 联系手机 <span class="text-ink/30">(选填)</span></label>
                  <input
                    v-model="form.phone"
                    type="tel"
                    placeholder="便于审核沟通"
                    class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm"
                  />
                </div>
                <button
                  @click="submit"
                  :disabled="submitting"
                  class="inline-flex items-center gap-3 px-6 py-3 bg-ink text-cream hover:bg-gold transition font-display disabled:opacity-50 group"
                >
                  <span class="catalog-no text-cream/70 group-hover:text-ink/70 text-[10px]">SUBMIT</span>
                  <span>{{ submitting ? '提交中…' : '提交 KYC 申请' }}</span>
                  <span class="font-display-italic">→</span>
                </button>
              </div>

              <!-- PENDING -->
              <div v-else-if="kycStatus === 'PENDING'" class="p-5 bg-blue-100/30 border-0.5 border-blue-200 text-sm text-blue-700">
                <span class="catalog-no text-blue-700 mr-2">PENDING</span>
                审核中 · 详见顶部提示
              </div>

              <!-- APPROVED -->
              <div v-else-if="kycStatus === 'APPROVED'" class="p-5 bg-success/5 border-0.5 border-success/40 text-sm text-success">
                <span class="catalog-no text-success mr-2">APPROVED</span>
                KYC 已通过 · 创作者权限已自动开通 · 可进入捏者中心
              </div>

              <!-- REJECTED -->
              <div v-else-if="kycStatus === 'REJECTED'" class="space-y-5">
                <div class="p-5 bg-danger/5 border-0.5 border-danger/40 text-sm text-danger">
                  <span class="catalog-no text-danger mr-2">REJECTED</span>
                  审核未通过{{ rejectReason ? `: ${rejectReason}` : '' }} · 请修正后重新提交
                </div>
                <div>
                  <label class="catalog-no text-ink/60 block mb-2">REAL NAME · 真实姓名</label>
                  <input v-model="form.realName" type="text"
                    class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition" />
                </div>
                <div>
                  <label class="catalog-no text-ink/60 block mb-2">ID NUMBER · 身份证号</label>
                  <input v-model="form.idNumber" type="text"
                    class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm" />
                </div>
                <button
                  @click="submit"
                  :disabled="submitting"
                  class="inline-flex items-center gap-3 px-6 py-3 bg-ink text-cream hover:bg-gold transition font-display disabled:opacity-50"
                >
                  <span>{{ submitting ? '提交中…' : '重新提交' }}</span>
                  <span class="font-display-italic">→</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 步骤 2 · 进入捏者中心 -->
        <section v-if="kycStatus === 'APPROVED'" class="bg-surface border-0.5 border-ink p-8 md:p-10 relative">
          <div class="absolute -top-3 left-8">
            <div class="stamp text-gold border-gold" :style="{ background: 'var(--color-cream)' }">STEP 02</div>
          </div>
          <div class="flex items-start gap-6">
            <div class="w-14 h-14 shrink-0 flex items-center justify-center font-display text-2xl bg-gold/15 text-gold border-0.5 border-gold">
              II
            </div>
            <div class="flex-1">
              <div class="catalog-no text-ink/50 mb-2">DASHBOARD · 创作者中心</div>
              <h2 class="font-display text-2xl text-ink mb-3 leading-tight">进入捏者工作台</h2>
              <p class="text-sm text-ink/60 leading-relaxed mb-6">
                上传虚拟人资产 · 查看订单收益 · 申请版权证书 ·
                接入 Agent API Key — 都在创作者中心完成。
              </p>
              <button
                @click="goToCreator"
                :disabled="upgrading"
                class="inline-flex items-center gap-3 px-6 py-3 bg-gold text-ink hover:bg-cream transition font-display disabled:opacity-50 group"
              >
                <span class="catalog-no text-ink/70 text-[10px]">ENTER</span>
                <span>{{ upgrading ? '进入中…' : '立即成为创作者' }}</span>
                <span class="font-display-italic">→</span>
              </button>
            </div>
          </div>
        </section>

        <!-- CURATOR'S NOTE -->
        <div class="mt-12 pt-8 hairline-t border-line">
          <div class="catalog-no text-ink/40 mb-2">CURATOR'S NOTE</div>
          <p class="font-display-italic text-base text-ink/60 leading-relaxed max-w-2xl">
            实名信息仅用于版权登记与税务结算 · 平台不向任何第三方披露 ·
            IBIren 一切交易记录均经区块链时间戳校验, 不可篡改。
          </p>
        </div>
      </template>
    </main>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. ONBOARD-030</span>
        <span>SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>
