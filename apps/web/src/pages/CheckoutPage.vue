<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient, formatFen } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

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
  if (!auth.user) return;
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
    const chargeId = data.payment.chargeId;

    // 接受附条件风险
    if (!order.copyrightEffective) {
      await apiClient.post(`/orders/${order.id}/accept-conditional-risk`);
    }

    // mock 支付
    await apiClient.post(`/orders/${order.id}/pay`, { channel: 'mock_alipay' });

    // 自动买方签署 (MVP 简化)
    // 注意: 实际生产买方在电子签页面签
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

onMounted(fetchIp);
</script>

<template>
  <div class="max-w-3xl mx-auto px-6 py-10">
    <RouterLink :to="`/ips/${code}`" class="text-xs text-ink/50 hover:text-ink mb-4 inline-block">← 返回形象详情</RouterLink>

    <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>
    <div v-else-if="ipDetail" class="bg-white rounded-2xl border border-line overflow-hidden">
      <div class="p-6 border-b border-line">
        <h1 class="font-display text-2xl mb-1">确认订单</h1>
        <p class="text-sm text-ink/60">支付即视为接受《AI 虚拟人形象授权协议》</p>
      </div>

      <div class="p-6 space-y-4 border-b border-line">
        <div class="flex justify-between items-center">
          <span class="text-sm text-ink/60">IP 编号</span>
          <span class="font-mono text-sm">{{ ipDetail.ip.code }}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-sm text-ink/60">IP 名称</span>
          <span class="text-sm font-medium">{{ ipDetail.ip.displayName }}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-sm text-ink/60">授权类型</span>
          <span class="text-sm">{{ orderType === 'DEPOSIT_INTENT' ? '意向金 / 测试期' : '正式授权' }}</span>
        </div>
        <div v-if="orderType === 'FULL_LICENSE'" class="flex justify-between items-center">
          <span class="text-sm text-ink/60">授权范围</span>
          <span class="text-sm">{{ scopeLabel(licenseScope) }}</span>
        </div>
        <div class="pt-4 border-t border-line flex justify-between items-baseline">
          <span class="text-sm text-ink/60">应付金额</span>
          <span class="font-display text-3xl text-gold">
            {{ formatFen(orderType === 'DEPOSIT_INTENT' ? ipDetail.ip.depositPriceFen : ipDetail.ip.fullLicensePriceFen) }}
          </span>
        </div>
      </div>

      <div v-if="!ipDetail.ip.officialCertNo" class="p-6 bg-gold/10 border-b border-line">
        <label class="flex items-start gap-3 cursor-pointer">
          <input v-model="acceptedRisk" type="checkbox" class="mt-1" />
          <div class="text-sm">
            <div class="font-medium mb-1">我已了解附条件生效条款</div>
            <div class="text-ink/60 leading-relaxed">
              该 IP 版权正在权威机构登记中。我同意：在版权正式下发前,如发生第三方主张权利的纠纷,
              ibi.ren 平台有权为我提供全额退款或免费更换等值 IP 的担保。
            </div>
          </div>
        </label>
      </div>

      <div class="p-6">
        <div v-if="error" class="mb-4 p-3 bg-danger/10 text-danger text-sm rounded-lg">{{ error }}</div>
        <button
          @click="pay"
          :disabled="submitting || (!ipDetail.ip.officialCertNo && !acceptedRisk)"
          class="w-full py-3 bg-ink text-cream rounded-full font-medium hover:bg-gold transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {{ submitting ? '处理中...' : `确认支付 ${formatFen(orderType === 'DEPOSIT_INTENT' ? ipDetail.ip.depositPriceFen : ipDetail.ip.fullLicensePriceFen)}` }}
        </button>
        <p class="text-center text-xs text-ink/40 mt-3">支付由支付宝沙盒环境提供（mock）</p>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
function scopeLabel(s: string): string {
  return {
    SINGLE_AD: '单次广告',
    SINGLE_DRAMA: '单部短剧',
    THREE_YEAR_WEB: '全网 3 年',
    BUYOUT_EXCLUSIVE: '终身独家买断',
  }[s] || s;
}
</script>