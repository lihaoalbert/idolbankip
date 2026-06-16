<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiClient, formatFen, ossUrl } from '@/api/client';
import Skeleton from '@/components/Skeleton.vue';
import EmptyState from '@/components/EmptyState.vue';

const orders = ref<any[]>([]);
const loading = ref(true);

function thumbUrl(key?: string): string {
  return key ? ossUrl(key) : '';
}

async function fetchOrders() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/orders/mine/list');
    orders.value = data.items;
  } finally { loading.value = false; }
}

function statusLabel(s: string): string {
  return {
    CREATED: '待支付',
    PAID: '已支付',
    CONTRACT_PENDING: '待签署',
    CONTRACT_SIGNED: '已签署',
    DOWNLOAD_UNLOCKED: '可下载',
    DELIVERED: '已交付',
    REFUNDED: '已退款',
    CANCELLED: '已取消',
  }[s] || s;
}

function statusColor(s: string): string {
  return {
    DOWNLOAD_UNLOCKED: 'bg-success/15 text-success',
    PAID: 'bg-gold/20 text-ink',
    CONTRACT_PENDING: 'bg-ink/10 text-ink/70',
    CREATED: 'bg-danger/10 text-danger',
    REFUNDED: 'bg-ink/10 text-ink/50',
  }[s] || 'bg-ink/10 text-ink/60';
}

onMounted(fetchOrders);
</script>

<template>
  <div class="max-w-5xl mx-auto px-6 py-10">
    <h1 class="font-display text-3xl mb-2">我的订单</h1>
    <p class="text-sm text-ink/60 mb-8">查看所有已购与待支付订单</p>

    <div v-if="loading" class="bg-surface rounded-2xl border border-line overflow-hidden">
      <div class="p-4 border-b border-line bg-cream">
        <Skeleton shape="line" width="30%" height-class="h-4" />
      </div>
      <div v-for="i in 4" :key="i" class="flex items-center gap-3 p-4 border-b border-line">
        <Skeleton shape="circle" width-class="w-10 h-10" />
        <div class="flex-1 space-y-2">
          <Skeleton shape="line" width="40%" />
          <Skeleton shape="line" width="20%" height-class="h-2" />
        </div>
        <Skeleton shape="line" width="15%" />
      </div>
    </div>
    <EmptyState
      v-else-if="orders.length === 0"
      icon="🧾"
      title="还没有订单"
      description="去形象库挑选一个数字人 IP,完成支付后会自动生成授权订单"
      action-label="去形象库看看"
      action-to="/ips"
    />
    <div v-else class="bg-surface rounded-2xl border border-line overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-cream border-b border-line text-xs text-ink/60">
          <tr>
            <th class="text-left p-4">IP</th>
            <th class="text-left p-4">类型</th>
            <th class="text-right p-4">金额</th>
            <th class="text-left p-4">状态</th>
            <th class="text-left p-4">创建时间</th>
            <th class="p-4"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="o in orders"
            :key="o.id"
            class="border-b border-line hover:bg-cream/40 transition"
          >
            <td class="p-4">
              <div class="flex items-center gap-3">
                <img
                  v-if="o.ip?.thumbnailKey"
                  :src="thumbUrl(o.ip.thumbnailKey)"
                  class="w-10 h-10 rounded object-cover"
                />
                <div>
                  <div class="font-medium">{{ o.ip?.displayName }}</div>
                  <div class="text-xs text-ink/40 font-mono">{{ o.ip?.code }}</div>
                </div>
              </div>
            </td>
            <td class="p-4">
              <span class="text-xs">{{ o.orderType === 'DEPOSIT_INTENT' ? '意向金' : '正式授权' }}</span>
              <div v-if="o.licenseScope" class="text-xs text-ink/40 mt-0.5">{{ o.licenseScope }}</div>
            </td>
            <td class="p-4 text-right font-mono">{{ formatFen(o.amountFen) }}</td>
            <td class="p-4">
              <span :class="['px-2 py-0.5 text-xs rounded-full', statusColor(o.status)]">
                {{ statusLabel(o.status) }}
              </span>
            </td>
            <td class="p-4 text-xs text-ink/60">{{ new Date(o.createdAt).toLocaleString('zh-CN') }}</td>
            <td class="p-4">
              <RouterLink :to="`/orders/${o.id}`" class="text-xs text-gold hover:underline">查看 →</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>