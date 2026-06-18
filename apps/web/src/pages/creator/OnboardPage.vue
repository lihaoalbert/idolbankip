<script setup lang="ts">
/**
 * 升级为创作者 — 已登录 BUYER 用户的引导页
 *
 * 流程:
 *   1. KYC 状态查询 + 提交表单 (无独立 KYC 页面, 借此补上)
 *   2. KYC 通过后 (后端自动补 CREATOR 角色) 直接跳 /creator
 *      见 [[project-post-mvp-backlog]] #17 — 之前 KYC 通过后只跳 /contact 是死循环
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
    // 后端 KycSubmission 用 notes 存 admin reject 原因 (无 rejectionReason 字段)
    rejectReason.value = data.latest?.notes ?? null;
    submittedAt.value = data.latest?.createdAt ?? null;
  } catch (e) {
    toast.error('获取 KYC 状态失败');
  } finally {
    loading.value = false;
  }
}

// PENDING 时显示已等待天数 (从 submittedAt 算到今天)
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
    toast.success('KYC 已提交,审核结果会通过站内通知');
    // 后端 KYC mock 直接返回 APPROVED 时,角色已自动补 CREATOR;刷新 token + auth store
    if (data?.submission?.status === 'APPROVED') {
      // refresh 会重读 user.roles 重签 token;fetchMe 再刷一次 user 对象
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
    // 用户可能从历史 tab 直接进来 KYC=APPROVED 但 token 还是旧的 BUYER-only;
    // 刷一次 token + user,确保 CREATOR 角色生效
    try { await auth.refresh(); } catch {}
    await auth.fetchMe();
    if (!auth.isCreator) {
      toast.error('CREATOR 角色未生效,请重新登录');
      upgrading.value = false;
      return;
    }
    await router.push('/creator');
  } catch {
    toast.error('进入创作者中心失败');
    upgrading.value = false;
  }
}

onMounted(fetchStatus);
</script>

<template>
  <div class="max-w-2xl mx-auto px-6 py-12">
    <h1 class="font-display text-3xl mb-2">升级为创作者</h1>
    <p class="text-sm text-ink/60 mb-10">
      想把自己创造的虚拟形象上架到 ibi.ren? 完成 KYC 认证即可开通创作者权限。
    </p>

    <div v-if="loading" class="space-y-4">
      <Skeleton shape="block" height-class="h-32" />
      <Skeleton shape="block" height-class="h-20" />
    </div>

    <template v-else>
      <!-- PENDING 状态顶部 banner — 醒目提示审核中 + 等待天数 + 预期时长 -->
      <div
        v-if="kycStatus === 'PENDING'"
        class="mb-6 p-5 bg-blue-50 border border-blue-200 rounded-2xl"
      >
        <div class="flex items-start gap-3">
          <span class="text-2xl">⏳</span>
          <div class="flex-1 text-sm">
            <div class="font-medium text-blue-900 mb-1">KYC 实名认证审核中</div>
            <div class="text-blue-800/80 leading-relaxed">
              <template v-if="submittedAt">你于 <strong>{{ new Date(submittedAt).toLocaleString('zh-CN') }}</strong> 提交的申请</template>
              <template v-else>你的申请已提交</template>
              <template v-if="pendingDays !== null">
                ,已等待 <strong class="font-mono">{{ pendingDays }}</strong> 天
              </template>
              。审核通常 <strong>1-2 个工作日</strong>完成,审核结果会通过站内消息通知。
            </div>
            <div class="mt-2 text-xs text-blue-700/70">
              如超过 3 个工作日未收到结果,可联系 <a href="mailto:kyc@ibi.ren" class="underline">kyc@ibi.ren</a> 加急。
            </div>
          </div>
        </div>
      </div>

      <!-- 步骤 1: KYC -->
      <section class="mb-8 bg-surface rounded-2xl border border-line p-6">
        <div class="flex items-start gap-4">
          <div
            class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium shrink-0"
            :class="{
              'bg-gold/20 text-gold': kycStatus === 'APPROVED',
              'bg-blue-100 text-blue-700': kycStatus === 'PENDING',
              'bg-red-100 text-red-700': kycStatus === 'REJECTED',
              'bg-ink/10 text-ink/60': kycStatus === 'NOT_SUBMITTED',
            }"
          >
            {{ kycStatus === 'APPROVED' ? '✓' : '1' }}
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="font-medium text-lg mb-1">KYC 实名认证</h2>
            <p class="text-sm text-ink/60 mb-4">
              用于创作者权益归属与结算, 提交后通常 1–2 个工作日审核完成。
            </p>

            <!-- NOT_SUBMITTED: 表单 -->
            <div v-if="kycStatus === 'NOT_SUBMITTED'" class="space-y-3">
              <div>
                <label class="text-xs text-ink/60 mb-1 block">真实姓名</label>
                <input
                  v-model="form.realName"
                  type="text"
                  placeholder="请输入身份证上的真实姓名"
                  class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label class="text-xs text-ink/60 mb-1 block">身份证号</label>
                <input
                  v-model="form.idNumber"
                  type="text"
                  placeholder="18 位身份证号"
                  class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label class="text-xs text-ink/60 mb-1 block">联系手机 (选填)</label>
                <input
                  v-model="form.phone"
                  type="tel"
                  placeholder="便于审核沟通"
                  class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold"
                />
              </div>
              <button
                @click="submit"
                :disabled="submitting"
                class="px-5 py-2 bg-ink text-cream rounded-full hover:bg-gold transition disabled:opacity-50"
              >
                {{ submitting ? '提交中...' : '提交 KYC 申请' }}
              </button>
            </div>

            <!-- PENDING — 详细提示已搬到顶部 banner,这里只留状态徽标 -->
            <div v-else-if="kycStatus === 'PENDING'" class="text-sm text-blue-700 bg-blue-50 px-4 py-3 rounded-lg">
              ⏳ 审核中 · 详见顶部提示
            </div>

            <!-- APPROVED -->
            <div v-else-if="kycStatus === 'APPROVED'" class="text-sm text-emerald-700 bg-emerald-50 px-4 py-3 rounded-lg">
              ✓ KYC 已通过, 创作者权限已自动开通!
            </div>

            <!-- REJECTED -->
            <div v-else-if="kycStatus === 'REJECTED'" class="space-y-3">
              <div class="text-sm text-red-700 bg-red-50 px-4 py-3 rounded-lg">
                审核未通过{{ rejectReason ? `: ${rejectReason}` : '' }}, 请修正后重新提交。
              </div>
              <div>
                <label class="text-xs text-ink/60 mb-1 block">真实姓名</label>
                <input v-model="form.realName" type="text" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" />
              </div>
              <div>
                <label class="text-xs text-ink/60 mb-1 block">身份证号</label>
                <input v-model="form.idNumber" type="text" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" />
              </div>
              <button
                @click="submit"
                :disabled="submitting"
                class="px-5 py-2 bg-ink text-cream rounded-full hover:bg-gold transition disabled:opacity-50"
              >
                {{ submitting ? '提交中...' : '重新提交' }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 步骤 2: 进入创作者中心 (仅 KYC APPROVED 时) -->
      <section v-if="kycStatus === 'APPROVED'" class="bg-surface rounded-2xl border border-line p-6">
        <div class="flex items-start gap-4">
          <div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium shrink-0 bg-gold/20 text-gold">2</div>
          <div class="flex-1">
            <h2 class="font-medium text-lg mb-1">进入创作者中心</h2>
            <p class="text-sm text-ink/60 mb-4">
              上传虚拟人资产、查看订单收益、申请版权证书 — 都在创作者中心完成。
            </p>
            <button
              @click="goToCreator"
              :disabled="upgrading"
              class="px-5 py-2 bg-ink text-cream rounded-full hover:bg-gold transition disabled:opacity-50"
            >
              {{ upgrading ? '进入中...' : '立即成为创作者 →' }}
            </button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>