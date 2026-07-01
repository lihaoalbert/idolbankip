<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient, formatFen } from '@/api/client';
import Skeleton from '@/components/Skeleton.vue';

const route = useRoute();
const router = useRouter();
const code = computed(() => route.params.code as string);
const orderType = computed(() => (route.query.orderType as string) || 'DEPOSIT_INTENT');
const licenseScope = computed(() => (route.query.scope as string) || 'SINGLE_DRAMA');

const ipDetail = ref<any>(null);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const acceptedRisk = ref(false);

async function fetchIp() {
  loading.value = true;
  try {
    const { data } = await apiClient.get(`/ips/${code.value}`);
    ipDetail.value = data;
  } catch (e: any) {
    error.value = e?.response?.data?.message || '加载失败';
  } finally { loading.value = false; }
}

async function pay() {
  if (orderType.value === 'FULL_LICENSE' && !licenseScope.value) {
    error.value = '请选择授权范围';
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    const { data } = await apiClient.post('/orders', {
      ipId: ipDetail.value.ip.id,
      orderType: orderType.value,
      licenseScope: orderType.value === 'FULL_LICENSE' ? licenseScope.value : undefined,
      paymentChannel: 'mock_alipay',
    });
    const order = data.order;

    if (!order.copyrightEffective) {
      await apiClient.post(`/orders/${order.id}/accept-conditional-risk`);
    }
    await apiClient.post(`/orders/${order.id}/pay`, { channel: 'mock_alipay' });

    try {
      const { data: orderData } = await apiClient.get(`/orders/${order.id}`);
      if (orderData.order.contract?.id) {
        await apiClient.post(`/contracts/${orderData.order.contract.id}/buyer-sign`);
      }
    } catch (e) { /* 忽略,管理员后签 */ }

    router.push(`/orders/${order.id}`);
  } catch (e: any) {
    error.value = e?.response?.data?.message || '支付失败,请重试';
  } finally {
    submitting.value = false;
  }
}

function scopeLabel(s: string): string {
  return {
    SINGLE_AD: '单次广告',
    SINGLE_DRAMA: '单部短剧',
    THREE_YEAR_WEB: '全网 3 年',
    BUYOUT_EXCLUSIVE: '终身独家买断',
  }[s] || s;
}

function orderTypeLabel(): string {
  if (orderType.value === 'DEPOSIT_INTENT') return '意向金 / 测试期';
  return '正式授权';
}

const finalAmount = computed(() => {
  if (!ipDetail.value) return 0;
  return orderType.value === 'DEPOSIT_INTENT'
    ? ipDetail.value.ip.depositPriceFen
    : ipDetail.value.ip.fullLicensePriceFen;
});

onMounted(fetchIp);
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <!-- 顶部条 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">ibi.ren · ACQUISITION FORM</div>
        <div class="catalog-no text-ink/40">VOL. I — CHECK-OUT</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-[1320px] mx-auto px-6 lg:px-10 py-12 md:py-16">

      <!-- 面包屑 + 章节头 -->
      <div class="mb-10">
        <RouterLink :to="`/ips/${code}`" class="catalog-no text-ink/50 hover:text-gold transition inline-flex items-center gap-2 mb-4">
          <span>←</span><span>RETURN TO PLATE</span>
        </RouterLink>
        <div class="flex items-baseline justify-between flex-wrap gap-4">
          <h1 class="font-display text-5xl md:text-7xl text-ink leading-[0.95]">
            确认<span class="font-display-italic text-gold">订</span>单
          </h1>
          <div class="catalog-no text-ink/50">№ TXN — {{ Date.now().toString(36).toUpperCase() }}</div>
        </div>
        <p class="mt-3 text-sm text-ink/60 max-w-2xl">
          支付即视为接受
          <span class="font-display-italic text-ink">《AI 虚拟人形象授权协议》</span>
          · 平台将通过支付宝完成收款 ·
          <span class="font-mono text-xs text-gold">mock_alipay</span>
        </p>
      </div>

      <div v-if="loading" class="grid lg:grid-cols-12 gap-8">
        <div class="lg:col-span-7 bg-surface border-0.5 border-ink p-8 space-y-6">
          <Skeleton shape="line" width="30%" height-class="h-5" />
          <Skeleton shape="line" :lines="5" />
        </div>
        <div class="lg:col-span-5 bg-surface border-0.5 border-ink p-8 space-y-4">
          <Skeleton shape="line" width="40%" height-class="h-8" />
          <Skeleton shape="line" width="60%" height-class="h-12" />
        </div>
      </div>

      <div v-else-if="ipDetail" class="grid lg:grid-cols-12 gap-8 lg:gap-12">

        <!-- ============= LEFT · 订单摘要 ============= -->
        <section class="lg:col-span-7">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            — 01 — ORDER SUMMARY · 订单摘要
          </div>

          <div class="bg-surface border-0.5 border-ink p-8 md:p-10 space-y-6 relative">
            <div class="absolute -top-3 left-8">
              <div class="stamp text-gold bg-cream">CONFIRM</div>
            </div>

            <div class="grid grid-cols-12 gap-y-5 gap-x-4">
              <div class="col-span-4 catalog-no text-ink/50">PLATE №</div>
              <div class="col-span-8 font-mono text-base text-ink">{{ ipDetail.ip.code }}</div>

              <div class="col-span-4 catalog-no text-ink/50">DISPLAY NAME</div>
              <div class="col-span-8 font-display text-lg text-ink">{{ ipDetail.ip.displayName }}</div>

              <div class="col-span-12"><div class="h-px bg-line"></div></div>

              <div class="col-span-4 catalog-no text-ink/50">ORDER TYPE</div>
              <div class="col-span-8 text-ink">{{ orderTypeLabel() }}</div>

              <template v-if="orderType === 'FULL_LICENSE'">
                <div class="col-span-4 catalog-no text-ink/50">LICENSE SCOPE</div>
                <div class="col-span-8 text-ink">{{ scopeLabel(licenseScope) }}</div>
              </template>

              <div class="col-span-4 catalog-no text-ink/50">COPYRIGHT</div>
              <div class="col-span-8">
                <span v-if="ipDetail.ip.officialCertNo" class="inline-flex items-center gap-2">
                  <span class="text-success catalog-no">EFFECTIVE</span>
                  <span class="font-mono text-xs">{{ ipDetail.ip.officialCertNo }}</span>
                </span>
                <span v-else class="inline-flex items-center gap-2">
                  <span class="text-gold catalog-no">CONDITIONAL</span>
                  <span class="text-xs text-ink/60">版权正在登记中</span>
                </span>
              </div>

              <div class="col-span-4 catalog-no text-ink/50">BLOCKCHAIN</div>
              <div class="col-span-8 font-mono text-xs text-ink/70 truncate">
                {{ ipDetail.ip.blockchainTxId || '—' }}
              </div>
            </div>
          </div>

          <!-- 附条件生效条款 -->
          <div v-if="!ipDetail.ip.officialCertNo" class="mt-6 bg-gold/5 border-0.5 border-gold/40 p-6">
            <div class="catalog-no text-gold mb-3">CONDITIONAL EFFECTIVENESS · 附条件生效</div>
            <label class="flex items-start gap-3 cursor-pointer">
              <input v-model="acceptedRisk" type="checkbox" class="mt-1 accent-gold" />
              <div class="text-sm leading-relaxed">
                <div class="font-display text-base text-ink mb-2">我已了解附条件生效条款</div>
                <div class="text-ink/70">
                  该 IP 版权正在权威机构登记中 ·
                  在版权正式下发前, 如发生第三方主张权利的纠纷,
                  ibi.ren 平台有权提供
                  <span class="text-gold">全额退款</span>
                  或
                  <span class="text-gold">免费更换等值 IP</span>
                  的担保。
                </div>
              </div>
            </label>
          </div>
        </section>

        <!-- ============= RIGHT · 支付侧栏 (sticky) ============= -->
        <aside class="lg:col-span-5">
          <div class="lg:sticky lg:top-6">
            <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
              — 02 — SETTLEMENT · 结算
            </div>

            <!-- 暗色金额卡 -->
            <div class="bg-ink text-cream p-8 relative overflow-hidden">
              <div class="absolute top-4 right-4 stamp text-gold border-gold">DUE NOW</div>
              <div class="catalog-no text-cream/50 mb-3">AMOUNT DUE · 应付</div>
              <div class="font-display text-5xl md:text-6xl text-cream leading-none">
                <span class="text-2xl text-gold align-top mr-1">¥</span>{{ formatFen(finalAmount).replace('¥', '') }}
              </div>
              <div class="mt-4 flex items-center gap-3 text-xs text-cream/60">
                <span class="catalog-no">VIA</span>
                <span class="font-mono">mock_alipay</span>
              </div>
            </div>

            <!-- 错误信息 -->
            <div v-if="error" class="mt-6 p-4 border-0.5 border-danger/40 bg-danger/5 text-danger text-sm">
              <span class="catalog-no text-danger mr-2">ERROR</span>
              {{ error }}
            </div>

            <!-- 支付按钮 -->
            <button
              @click="pay"
              :disabled="submitting || (!ipDetail.ip.officialCertNo && !acceptedRisk)"
              class="mt-6 w-full py-4 bg-gold text-ink hover:bg-cream transition font-display text-base tracking-wide disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3 group"
            >
              <span class="catalog-no text-ink/60 group-hover:text-ink/80 text-[10px]">CONFIRM & PAY</span>
              <span>{{ submitting ? '处理中…' : `确认支付 ${formatFen(finalAmount)}` }}</span>
              <span class="font-display-italic">→</span>
            </button>

            <!-- 法务条款 -->
            <ul class="mt-6 space-y-2 text-xs text-ink/60">
              <li class="flex items-start gap-2">
                <span class="catalog-no text-gold shrink-0">I</span>
                <span>支付即视为接受完整授权协议 (含 <span class="font-mono">mock_alipay</span> 沙盒说明)</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="catalog-no text-gold shrink-0">II</span>
                <span>意向金可在 7 天测试期内全额退款 · 转入正式授权后按协议执行</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="catalog-no text-gold shrink-0">III</span>
                <span>资产包含平台不可见水印 · 下载即接受溯源条款</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </main>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line mt-12">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. TXN-CHECKOUT</span>
        <span>SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>
