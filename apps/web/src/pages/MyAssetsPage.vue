<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiClient, ossUrl } from '@/api/client';
import Skeleton from '@/components/Skeleton.vue';
import EmptyState from '@/components/EmptyState.vue';

const orders = ref<any[]>([]);
const loading = ref(true);
const downloading = ref<string | null>(null);

async function fetchOrders() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/orders/mine/list', { params: { status: 'DOWNLOAD_UNLOCKED' } });
    orders.value = data.items.filter((o: any) => o.contract?.status === 'FULLY_SIGNED');
  } finally { loading.value = false; }
}

async function download(orderId: string, fileId: string) {
  const key = `${orderId}:${fileId}`;
  downloading.value = key;
  try {
    const { data } = await apiClient.post('/download/token', { orderId, fileId });
    window.open(data.url, '_blank');
  } finally {
    setTimeout(() => { downloading.value = null; }, 1000);
  }
}

function shortId(id: string, len = 8): string {
  return id ? id.slice(-len).toUpperCase() : '—';
}

function fmtSize(bytes?: number): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb > 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

onMounted(fetchOrders);
</script>

<template>
  <div class="bg-r12-canvas min-h-screen">

    <!-- 顶部条 -->
    <header class="border-b border-r12-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-r12-ink-tertiary">IBIren · PRIVATE COLLECTION</div>
        <div class="catalog-no text-r12-ink-tertiary">VOL. I — ASSETS</div>
        <div class="catalog-no text-r12-ink-tertiary">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-[1320px] mx-auto px-6 lg:px-10 py-12 md:py-16">
      <!-- 章节头 -->
      <div class="grid grid-cols-12 gap-4 mb-8">
        <div class="col-span-3 catalog-no text-r12-ink-tertiary">№ 011</div>
        <div class="col-span-3 col-start-5 catalog-no text-r12-ink-tertiary">CHAPTER XI — COLLECTION</div>
        <div class="col-span-3 col-start-9 catalog-no text-r12-ink-tertiary">PRIVATE HOLDINGS</div>
        <div class="col-span-3 col-start-12 catalog-no text-r12-ink-tertiary text-right hidden md:block">{{ orders.length }} PLATES</div>
      </div>

      <div class="flex items-end justify-between flex-wrap gap-4 mb-10">
        <h1 class="font-r12-sans text-r12-display font-semibold leading-tight text-r12-ink-primary">
          我的<span class="text-r12-cobalt">资</span>产
        </h1>
        <p class="text-r12-caption text-r12-ink-secondary max-w-md leading-relaxed">
          已签署合同的 IP 资产 · 可在此调取完整资产包 ·
          每个文件均嵌入平台不可见水印, 终身可溯源。
        </p>
      </div>

      <!-- 安全提示 · 暗色印章 -->
      <div class="mb-10 bg-r12-ink-primary text-white p-6 md:p-8 relative overflow-hidden rounded-r8-sm">
        <div class="absolute top-4 right-4 stamp text-r12-warning border-r12-warning">PROVENANCE</div>
        <div class="flex items-start gap-4">
          <span class="font-r12-sans text-4xl text-r12-warning shrink-0">※</span>
          <div class="text-sm leading-relaxed">
            <div class="font-r12-sans text-r12-body font-semibold text-white mb-2">下载即溯源</div>
            <p class="text-white/70">
              每个文件均嵌入
              <span class="text-r12-warning font-r12-mono text-r12-mono-body">DWT-SVD</span>
              隐水印 (含您的用户 ID + 时间戳) ·
              文件即使被裁剪、压缩、调色, 平台仍可通过
              <code class="font-r12-mono text-r12-warning">IBIren/verify</code>
              提取水印取证 ·
              请勿外传, 以免被追溯至您的账户。
            </p>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="grid md:grid-cols-2 gap-6">
        <div v-for="i in 4" :key="i" class="bg-r12-surface border border-r12-line p-6 rounded-r8-sm space-y-4">
          <div class="flex items-center gap-4">
            <Skeleton shape="block" width-class="w-20 h-20" />
            <div class="flex-1 space-y-2">
              <Skeleton shape="line" width="60%" height-class="h-4" />
              <Skeleton shape="line" width="40%" height-class="h-2" />
            </div>
          </div>
          <Skeleton shape="line" :lines="3" />
        </div>
      </div>

      <!-- Empty -->
      <EmptyState
        v-else-if="orders.length === 0"
        icon="◇"
        title="— No plates in collection —"
        description="买下 IP 授权并完成合同签署后, 完整资产包可从这里下载"
        action-label="BROWSE CATALOGUE"
        action-to="/ips"
      />

      <!-- 资产卡片 grid -->
      <div v-else class="grid md:grid-cols-2 gap-6">
        <article
          v-for="(o, idx) in orders"
          :key="o.id"
          class="bg-r12-surface border border-r12-line relative rounded-r8-sm"
        >
          <div class="absolute -top-3 left-6">
            <div class="stamp text-r12-warning bg-r12-canvas">№ {{ String(idx + 1).padStart(3, '0') }}</div>
          </div>

          <!-- 头部 -->
          <header class="flex items-start gap-5 p-6 border-b border-r12-line">
            <img
              v-if="o.ip?.thumbnailKey"
              :src="ossUrl(o.ip.thumbnailKey)"
              :alt="o.ip.displayName"
              class="w-20 h-20 object-cover border border-r12-line shrink-0"
            />
            <div class="flex-1 min-w-0">
              <div class="catalog-no text-r12-ink-tertiary mb-1">ACQUIRED</div>
              <h2 class="font-r12-sans text-r12-h3 font-semibold text-r12-ink-primary leading-tight truncate">{{ o.ip.displayName }}</h2>
              <div class="font-r12-mono text-r12-mono-body text-r12-ink-tertiary mt-1">{{ o.ip.code }}</div>
              <RouterLink :to="`/orders/${o.id}`" class="inline-block mt-3 text-r12-caption catalog-no text-r12-cobalt hover:underline">
                VIEW CONTRACT →
              </RouterLink>
            </div>
          </header>

          <!-- 资产包文件列表 -->
          <OrderFiles
            :order-id="o.id"
            @download="(fileId: string) => download(o.id, fileId)"
          />

          <!-- 底部 footer -->
          <footer class="px-6 py-3 border-t border-r12-line flex items-center justify-between catalog-no text-r12-ink-tertiary">
            <span>CONTRACT {{ shortId(o.contract.id, 8) }}</span>
            <span>DWT-SVD ENCRYPTED</span>
          </footer>
        </article>
      </div>
    </main>

    <!-- 底部 colophon -->
    <footer class="border-t border-r12-line mt-12">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-r12-ink-tertiary">
        <span>CAT. ASSETS-011</span>
        <span>SET IN GEIST · GEIST MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>

<script lang="ts">
// 双 <script> 块的子组件: 用 as 别名避免与 <script setup> 顶层 import 冲突 (vue-tsc 不支持重复 import)。
import { defineComponent as _defineComponent, onMounted as _onMounted, ref as _ref, computed as _computed } from 'vue';
import { apiClient as _apiClient } from '@/api/client';

function _fmtSize(bytes?: number): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb > 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

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
    return { files, loading, emit, fmtSize: _fmtSize };
  },
});

export default { components: { OrderFiles } };
</script>
