<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
// (useToast imported below)
import { apiClient, formatFen, ossUrl } from '@/api/client';
import Skeleton from '@/components/Skeleton.vue';
import EmptyState from '@/components/EmptyState.vue';
import { formatDateTime } from '@/utils/formatDate';

const orders = ref<any[]>([]);
const loading = ref(true);
const route = useRoute();
const router = useRouter();

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

function statusVariant(s: string): 'pending' | 'success' | 'danger' | 'neutral' {
  if (['DOWNLOAD_UNLOCKED', 'DELIVERED', 'CONTRACT_SIGNED'].includes(s)) return 'success';
  if (['CREATED', 'REFUNDED', 'CANCELLED'].includes(s)) return 'danger';
  if (s === 'PAID' || s === 'CONTRACT_PENDING') return 'pending';
  return 'neutral';
}

// R11.2 P1-5: 状态 tab(URL query 同步)
// 全部 / 待支付 / 进行中(签约) / 已完成(下载/交付)
const TABS = [
  { key: 'all',     label: '全部',     match: () => true },
  { key: 'pending', label: '待支付',   match: (s: string) => s === 'CREATED' },
  { key: 'active',  label: '进行中',   match: (s: string) => s === 'CONTRACT_PENDING' || s === 'CONTRACT_SIGNED' || s === 'PAID' },
  { key: 'done',    label: '已完成',   match: (s: string) => s === 'DOWNLOAD_UNLOCKED' || s === 'DELIVERED' },
  { key: 'closed',  label: '退款/取消',match: (s: string) => s === 'REFUNDED' || s === 'CANCELLED' },
] as const;
type TabKey = typeof TABS[number]['key'];

const activeTab = computed<TabKey>(() => {
  const q = String(route.query.tab ?? 'all');
  return (TABS.find((t) => t.key === q)?.key ?? 'all') as TabKey;
});
const filteredOrders = computed(() => {
  const tab = TABS.find((t) => t.key === activeTab.value)!;
  return orders.value.filter((o) => tab.match(o.status));
});
const tabCount = (key: TabKey) => {
  const tab = TABS.find((t) => t.key === key)!;
  return orders.value.filter((o) => tab.match(o.status)).length;
};
function setTab(key: TabKey) {
  router.replace({ query: key === 'all' ? {} : { tab: key } });
}

onMounted(fetchOrders);

// R11.1 P0-1: 行内快捷支付(不进详情直接调)
import { useToast } from '@/composables/useToast';
const toast = useToast();
const payingId = ref<string | null>(null);
async function payInline(orderId: string) {
  payingId.value = orderId;
  try {
    await apiClient.post(`/orders/${orderId}/pay`, { channel: 'mock_alipay' });
    toast.success('支付成功');
    await fetchOrders();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '支付失败');
  } finally {
    payingId.value = null;
  }
}

// 当 tab 改变时刷新(下拉时拉新数据)— 这里只切换本地过滤,不需要重拉
watch(activeTab, () => {});
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <!-- 顶部条 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">IBIren · ORDER LEDGER</div>
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

      <!-- R11.2 P1-5: 状态 tab(URL query 同步) -->
      <div class="flex items-center gap-1 mb-6 border-b-0.5 border-line">
        <button
          v-for="t in TABS"
          :key="t.key"
          @click="setTab(t.key)"
          :class="[
            'px-4 py-2 catalog-no text-sm transition border-b-2 -mb-0.5',
            activeTab === t.key
              ? 'border-gold text-ink'
              : 'border-transparent text-ink/50 hover:text-ink'
          ]"
        >
          {{ t.label }}
          <span v-if="tabCount(t.key) > 0" class="ml-1 text-ink/40">({{ tabCount(t.key) }})</span>
        </button>
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
          description="买 IP 或 brief 中标后, 支付与合同状态都会显示在这里"
          action-label="BROWSE CATALOGUE"
          action-to="/ips"
        />
      </div>

      <div v-else-if="filteredOrders.length === 0" class="py-16 text-center catalog-no text-ink/40">
        — 该 tab 下暂无订单 —
        <button class="block mx-auto mt-3 text-sm text-gold hover:text-ink transition" @click="setTab('all')">
          ← 查看全部
        </button>
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
          v-for="(o, idx) in filteredOrders"
          :key="o.id"
          :to="`/orders/${o.id}`"
          class="block grid grid-cols-12 gap-4 px-6 py-5 hairline-b border-line items-center hover:bg-gold/5 transition group"
        >
          <!-- IP / Brief 标题 -->
          <div class="col-span-12 md:col-span-4 flex items-center gap-4 min-w-0">
            <div class="catalog-no text-gold shrink-0">{{ String(idx + 1).padStart(3, '0') }}</div>
            <!-- R10 P0-3: ip=null 时显示 brief 缩略占位(发包中标单没缩略图) -->
            <div
              v-if="o.brief && !o.ip"
              class="w-12 h-12 bg-stamp-red/10 text-stamp-red flex items-center justify-center font-display text-lg shrink-0"
              aria-label="发包中标"
            >
              ✉
            </div>
            <img
              v-else-if="o.ip?.thumbnailKey"
              :src="thumbUrl(o.ip.thumbnailKey)"
              class="w-12 h-12 object-cover border-0.5 border-line shrink-0"
              :alt="o.ip.displayName"
            />
            <div class="min-w-0">
              <div class="font-display text-base text-ink truncate group-hover:text-gold transition">
                <!-- R10 P0-3: 兼容两种来源(买 IP / brief 中标) -->
                <span v-if="o.ip">{{ o.ip.displayName }}</span>
                <span v-else-if="o.brief">{{ o.brief.title }}</span>
                <span v-else>—</span>
              </div>
              <div class="font-mono text-xs text-ink/40 truncate">
                <span v-if="o.ip">{{ o.ip.code }}</span>
                <span v-else-if="o.brief" class="text-stamp-red">发包中标 · BRIEF · {{ o.brief.id.slice(-6) }}</span>
              </div>
            </div>
          </div>

          <!-- 类型 -->
          <div class="col-span-6 md:col-span-2">
            <div class="font-sans text-sm text-ink">
              <!-- R10 P0-3: brief 中标订单暂复用 DEPOSIT_INTENT,展示为「中标待付」 -->
              <span v-if="o.brief && !o.ip">中标待付</span>
              <span v-else>{{ o.orderType === 'DEPOSIT_INTENT' ? '意向金 / 测试期' : '正式授权' }}</span>
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
          <div class="col-span-6 md:col-span-2 flex flex-col gap-2">
            <span
              :class="[
                'inline-flex items-center gap-2 px-2 py-1 text-xs catalog-no w-fit',
                statusVariant(o.status) === 'success' ? 'bg-success/10 text-success' :
                statusVariant(o.status) === 'danger' ? 'bg-danger/10 text-danger' :
                statusVariant(o.status) === 'pending' ? 'bg-gold/15 text-ink' :
                'bg-ink/5 text-ink/60'
              ]"
            >
              <span>{{ statusLabel(o.status) }}</span>
            </span>
            <!-- R11.1 P0-1: 行内快捷支付 -->
            <button
              v-if="o.status === 'CREATED'"
              @click.prevent="payInline(o.id)"
              :disabled="payingId === o.id"
              class="text-xs px-2 py-1 bg-stamp-red text-cream hover:bg-ink transition w-fit disabled:opacity-50"
            >
              {{ payingId === o.id ? '支付中…' : '💳 去支付' }}
            </button>
          </div>

          <!-- 时间 · R11.3 P2-1 统一 -->
          <div class="col-span-6 md:col-span-2 md:text-right text-xs text-ink/60 font-mono">
            {{ formatDateTime(o.createdAt) }}
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
