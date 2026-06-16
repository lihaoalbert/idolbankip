<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiClient, ossUrl, formatFen } from '@/api/client';
import WatermarkOverlay from '@/components/WatermarkOverlay.vue';
import Skeleton from '@/components/Skeleton.vue';
import EmptyState from '@/components/EmptyState.vue';

const orders = ref<any[]>([]);
const loading = ref(true);

async function fetchOrders() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/orders/mine/list', { params: { status: 'DOWNLOAD_UNLOCKED' } });
    orders.value = data.items.filter((o: any) => o.contract?.status === 'FULLY_SIGNED');
  } finally { loading.value = false; }
}

function download(orderId: string, fileId: string) {
  apiClient.post('/download/token', { orderId, fileId }).then(({ data }) => {
    window.open(data.url, '_blank');
  });
}

onMounted(fetchOrders);
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 py-10">
    <h1 class="font-display text-3xl mb-2">我的资产</h1>
    <p class="text-sm text-ink/60 mb-8">已签署合同的 IP 资产 · 可下载完整资产包</p>

    <div v-if="loading" class="space-y-6">
      <div v-for="i in 3" :key="i" class="bg-white rounded-2xl border border-line p-4">
        <div class="flex items-center gap-4 mb-3">
          <Skeleton shape="block" aspect="1/1" width-class="w-16 h-16 rounded-lg" />
          <div class="flex-1 space-y-2">
            <Skeleton shape="line" width="50%" />
            <Skeleton shape="line" width="30%" height-class="h-2" />
          </div>
        </div>
        <Skeleton shape="line" :lines="2" height-class="h-2" />
      </div>
    </div>
    <EmptyState
      v-else-if="orders.length === 0"
      icon="📦"
      title="还没有可下载的资产"
      description="完成订单支付 + 合同签署后,这里会出现可下载的完整资产包"
      action-label="去形象库看看"
      action-to="/ips"
    />
    <div v-else class="space-y-6">
      <div
        v-for="o in orders"
        :key="o.id"
        class="bg-white rounded-2xl border border-line overflow-hidden"
      >
        <div class="flex items-center gap-4 p-4 border-b border-line">
          <img
            v-if="o.ip?.thumbnailKey"
            :src="ossUrl(o.ip.thumbnailKey)"
            class="w-16 h-16 rounded-lg object-cover"
          />
          <div class="flex-1">
            <div class="font-medium">{{ o.ip.displayName }}</div>
            <div class="text-xs text-ink/50 font-mono">{{ o.ip.code }}</div>
          </div>
          <RouterLink :to="`/orders/${o.id}`" class="text-xs text-gold hover:underline">查看合同 →</RouterLink>
        </div>
        <OrderFiles :order-id="o.id" @download="(fileId: string) => download(o.id, fileId)" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
// 双 <script> 块的子组件定义: 用 as 别名避免与 <script setup> 顶层 import 冲突 (vue-tsc 不支持重复 import)。
import { defineComponent as _defineComponent, onMounted as _onMounted, ref as _ref } from 'vue';
import { apiClient as _apiClient } from '@/api/client';

const OrderFiles = _defineComponent({
  emits: ['download'],
  props: { orderId: { type: String, required: true } },
  setup(props, { emit }) {
    const files = _ref<any[]>([]);
    const loading = _ref(false);
    async function fetch() {
      loading.value = true;
      try {
        const { data } = await _apiClient.get('/download/list', { params: { orderId: props.orderId } });
        files.value = data.files;
      } finally { loading.value = false; }
    }
    _onMounted(fetch);
    return { files, loading, emit };
  },
});

export default { components: { OrderFiles } };
</script>