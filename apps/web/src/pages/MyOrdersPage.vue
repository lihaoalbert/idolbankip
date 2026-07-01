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

function statusRoman(s: string): string {
  return {
    CREATED: 'I',
    PAID: 'II',
    CONTRACT_PENDING: 'III',
    CONTRACT_SIGNED: 'IV',
    DOWNLOAD_UNLOCKED: 'V',
    DELIVERED: 'VI',
    REFUNDED: '—',
    CANCELLED: '×',
  }[s] || '?';
}

function statusVariant(s: string): 'pending' | 'success' | 'danger' | 'neutral' {
  if (['DOWNLOAD_UNLOCKED', 'DELIVERED', 'CONTRACT_SIGNED'].includes(s)) return 'success';
  if (['CREATED', 'REFUNDED', 'CANCELLED'].includes(s)) return 'danger';
  if (s === 'PAID' || s === 'CONTRACT_PENDING') return 'pending';
  return 'neutral';
}

onMounted(fetchOrders);
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <!-- 顶部条 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">ibi.ren · ORDER LEDGER</div>
        <div class="catalog-no text-ink/40">VOL. I — ACQUISITIONS</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-[1320px] mx-auto px-6 lg:px-10 py-12 md:py-16">
      <!-- 章节头 -->
      <div class="grid grid-cols-12 gap-4 mb-8">
        <div class="col-span-3 catalog-no text-ink/50">№ 010</div>
        <div class="col-span-3 col-start-5 catalog-no text-ink/50">CHAPTER X — LEDGER</div>
        <div class="col-span-3 col-start-9 catalog-no text-ink/50">PRIVATE DOSSIER</div>
        <div class="col-span-3 col-start-12 catalog-no text-ink/50 text-right hidden md:block">{{ orders.length }} ENTRIES</div>
      </div>

      <div class="flex items-end justify-between flex-wrap gap-4 mb-10">
        <h1 class="font-display text-6xl md:text-8xl text-ink leading-[0.9]">
          我的<span class="font-display-italic text-gold">订</span>单
        </h1>
        <p class="text-sm text-ink/60 max-w-md leading-relaxed">
          所有支付、授权合同、电子签状态都在此处归档 ·
          每条订单都有唯一编号, 可在订单详情下载完整凭证。
        </p>
      </div>

      <!-- 内容 -->
      <div v-if="loading" class="bg-surface border-0.5 border-ink p-6">
        <div class="flex items-baseline justify-between mb-6 pb-3 hairline-b border-line">
          <span class="catalog-no text-ink/50">LOADING LEDGER…</span>
          <span class="catalog-no text-ink/30">№ —</span>
        </div>
        <div class="space-y-1">
          <div v-for="i in 4" :key="i" class="flex items-center gap-4 py-4 hairline-b border-line">
            <Skeleton shape="block" width-class="w-12 h-12" />
            <div class="flex-1 space-y-2">
              <Skeleton shape="line" width="40%" height-class="h-3" />
              <Skeleton shape="line" width="20%" height-class="h-2" />
            </div>
            <Skeleton shape="line" width="15%" height-class="h-4" />
          </div>
        </div>
      </div>

      <div v-else-if="orders.length === 0" class="py-20">
        <EmptyState
          icon="◇"
          title="— No entries yet —"
          description="去形象库挑选一个数字人 IP, 完成支付后会自动生成授权订单"
          action-label="BROWSE CATALOGUE"
          action-to="/ips"
        />
      </div>

      <!-- 订单列表 · 像图录的条目 -->
      <div v-else class="bg-surface border-0.5 border-ink">
        <!-- 表头 -->
        <div class="hidden md:grid grid-cols-12 gap-4 px-6 py-4 hairline-b border-line bg-cream/50 catalog-no text-ink/50">
          <div class="col-span-4">PLATE · IP</div>
          <div class="col-span-2">TYPE</div>
          <div class="col-span-2 text-right">AMOUNT</div>
          <div class="col-span-2">STATUS</div>
          <div class="col-span-2 text-right">FILED</div>
        </div>

        <RouterLink
          v-for="(o, idx) in orders"
          :key="o.id"
          :to="`/orders/${o.id}`"
          class="block grid grid-cols-12 gap-4 px-6 py-5 hairline-b border-line items-center hover:bg-gold/5 transition group"
        >
          <!-- IP -->
          <div class="col-span-12 md:col-span-4 flex items-center gap-4 min-w-0">
            <div class="catalog-no text-gold shrink-0">{{ String(idx + 1).padStart(3, '0') }}</div>
            <img
              v-if="o.ip?.thumbnailKey"
              :src="thumbUrl(o.ip.thumbnailKey)"
              class="w-12 h-12 object-cover border-0.5 border-line shrink-0"
              :alt="o.ip.displayName"
            />
            <div class="min-w-0">
              <div class="font-display text-base text-ink truncate group-hover:text-gold transition">
                {{ o.ip?.displayName }}
              </div>
              <div class="font-mono text-xs text-ink/40 truncate">{{ o.ip?.code }}</div>
            </div>
          </div>

          <!-- 类型 -->
          <div class="col-span-6 md:col-span-2">
            <div class="font-sans text-sm text-ink">
              {{ o.orderType === 'DEPOSIT_INTENT' ? '意向金 / 测试期' : '正式授权' }}
            </div>
            <div v-if="o.licenseScope" class="font-mono text-xs text-ink/40 mt-0.5 truncate">
              {{ o.licenseScope }}
            </div>
          </div>

          <!-- 金额 -->
          <div class="col-span-6 md:col-span-2 md:text-right">
            <div class="font-display text-lg text-ink">{{ formatFen(o.amountFen) }}</div>
          </div>

          <!-- 状态 -->
          <div class="col-span-6 md:col-span-2">
            <span
              :class="[
                'inline-flex items-center gap-2 px-2 py-1 text-xs catalog-no',
                statusVariant(o.status) === 'success' ? 'bg-success/10 text-success' :
                statusVariant(o.status) === 'danger' ? 'bg-danger/10 text-danger' :
                statusVariant(o.status) === 'pending' ? 'bg-gold/15 text-ink' :
                'bg-ink/5 text-ink/60'
              ]"
            >
              <span class="text-gold">{{ statusRoman(o.status) }}</span>
              <span>{{ statusLabel(o.status) }}</span>
            </span>
          </div>

          <!-- 时间 -->
          <div class="col-span-6 md:col-span-2 md:text-right text-xs text-ink/60 font-mono">
            {{ new Date(o.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}
          </div>
        </RouterLink>

        <!-- 底部 colophon -->
        <div class="px-6 py-4 flex items-center justify-between catalog-no text-ink/40">
          <span>END OF LEDGER</span>
          <span>FILED UNDER MEMBER {{ $route.meta.requiresAuth ? 'AUTH' : '—' }}</span>
          <span>© 2026 IBI.REN</span>
        </div>
      </div>
    </main>
  </div>
</template>
