<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';

const items = ref<any[]>([]);
const loading = ref(true);
const filter = ref<string>('');

const statusLabel: Record<string, string> = {
  CREATED: '已创建',
  PAID: '已支付',
  CONTRACT_PENDING: '合同待签',
  CONTRACT_SIGNED: '合同已签',
  DOWNLOAD_UNLOCKED: '已解锁',
  DELIVERED: '已交付',
  REFUNDED: '已退款',
  CANCELLED: '已取消',
};

const statusColor: Record<string, string> = {
  CREATED: 'bg-ink/10 text-ink/60',
  PAID: 'bg-warn/15 text-warn',
  CONTRACT_PENDING: 'bg-warn/15 text-warn',
  CONTRACT_SIGNED: 'bg-gold/20 text-ink',
  DOWNLOAD_UNLOCKED: 'bg-success/15 text-success',
  DELIVERED: 'bg-success/15 text-success',
  REFUNDED: 'bg-ink/10 text-ink/50',
  CANCELLED: 'bg-ink/10 text-ink/50',
};

async function load() {
  loading.value = true;
  try {
    const params: any = {};
    if (filter.value) params.status = filter.value;
    const { data } = await apiClient.get('/orders', { params });
    items.value = data.items;
  } finally { loading.value = false; }
}

function formatFen(f: number) { return '¥' + (f / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 }); }

onMounted(load);
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-8">
    <div class="flex items-baseline justify-between mb-6">
      <h1 class="font-display text-2xl">订单总览</h1>
      <select v-model="filter" @change="load" class="input-base !w-44 !py-1.5 text-sm">
        <option value="">全部状态</option>
        <option v-for="(label, code) in statusLabel" :key="code" :value="code">{{ label }}</option>
      </select>
    </div>

    <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>
    <div v-else-if="items.length === 0" class="text-center py-20 text-ink/40">暂无订单</div>

    <div v-else class="bg-white border border-line rounded-2xl overflow-hidden">
      <table class="w-full">
        <thead class="bg-cream">
          <tr>
            <th class="table-th">订单号</th>
            <th class="table-th">IP</th>
            <th class="table-th">类型</th>
            <th class="table-th">金额</th>
            <th class="table-th">状态</th>
            <th class="table-th">时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in items" :key="o.id" class="border-t border-line hover:bg-cream/30">
            <td class="table-td font-mono text-xs">{{ o.id.slice(-10) }}</td>
            <td class="table-td">
              <div class="font-medium">{{ o.ip?.displayName || '—' }}</div>
              <div class="text-xs text-ink/50 font-mono">{{ o.ip?.code }}</div>
            </td>
            <td class="table-td text-xs">{{ o.orderType === 'DEPOSIT_INTENT' ? '意向金' : '正式授权' }}</td>
            <td class="table-td font-medium">{{ formatFen(o.amountFen) }}</td>
            <td class="table-td">
              <span :class="['badge', statusColor[o.status]]">{{ statusLabel[o.status] }}</span>
              <span v-if="o.copyrightEffective" class="ml-1 badge bg-success/15 text-success">已生效</span>
              <span v-else-if="o.isConditional" class="ml-1 badge bg-warn/15 text-warn">附条件</span>
            </td>
            <td class="table-td text-xs text-ink/50">{{ new Date(o.createdAt).toLocaleString('zh-CN') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
