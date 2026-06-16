<script setup lang="ts">
/**
 * 商务联系页 — 留资表单 + 企业微信 / 邮箱 / 电话展示
 * 与自动化交易流程并行, 用户可二选一
 */
import { ref } from 'vue';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';
import Skeleton from '@/components/Skeleton.vue';

const toast = useToast();

const form = ref({
  name: '',
  company: '',
  phone: '',
  wechat: '',
  email: '',
  message: '',
});
const submitting = ref(false);
const submitted = ref(false);
const error = ref('');

async function submit() {
  error.value = '';
  if (form.value.name.trim().length < 2) {
    error.value = '请填写称呼 (至少 2 字)';
    return;
  }
  if (form.value.message.trim().length < 5) {
    error.value = '请简单描述需求 (至少 5 字)';
    return;
  }
  if (!form.value.phone && !form.value.wechat && !form.value.email) {
    error.value = '请至少留一种联系方式 (手机 / 微信 / 邮箱)';
    return;
  }
  submitting.value = true;
  try {
    await apiClient.post('/leads', { ...form.value, source: 'contact-page' });
    submitted.value = true;
    toast.success('已收到您的留言, 商务 1 个工作日内联系您');
    form.value = { name: '', company: '', phone: '', wechat: '', email: '', message: '' };
  } catch (e: any) {
    const msg = e?.response?.data?.message;
    error.value = Array.isArray(msg) ? msg.join('; ') : (msg || '提交失败, 请稍后再试');
    toast.error(error.value);
  } finally {
    submitting.value = false;
  }
}

// 联系方式 (来自 .env.production / 平台运营)
const contact = {
  wechat: 'ibi-ren-biz',
  wechatQr: '🐧', // 占位: 实际替换为二维码图片
  email: 'biz@ibi.ren',
  phone: '400-xxx-xxxx',
  hours: '工作日 10:00 – 19:00',
};
</script>

<template>
  <div class="max-w-5xl mx-auto px-6 py-12">
    <!-- 头部 -->
    <div class="text-center mb-10">
      <h1 class="font-display text-4xl mb-3">联系商务</h1>
      <p class="text-ink/60 max-w-2xl mx-auto">
        留下您的需求和联系方式, ibi.ren 商务团队 1 个工作日内主动联系您。
        已有用户也可直接走下单流程, 两条路并行。
      </p>
    </div>

    <div class="grid md:grid-cols-2 gap-8">
      <!-- 左侧: 表单 -->
      <div class="bg-surface border border-line rounded-2xl p-6">
        <h2 class="font-display text-lg mb-4">📨 留资表单</h2>
        <div v-if="submitted" class="text-center py-12">
          <div class="text-5xl mb-3">✅</div>
          <h3 class="font-medium mb-1">已收到</h3>
          <p class="text-sm text-ink/60 mb-4">商务 1 个工作日内联系您</p>
          <button
            @click="submitted = false"
            class="text-xs text-gold hover:underline"
          >再留一条 →</button>
        </div>
        <form v-else @submit.prevent="submit" class="space-y-4">
          <div>
            <label class="text-xs text-ink/60 block mb-1">称呼 <span class="text-danger">*</span></label>
            <input v-model="form.name" required class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" placeholder="如:张总" />
          </div>
          <div>
            <label class="text-xs text-ink/60 block mb-1">公司名称</label>
            <input v-model="form.company" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" placeholder="选填" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-ink/60 block mb-1">手机</label>
              <input v-model="form.phone" type="tel" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" placeholder="13xxxxxxxxx" />
            </div>
            <div>
              <label class="text-xs text-ink/60 block mb-1">微信号</label>
              <input v-model="form.wechat" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" placeholder="选填" />
            </div>
          </div>
          <div>
            <label class="text-xs text-ink/60 block mb-1">邮箱</label>
            <input v-model="form.email" type="email" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" placeholder="选填" />
          </div>
          <div>
            <label class="text-xs text-ink/60 block mb-1">需求描述 <span class="text-danger">*</span></label>
            <textarea v-model="form.message" rows="4" required class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold text-sm" placeholder="想用 IP 做什么 / 大致预算 / 上线时间..."></textarea>
          </div>
          <p class="text-[11px] text-ink/40">手机 / 微信 / 邮箱 至少填一种, 方便商务联系您</p>
          <div v-if="error" class="p-2 bg-danger/10 text-danger text-sm rounded">{{ error }}</div>
          <button
            type="submit"
            :disabled="submitting"
            class="w-full py-3 bg-ink text-cream rounded-full font-medium hover:bg-gold transition disabled:opacity-50"
          >
            {{ submitting ? '提交中...' : '提交, 等待商务联系' }}
          </button>
        </form>
      </div>

      <!-- 右侧: 直接联系 -->
      <div class="space-y-4">
        <div class="bg-surface border border-line rounded-2xl p-6">
          <h2 class="font-display text-lg mb-4">💬 直接联系</h2>
          <p class="text-sm text-ink/60 mb-5">不想留表单?直接加商务微信 / 发邮件 / 打电话也行</p>

          <div class="flex items-start gap-4 p-4 bg-cream/60 rounded-xl mb-3">
            <div class="text-2xl">🐧</div>
            <div class="flex-1 min-w-0">
              <div class="text-xs text-ink/50">企业微信</div>
              <div class="font-mono text-sm">{{ contact.wechat }}</div>
              <div class="text-[11px] text-ink/40 mt-1">扫码添加, 备注「商务合作」</div>
            </div>
          </div>

          <div class="flex items-start gap-4 p-4 bg-cream/60 rounded-xl mb-3">
            <div class="text-2xl">📧</div>
            <div class="flex-1 min-w-0">
              <div class="text-xs text-ink/50">邮箱</div>
              <a :href="`mailto:${contact.email}`" class="font-mono text-sm text-gold hover:underline">{{ contact.email }}</a>
            </div>
          </div>

          <div class="flex items-start gap-4 p-4 bg-cream/60 rounded-xl">
            <div class="text-2xl">📞</div>
            <div class="flex-1 min-w-0">
              <div class="text-xs text-ink/50">电话</div>
              <div class="font-mono text-sm">{{ contact.phone }}</div>
              <div class="text-[11px] text-ink/40 mt-1">{{ contact.hours }}</div>
            </div>
          </div>
        </div>

        <div class="bg-ink text-cream rounded-2xl p-6">
          <h3 class="font-display text-base mb-2">已是用户?</h3>
          <p class="text-cream/70 text-sm mb-4">下单走自动化流程 (支付宝 / 电子签 / 资产包下载) 更高效</p>
          <div class="flex gap-3">
            <RouterLink to="/ips" class="px-4 py-2 bg-gold text-ink rounded-full text-sm hover:bg-cream transition">去形象库 →</RouterLink>
            <RouterLink to="/orders" class="px-4 py-2 border border-cream/30 rounded-full text-sm hover:border-gold hover:text-gold transition">我的订单</RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>