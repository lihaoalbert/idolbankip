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
  roles: { CREATOR: false, BUYER: false },
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
    error.value = '请至少勾选一个身份 (创作者 / 采购方)';
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
    toast.success('注册成功,欢迎加入 ibi.ren');
    // 双角色用户进入工作台首页, 单角色按身份分别进 creator 或 home
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
  <div class="max-w-md mx-auto px-6 py-16">
    <h1 class="font-display text-3xl mb-2">注册</h1>
    <p class="text-sm text-ink/60 mb-6">加入 ibi.ren 虚拟人资产银行 · 可同时勾选 A + B 端</p>

    <div class="space-y-3 mb-6">
      <p class="text-xs text-ink/60">身份 (可多选)</p>
      <label class="flex items-start gap-3 p-3 bg-white rounded-xl border border-line cursor-pointer hover:border-gold transition"
        :class="{ 'border-gold bg-gold/5': form.roles.CREATOR }">
        <input v-model="form.roles.CREATOR" type="checkbox" class="mt-1" />
        <div>
          <div class="font-medium text-sm">我是创作者 (A 端)</div>
          <div class="text-xs text-ink/60 mt-0.5">上传虚拟人资产、设置授权价格、获得收益分成</div>
        </div>
      </label>
      <label class="flex items-start gap-3 p-3 bg-white rounded-xl border border-line cursor-pointer hover:border-gold transition"
        :class="{ 'border-gold bg-gold/5': form.roles.BUYER }">
        <input v-model="form.roles.BUYER" type="checkbox" class="mt-1" />
        <div>
          <div class="font-medium text-sm">我是采购方 (B 端)</div>
          <div class="text-xs text-ink/60 mt-0.5">浏览形象库、支付意向金 / 正式授权、下载资产包</div>
        </div>
      </label>
    </div>

    <form @submit.prevent="submit" class="space-y-4 bg-white p-6 rounded-2xl border border-line">
      <div>
        <label class="text-xs text-ink/60 block mb-1">邮箱</label>
        <input v-model="form.email" type="email" required class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" />
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-1">密码 (至少 8 位)</label>
        <input v-model="form.password" type="password" required minlength="8" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" />
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-1">显示名</label>
        <input v-model="form.displayName" required class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" />
      </div>
      <div v-if="isBuyer">
        <label class="text-xs text-ink/60 block mb-1">公司名称 (选填)</label>
        <input v-model="form.companyName" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" />
      </div>
      <label class="flex items-start gap-2 text-xs text-ink/60">
        <input v-model="form.agree" type="checkbox" class="mt-0.5" />
        <span>我已阅读并同意《用户协议》《隐私政策》《AI 形象版权声明》</span>
      </label>
      <div v-if="error" class="p-2 bg-danger/10 text-danger text-sm rounded">{{ error }}</div>
      <button
        type="submit"
        :disabled="loading"
        class="w-full py-3 bg-ink text-cream rounded-full font-medium hover:bg-gold transition disabled:opacity-50"
      >
        {{ loading ? '注册中...' : '注册并进入工作台' }}
      </button>
    </form>
  </div>
</template>
