<script setup lang="ts">
/**
 * WechatCallbackPage — W3 W1 D5
 *
 * 流程:
 *   1. 微信直跳 /api/v1/auth/wechat/callback?code&state → 后端 302 到 /auth/wechat/callback?code&state
 *   2. onMounted 调 /exchange 换 openid
 *   3. 命中 user → 写 store + 跳首页
 *   4. 未命中 (needBindPhone) → 跳 /auth/bind-phone?bindToken=&phone=
 *
 * Mock 模式: code='mock' (前端测试时手动触发)
 */
import { onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import { exchange } from '@/api/auth-wechat';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const toast = useToast();

const status = ref<'exchanging' | 'ok' | 'need-bind' | 'error'>('exchanging');
const message = ref('正在与微信通信…');

onMounted(async () => {
  const code = (route.query.code as string) || 'mock';
  const state = (route.query.state as string) || '';
  const error = route.query.error as string | undefined;

  if (error) {
    status.value = 'error';
    message.value = `微信回调出错: ${error}`;
    return;
  }
  if (!state) {
    status.value = 'error';
    message.value = '缺少 state, 请重新扫码';
    return;
  }

  try {
    const r = await exchange(code, state);
    if (r.needBindPhone && r.bindToken) {
      // 跳到补手机号页
      status.value = 'need-bind';
      router.replace({ path: '/auth/bind-phone', query: { state, wechatCode: code } });
      return;
    }
    if (r.user && r.tokens) {
      // 命中 user, 直接登录
      auth.user = r.user;
      auth.accessToken = r.tokens.accessToken;
      auth.refreshToken = r.tokens.refreshToken;
      auth.loading = false;
      // 复用 stores/auth.saveToStorage 通过 setAccessToken 等... 简化: 直接写
      localStorage.setItem('ibi.auth', JSON.stringify({
        user: r.user,
        accessToken: r.tokens.accessToken,
        refreshToken: r.tokens.refreshToken,
      }));
      status.value = 'ok';
      toast.success(`欢迎, ${r.user.displayName || r.user.phone || r.user.email}`);
      router.replace((route.query.redirect as string) || '/');
      return;
    }
    status.value = 'error';
    message.value = '微信登录返回异常';
  } catch (e: any) {
    status.value = 'error';
    message.value = e?.response?.data?.message || '微信登录失败';
    toast.error(message.value);
  }
});
</script>

<template>
  <div class="min-h-[60vh] bg-cream paper-grain flex items-center justify-center px-6">
    <div class="bg-surface border-0.5 border-ink p-10 max-w-md w-full text-center">
      <div class="catalog-no text-gold mb-4">№ 029 · WECHAT</div>
      <h1 class="font-display text-2xl text-ink mb-4">
        <span v-if="status === 'exchanging'">扫码完成</span>
        <span v-else-if="status === 'ok'">登录成功</span>
        <span v-else-if="status === 'need-bind'">需要补手机号</span>
        <span v-else>登录失败</span>
      </h1>
      <p class="text-sm text-ink/70 leading-relaxed">
        <span v-if="status === 'exchanging'">{{ message }}<br>正在验证扫码凭证…</span>
        <span v-else-if="status === 'ok'">正在为您入馆…</span>
        <span v-else-if="status === 'need-bind'">首次扫码, 正在跳转到手机号补全…</span>
        <span v-else class="text-danger">{{ message }}</span>
      </p>
      <div v-if="status === 'exchanging' || status === 'need-bind' || status === 'ok'" class="mt-6 flex justify-center">
        <div class="catalog-no text-ink/40 animate-pulse">⏳</div>
      </div>
      <div v-if="status === 'error'" class="mt-6">
        <RouterLink to="/login" class="catalog-no text-gold hover:underline">← 返回登录</RouterLink>
      </div>
    </div>
  </div>
</template>