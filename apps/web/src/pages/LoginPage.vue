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
    toast.success(`欢迎回来,${auth.user?.displayName || auth.user?.email}`);
    const redirect = (route.query.redirect as string) || '/';
    router.push(redirect);
  } catch (e: any) {
    error.value = e?.response?.data?.message || '登录失败';
    toast.error(error.value);
  } finally { loading.value = false; }
}
</script>

<template>
  <div class="max-w-md mx-auto px-6 py-20">
    <h1 class="font-display text-3xl mb-2">登录</h1>
    <p class="text-sm text-ink/60 mb-8">访问你的形象库、订单与资产</p>

    <form @submit.prevent="submit" class="space-y-4 bg-white p-6 rounded-2xl border border-line">
      <div>
        <label class="text-xs text-ink/60 block mb-1">邮箱</label>
        <input
          v-model="email"
          type="email"
          required
          class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold"
        />
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-1">密码</label>
        <input
          v-model="password"
          type="password"
          required
          minlength="8"
          class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold"
        />
      </div>
      <div v-if="error" class="p-2 bg-danger/10 text-danger text-sm rounded">{{ error }}</div>
      <button
        type="submit"
        :disabled="loading"
        class="w-full py-3 bg-ink text-cream rounded-full font-medium hover:bg-gold transition disabled:opacity-50"
      >
        {{ loading ? '登录中...' : '登录' }}
      </button>
      <p class="text-center text-sm text-ink/60">
        还没有账号？
        <RouterLink to="/register" class="text-gold hover:underline">立即注册</RouterLink>
      </p>
    </form>
  </div>
</template>