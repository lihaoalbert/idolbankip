<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiClient, formatFen } from '@/api/client';

const route = useRoute();
const orderId = computed(() => route.params.id as string);
const order = ref<any>(null);
const loading = ref(true);

async function fetchOrder() {
  loading.value = true;
  try {
    const { data } = await apiClient.get(`/orders/${orderId.value}`);
    order.value = data.order;
  } finally { loading.value = false; }
}

async function buyerSignContract() {
  if (!order.value.contract) return;
  await apiClient.post(`/contracts/${order.value.contract.id}/buyer-sign`);
  await fetchOrder();
}

async function adminSignContract() {
  if (!order.value.contract) return;
  // 仅 admin 可调;前端兜底
  await apiClient.post(`/contracts/${order.value.contract.id}/platform-sign`).catch(e => {
    alert(e?.response?.data?.message || '签署失败 (需要管理员权限)');
  });
  await fetchOrder();
}

const canDownload = computed(() =>
  ['DOWNLOAD_UNLOCKED', 'DELIVERED'].includes(order.value?.status) &&
  order.value?.contract?.status === 'FULLY_SIGNED'
);

async function requestDownload(fileId: string) {
  const { data } = await apiClient.post('/download/token', {
    orderId: orderId.value,
    fileId,
  });
  window.open(data.url, '_blank');
}

onMounted(fetchOrder);
</script>

<template>
  <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>
  <div v-else-if="order" class="max-w-4xl mx-auto px-6 py-10">
    <RouterLink to="/orders" class="text-xs text-ink/50 hover:text-ink mb-4 inline-block">← 返回订单列表</RouterLink>

    <h1 class="font-display text-3xl mb-6">订单详情</h1>

    <!-- 进度时间线 -->
    <div class="bg-white rounded-2xl border border-line p-6 mb-6">
      <div class="flex items-center justify-between text-sm">
        <span :class="['flex-1 text-center', order.status !== 'CREATED' ? 'text-success' : 'text-ink/40']">下单</span>
        <span :class="['flex-1 text-center', ['PAID','CONTRACT_PENDING','CONTRACT_SIGNED','DOWNLOAD_UNLOCKED','DELIVERED'].includes(order.status) ? 'text-success' : 'text-ink/40']">支付</span>
        <span :class="['flex-1 text-center', ['CONTRACT_PENDING','CONTRACT_SIGNED','DOWNLOAD_UNLOCKED','DELIVERED'].includes(order.status) ? 'text-success' : 'text-ink/40']">合同</span>
        <span :class="['flex-1 text-center', ['DOWNLOAD_UNLOCKED','DELIVERED'].includes(order.status) ? 'text-success' : 'text-ink/40']">下载</span>
      </div>
      <div class="mt-3 h-1 bg-cream rounded-full overflow-hidden">
        <div
          class="h-full bg-success transition-all"
          :style="{
            width: ({
              CREATED: '0%',
              PAID: '33%',
              CONTRACT_PENDING: '50%',
              CONTRACT_SIGNED: '75%',
              DOWNLOAD_UNLOCKED: '100%',
              DELIVERED: '100%',
            } as any)[order.status] || '0%'
          }"
        />
      </div>
    </div>

    <!-- 订单信息 -->
    <div class="bg-white rounded-2xl border border-line p-6 mb-6">
      <h2 class="text-lg font-medium mb-4">订单信息</h2>
      <div class="grid grid-cols-2 gap-y-3 text-sm">
        <span class="text-ink/60">IP</span><span>{{ order.ip.displayName }} <span class="text-ink/40 font-mono text-xs">({{ order.ip.code }})</span></span>
        <span class="text-ink/60">类型</span><span>{{ order.orderType === 'DEPOSIT_INTENT' ? '意向金' : '正式授权' }}</span>
        <span v-if="order.licenseScope" class="text-ink/60">授权范围</span><span v-if="order.licenseScope">{{ order.licenseScope }}</span>
        <span class="text-ink/60">金额</span><span class="font-mono">{{ formatFen(order.amountFen) }}</span>
        <span class="text-ink/60">状态</span><span>{{ order.status }}</span>
        <span class="text-ink/60">版权状态</span>
        <span>
          <span v-if="order.copyrightEffective" class="text-success">已生效</span>
          <span v-else class="text-gold">附条件生效中</span>
        </span>
        <span class="text-ink/60">创建时间</span><span class="text-xs">{{ new Date(order.createdAt).toLocaleString('zh-CN') }}</span>
      </div>
    </div>

    <!-- 合同操作 -->
    <div v-if="order.contract" class="bg-white rounded-2xl border border-line p-6 mb-6">
      <h2 class="text-lg font-medium mb-4">电子授权书</h2>
      <div class="text-sm mb-4">
        <div>合同编号: <span class="font-mono">{{ order.contract.id }}</span></div>
        <div>模板: {{ order.contract.templateCode }}</div>
        <div>状态: <span :class="order.contract.status === 'FULLY_SIGNED' ? 'text-success' : 'text-ink/60'">{{ order.contract.status }}</span></div>
      </div>
      <div class="flex gap-3">
        <button
          v-if="order.contract.status === 'AWAITING_BUYER_SIGN'"
          @click="buyerSignContract"
          class="px-5 py-2 bg-ink text-cream rounded-full text-sm hover:bg-gold transition"
        >买方签署</button>
        <button
          v-if="order.contract.status === 'AWAITING_PLATFORM_SIGN'"
          @click="adminSignContract"
          class="px-5 py-2 bg-gold text-ink rounded-full text-sm hover:bg-ink hover:text-cream transition"
        >平台签署 (Mock)</button>
      </div>
    </div>

    <!-- 下载列表 -->
    <div v-if="canDownload" class="bg-white rounded-2xl border border-line p-6">
      <h2 class="text-lg font-medium mb-4">资产包下载</h2>
      <p class="text-xs text-ink/50 mb-4">链接 5 分钟有效,过期请重新生成</p>
      <FilesToDownload :order-id="order.id" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';

const FilesToDownload = defineComponent({
  props: { orderId: { type: String, required: true } },
  setup(props) {
    const files = ref<any[]>([]);
    const loading = ref(false);

    async function fetch() {
      loading.value = true;
      try {
        const { data } = await apiClient.get('/download/list', { params: { orderId: props.orderId } });
        files.value = data.files;
      } finally { loading.value = false; }
    }

    async function download(fileId: string) {
      const { data } = await apiClient.post('/download/token', {
        orderId: props.orderId,
        fileId,
      });
      window.open(data.url, '_blank');
    }

    onMounted(fetch);
    return { files, loading, download };
  },
});

export default { components: { FilesToDownload } };
</script>