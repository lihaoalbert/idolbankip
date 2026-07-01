<script setup lang="ts">
/**
 * 商务联系页 · ARCHIVE REQUEST
 * 留资表单 (左侧信笺) + 直接联系 (右侧档案卡)
 */
import { ref } from 'vue';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';

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

const contact = {
  wechat: 'ibi-ren-biz',
  wechatQr: '◇', // 占位: 实际替换为二维码图片
  email: 'biz@ibi.ren',
  phone: '400-xxx-xxxx',
  hours: '工作日 10:00 – 19:00',
};
</script>

<template>
  <div class="bg-cream paper-grain relative">

    <!-- 顶部条 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">ibi.ren · ARCHIVE REQUEST</div>
        <div class="catalog-no text-ink/40">VOL. I — DIRECTORY</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <!-- HERO -->
    <section class="border-b hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-14 md:py-20">
        <div class="grid grid-cols-12 gap-4 mb-8">
          <div class="col-span-3 catalog-no text-ink/50">№ 005</div>
          <div class="col-span-3 col-start-5 catalog-no text-ink/50">CHAPTER V — DIRECTORY</div>
          <div class="col-span-3 col-start-9 catalog-no text-ink/50">RÉPONSE SOUS 24H</div>
          <div class="col-span-3 col-start-12 catalog-no text-ink/50 text-right hidden md:block">HANGZHOU · CN</div>
        </div>

        <h1 class="font-display text-6xl md:text-8xl lg:text-9xl leading-[0.9] text-ink">
          联系<span class="font-display-italic text-gold">商</span>务
        </h1>
        <p class="mt-6 text-base md:text-lg text-ink/60 max-w-2xl leading-relaxed">
          留下您的需求和联系方式 ·
          <span class="font-display-italic">ibi.ren 商务团队 1 个工作日内主动回复。</span>
          已是注册用户也可走自动化下单流程, 两条路并行。
        </p>
      </div>
    </section>

    <!-- 双栏 · 信笺 + 名片 -->
    <section class="max-w-[1320px] mx-auto px-6 lg:px-10 py-14 md:py-20">
      <div class="grid lg:grid-cols-12 gap-8 lg:gap-12">

        <!-- ============= LEFT · 信笺 ============= -->
        <div class="lg:col-span-7">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            A · REQUEST FORM · 商务留资
          </div>

          <div class="relative bg-surface border-0.5 border-ink p-8 md:p-10">
            <div class="absolute -top-3 left-8">
              <div class="stamp text-gold bg-cream">DIRECT REQUEST</div>
            </div>

            <div v-if="submitted" class="text-center py-16">
              <div class="catalog-no text-success mb-4">REQUEST RECEIVED</div>
              <div class="font-display text-4xl text-ink mb-3">已收到您的<span class="font-display-italic text-gold">来信</span></div>
              <p class="text-sm text-ink/60 mb-8 max-w-sm mx-auto">
                商务团队 1 个工作日内联系您 · 急事请直接拨打 400-xxx-xxxx
              </p>
              <button
                @click="submitted = false"
                class="inline-flex items-center gap-3 px-5 py-3 border-0.5 border-ink hover:bg-ink hover:text-cream transition"
              >
                <span class="catalog-no opacity-60">FILE ANOTHER</span>
                <span>再留一条</span>
                <span class="font-display-italic">→</span>
              </button>
            </div>

            <form v-else @submit.prevent="submit" class="space-y-6">
              <div class="grid grid-cols-12 gap-4">
                <div class="col-span-12 md:col-span-6">
                  <label class="catalog-no text-ink/60 block mb-2">NAME · 称呼 <span class="text-danger">*</span></label>
                  <input v-model="form.name" required
                    class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition"
                    placeholder="如:张总" />
                </div>
                <div class="col-span-12 md:col-span-6">
                  <label class="catalog-no text-ink/60 block mb-2">COMPANY · 公司名称 <span class="text-ink/30">(选填)</span></label>
                  <input v-model="form.company"
                    class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition"
                    placeholder="如:某某传媒" />
                </div>
              </div>

              <div class="grid grid-cols-12 gap-4">
                <div class="col-span-12 md:col-span-4">
                  <label class="catalog-no text-ink/60 block mb-2">PHONE · 手机</label>
                  <input v-model="form.phone" type="tel"
                    class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm"
                    placeholder="13xxxxxxxxx" />
                </div>
                <div class="col-span-12 md:col-span-4">
                  <label class="catalog-no text-ink/60 block mb-2">WECHAT · 微信号</label>
                  <input v-model="form.wechat"
                    class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm" />
                </div>
                <div class="col-span-12 md:col-span-4">
                  <label class="catalog-no text-ink/60 block mb-2">EMAIL · 邮箱</label>
                  <input v-model="form.email" type="email"
                    class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm" />
                </div>
              </div>

              <div>
                <label class="catalog-no text-ink/60 block mb-2">REQUEST · 需求描述 <span class="text-danger">*</span></label>
                <textarea v-model="form.message" rows="5" required
                  class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition text-sm leading-relaxed"
                  placeholder="想用 IP 做什么 / 大致预算 / 上线时间 / 数量..."></textarea>
                <p class="mt-2 text-[11px] text-ink/40 catalog-no">PHONE / WECHAT / EMAIL · 至少留一种</p>
              </div>

              <div v-if="error" class="p-3 border-0.5 border-danger/40 bg-danger/5 text-danger text-sm">
                <span class="catalog-no text-danger mr-2">ERROR</span>
                {{ error }}
              </div>

              <button
                type="submit"
                :disabled="submitting"
                class="w-full py-4 bg-ink text-cream hover:bg-gold transition font-display text-base tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 group"
              >
                <span class="catalog-no text-cream/70 group-hover:text-ink/70 text-[10px]">SUBMIT REQUEST</span>
                <span>{{ submitting ? '提交中…' : '提交, 等待商务联系' }}</span>
                <span class="font-display-italic">→</span>
              </button>
            </form>
          </div>
        </div>

        <!-- ============= RIGHT · 名片 + 快捷通道 ============= -->
        <aside class="lg:col-span-4 lg:col-start-9 space-y-6">

          <!-- 名片卡 -->
          <div>
            <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
              B · DIRECT CHANNELS · 直接通道
            </div>

            <div class="space-y-3">
              <!-- 微信 -->
              <div class="bg-surface border-0.5 border-line p-5 flex items-start gap-4">
                <div class="shrink-0 w-12 h-12 border-0.5 border-ink flex items-center justify-center text-xl">
                  {{ contact.wechatQr }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="catalog-no text-ink/40 mb-1">WECHAT · 企业微信</div>
                  <div class="font-mono text-sm text-ink">{{ contact.wechat }}</div>
                  <div class="text-[11px] text-ink/40 mt-1 catalog-no">SCAN · 备注「商务合作」</div>
                </div>
              </div>

              <!-- 邮箱 -->
              <div class="bg-surface border-0.5 border-line p-5 flex items-start gap-4">
                <div class="shrink-0 w-12 h-12 border-0.5 border-ink flex items-center justify-center font-display-italic text-2xl text-gold">
                  ✉
                </div>
                <div class="flex-1 min-w-0">
                  <div class="catalog-no text-ink/40 mb-1">EMAIL · 邮箱</div>
                  <a :href="`mailto:${contact.email}`" class="font-mono text-sm text-gold hover:underline">{{ contact.email }}</a>
                </div>
              </div>

              <!-- 电话 -->
              <div class="bg-surface border-0.5 border-line p-5 flex items-start gap-4">
                <div class="shrink-0 w-12 h-12 border-0.5 border-ink flex items-center justify-center font-display text-xl text-gold">
                  ☏
                </div>
                <div class="flex-1 min-w-0">
                  <div class="catalog-no text-ink/40 mb-1">PHONE · 电话</div>
                  <div class="font-mono text-sm text-ink">{{ contact.phone }}</div>
                  <div class="text-[11px] text-ink/40 mt-1 catalog-no">{{ contact.hours }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 已是用户 · 暗色召唤卡 -->
          <div class="bg-ink text-cream p-6 relative overflow-hidden">
            <div class="absolute top-3 right-3 stamp text-gold border-gold">SHORTCUT</div>
            <div class="catalog-no text-cream/50 mb-2">ALREADY A MEMBER?</div>
            <h3 class="font-display text-2xl mb-3 leading-tight">已是<span class="font-display-italic text-gold">注册用户</span>?</h3>
            <p class="text-cream/60 text-sm leading-relaxed mb-5">
              下单走自动化流程 · 支付宝 / 电子签 / 资产包下载 · 比邮件更高效
            </p>
            <div class="flex flex-col gap-2">
              <RouterLink
                to="/ips"
                class="inline-flex items-center justify-between px-4 py-3 bg-gold text-ink hover:bg-cream transition group"
              >
                <span class="font-display">去形象库</span>
                <span class="font-display-italic group-hover:translate-x-1 transition">→</span>
              </RouterLink>
              <RouterLink
                to="/orders"
                class="inline-flex items-center justify-between px-4 py-3 border-0.5 border-cream/30 hover:border-gold hover:text-gold transition"
              >
                <span>我的订单</span>
                <span>→</span>
              </RouterLink>
            </div>
          </div>

          <!-- 工作时间 -->
          <div class="bg-cream border-0.5 border-line p-5">
            <div class="catalog-no text-ink/40 mb-2">HOURS · 受理时间</div>
            <div class="font-display text-2xl text-ink leading-tight">
              工作日 <span class="font-display-italic text-gold">10:00</span><br>
              至 <span class="font-display-italic text-gold">19:00</span>
            </div>
            <p class="text-[11px] text-ink/40 mt-2 catalog-no">UTC+8 · 周六日休息 · 节假日除外</p>
          </div>
        </aside>
      </div>
    </section>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-6 grid grid-cols-12 gap-4 catalog-no text-ink/40">
        <div class="col-span-3">CAT. CONT-005</div>
        <div class="col-span-6 col-start-4">CATALOGUED BY IBI.REN ARCHIVE DEPT.</div>
        <div class="col-span-3 col-start-10 text-right">© 2026</div>
      </div>
    </footer>
  </div>
</template>
