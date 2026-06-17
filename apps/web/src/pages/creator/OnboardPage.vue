<script setup lang="ts">
/**
 * 升级为创作者 — 已登录 BUYER 用户的引导页
 *
 * 当前数据模型: User.roles 是数组, 注册时设定; 之后没有自助添加 CREATOR 的 API
 * (admin 手动改或后续加业务接口)。所以本页只做两件事:
 *   1. KYC 状态查询 + 提交表单 (无独立 KYC 页面, 借此补上)
 *   2. KYC 通过后提示 "联系商务开通创作者权限", 跳 /contact
 */
import { onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';
import Skeleton from '@/components/Skeleton.vue';

const toast = useToast();

const loading = ref(true);
const kycStatus = ref<string>('NOT_SUBMITTED');
const rejectReason = ref<string | null>(null);
const submitting = ref(false);

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
    rejectReason.value = data.latest?.rejectionReason ?? null;
  } catch (e) {
    toast.error('获取 KYC 状态失败');
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!form.value.realName.trim() || !form.value.idNumber.trim()) {
    toast.error('请填写真实姓名和身份证号');
    return;
  }
  submitting.value = true;
  try {
    await apiClient.post('/kyc/submit', form.value);
    toast.success('KYC 已提交,审核结果会通过站内通知');
    await fetchStatus();
  } catch (e: any) {
    const msg = e?.response?.data?.message ?? '提交失败';
    toast.error(Array.isArray(msg) ? msg.join('; ') : msg);
  } finally {
    submitting.value = false;
  }
}

onMounted(fetchStatus);
</script>

<template>
  <div class="max-w-2xl mx-auto px-6 py-12">
    <h1 class="font-display text-3xl mb-2">升级为创作者</h1>
    <p class="text-sm text-ink/60 mb-10">
      想把自己创造的虚拟形象上架到 ibi.ren? 需要完成 KYC 认证, 之后联系商务开通创作者权限。
    </p>

    <div v-if="loading" class="space-y-4">
      <Skeleton shape="block" height-class="h-32" />
      <Skeleton shape="block" height-class="h-20" />
    </div>

    <template v-else>
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

            <!-- PENDING -->
            <div v-else-if="kycStatus === 'PENDING'" class="text-sm text-blue-700 bg-blue-50 px-4 py-3 rounded-lg">
              审核中, 请耐心等待, 结果会通过站内消息通知。
            </div>

            <!-- APPROVED -->
            <div v-else-if="kycStatus === 'APPROVED'" class="text-sm text-emerald-700 bg-emerald-50 px-4 py-3 rounded-lg">
              ✓ KYC 已通过, 完成第一步!
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

      <!-- 步骤 2: 联系商务开通权限 -->
      <section class="bg-surface rounded-2xl border border-line p-6">
        <div class="flex items-start gap-4">
          <div
            class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium shrink-0"
            :class="kycStatus === 'APPROVED' ? 'bg-gold/20 text-gold' : 'bg-ink/10 text-ink/40'"
          >
            {{ kycStatus === 'APPROVED' ? '2' : '2' }}
          </div>
          <div class="flex-1">
            <h2 class="font-medium text-lg mb-1">联系商务开通创作者权限</h2>
            <p class="text-sm text-ink/60 mb-3">
              KYC 通过后, 我们的商务同事会为你开通创作者权限, 即可上传虚拟人资产。
            </p>
            <RouterLink
              to="/contact"
              :class="kycStatus === 'APPROVED' ? 'inline-block px-5 py-2 bg-ink text-cream rounded-full hover:bg-gold transition' : 'inline-block px-5 py-2 border border-ink rounded-full text-ink/40 cursor-not-allowed'"
            >
              联系商务
            </RouterLink>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
