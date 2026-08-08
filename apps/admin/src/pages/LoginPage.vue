<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const email = ref('');
const password = ref('');
const submitting = ref(false);
const error = ref('');

async function submit() {
  error.value = '';
  submitting.value = true;
  try {
    await auth.login(email.value, password.value);
    const redirect = (route.query.redirect as string) || '/';
    router.push(redirect);
  } catch (e: any) {
    error.value = e?.response?.data?.message || e?.message || '登录失败';
  } finally { submitting.value = false; }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-cream p-6">
    <form @submit.prevent="submit" class="w-full max-w-sm bg-white border border-line rounded-2xl p-8">
      <div class="text-center mb-6">
        <div class="font-display text-2xl">IBIren</div>
        <div class="text-xs text-ink/50 mt-1">运营控制台 · 仅限管理员</div>
      </div>
      <div class="space-y-3">
        <div>
          <label class="text-xs text-ink/60 block mb-1">邮箱</label>
          <input v-model="email" type="email" required class="input-base" autocomplete="username" />
        </div>
        <div>
          <label class="text-xs text-ink/60 block mb-1">密码</label>
          <input v-model="password" type="password" required class="input-base" autocomplete="current-password" />
        </div>
      </div>
      <div v-if="error" class="mt-3 p-2 bg-danger/10 text-danger text-xs rounded">{{ error }}</div>
      <button type="submit" :disabled="submitting" class="mt-5 w-full btn-primary">
        {{ submitting ? '登录中...' : '登录控制台' }}
      </button>
      <p class="text-[10px] text-ink/40 mt-4 text-center">所有登录行为会被记录到审计日志</p>
    </form>
  </div>
</template>
