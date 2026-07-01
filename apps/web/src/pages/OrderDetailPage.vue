<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { apiClient, formatFen } from '@/api/client';
import Skeleton from '@/components/Skeleton.vue';
import { useToast } from '@/composables/useToast';

const route = useRoute();
const toast = useToast();
const orderId = computed(() => route.params.id as string);
const order = ref<any>(null);
const loading = ref(true);
const files = ref<any[]>([]);
const filesLoading = ref(false);

async function fetchOrder() {
  loading.value = true;
  try {
    const { data } = await apiClient.get(`/orders/${orderId.value}`);
    order.value = data.order;
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '加载订单失败');
  } finally { loading.value = false; }
}

async function fetchFiles() {
  if (!canDownload.value) return;
  filesLoading.value = true;
  try {
    const { data } = await apiClient.get('/download/list', { params: { orderId: orderId.value } });
    files.value = data.files;
  } finally { filesLoading.value = false; }
}

async function buyerSignContract() {
  if (!order.value.contract) return;
  try {
    await apiClient.post(`/contracts/${order.value.contract.id}/buyer-sign`);
    toast.success('签署成功');
    await fetchOrder();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '签署失败');
  }
}

async function adminSignContract() {
  if (!order.value.contract) return;
  try {
    await apiClient.post(`/contracts/${order.value.contract.id}/platform-sign`);
    toast.success('平台签署成功');
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '签署失败 (需要管理员权限)');
  }
  await fetchOrder();
}

async function downloadContract() {
  if (!order.value.contract) return;
  try {
    const { data } = await apiClient.get(`/contracts/${order.value.contract.id}/file`, {
      responseType: 'blob',
    });
    const blob = new Blob([data as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${order.value.ip.code}-${order.value.contract.templateCode}-${order.value.contract.id.slice(-6)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '下载失败');
  }
}

const canDownload = computed(() =>
  ['DOWNLOAD_UNLOCKED', 'DELIVERED'].includes(order.value?.status) &&
  order.value?.contract?.status === 'FULLY_SIGNED'
);

async function requestDownload(fileId: string) {
  try {
    const { data } = await apiClient.post('/download/token', { orderId: orderId.value, fileId });
    window.open(data.url, '_blank');
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '生成下载链接失败');
  }
}

const STAGES = [
  { key: 'CREATED', label: '下单', roman: 'I' },
  { key: 'PAID', label: '支付', roman: 'II' },
  { key: 'CONTRACT_PENDING', label: '合同', roman: 'III' },
  { key: 'DOWNLOAD_UNLOCKED', label: '下载', roman: 'IV' },
];

function stageState(stageKey: string): 'done' | 'current' | 'pending' {
  const status = order.value?.status;
  const order_index = STAGES.findIndex(s => s.key === stageKey);
  const status_index = STAGES.findIndex(s => s.key === status);
  if (status === 'DELIVERED' || status === 'CONTRACT_SIGNED') return 'done';
  if (order_index < status_index) return 'done';
  if (order_index === status_index) return 'current';
  return 'pending';
}

function shortId(id: string, len = 8): string {
  return id ? id.slice(-len).toUpperCase() : '—';
}

function fmtDate(s?: string): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtSize(bytes?: number): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb > 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

onMounted(async () => {
  await fetchOrder();
  await fetchFiles();
});
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <!-- 顶部条 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">ibi.ren · ORDER DOSSIER</div>
        <div class="catalog-no text-ink/40">VOL. I — {{ shortId(orderId) }}</div>
        <div class="catalog-no text-ink/30">{{ fmtDate(order?.createdAt).split(' ')[0] }}</div>
      </div>
    </header>

    <main class="max-w-5xl mx-auto px-6 lg:px-10 py-12 md:py-16">
      <!-- 章节头 -->
      <div class="mb-10">
        <RouterLink to="/orders" class="catalog-no text-ink/50 hover:text-gold transition inline-flex items-center gap-2 mb-4">
          <span>←</span><span>RETURN TO LEDGER</span>
        </RouterLink>
        <div class="flex items-baseline justify-between flex-wrap gap-4">
          <h1 class="font-display text-5xl md:text-7xl text-ink leading-[0.95]">
            订单<span class="font-display-italic text-gold">详</span>情
          </h1>
          <div class="catalog-no text-ink/50">№ {{ shortId(orderId, 12) }}</div>
        </div>
      </div>

      <div v-if="loading" class="space-y-6">
        <div class="bg-surface border-0.5 border-ink p-8 space-y-4">
          <Skeleton shape="line" width="40%" height-class="h-6" />
          <Skeleton shape="line" width="100%" height-class="h-2" />
        </div>
        <div class="bg-surface border-0.5 border-ink p-8 space-y-4">
          <Skeleton shape="line" width="20%" height-class="h-5" />
          <Skeleton shape="line" :lines="5" />
        </div>
      </div>

      <div v-else-if="order" class="space-y-10">

        <!-- 进度时间线 · 像图录的工序进度 -->
        <section>
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            — 01 — PROCESS · 工序进度
          </div>
          <div class="bg-surface border-0.5 border-ink p-8 md:p-10">
            <ol class="grid grid-cols-4 gap-0 relative">
              <li
                v-for="(s, idx) in STAGES"
                :key="s.key"
                class="flex flex-col items-center text-center"
              >
                <div
                  :class="[
                    'w-12 h-12 rounded-full flex items-center justify-center font-display text-lg border-0.5 transition',
                    stageState(s.key) === 'done' ? 'bg-ink text-cream border-ink' :
                    stageState(s.key) === 'current' ? 'bg-gold text-ink border-gold' :
                    'bg-cream text-ink/30 border-line'
                  ]"
                >
                  {{ stageState(s.key) === 'done' ? '✓' : s.roman }}
                </div>
                <div
                  :class="[
                    'mt-3 catalog-no',
                    stageState(s.key) === 'pending' ? 'text-ink/30' : 'text-ink'
                  ]"
                >
                  {{ s.label }}
                </div>
                <div class="mt-1 text-[10px] catalog-no text-ink/40">
                  {{ stageState(s.key).toUpperCase() }}
                </div>
              </li>
            </ol>
          </div>
        </section>

        <!-- 订单信息 -->
        <section>
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            — 02 — ORDER DETAILS · 订单详情
          </div>
          <div class="bg-surface border-0.5 border-ink p-8 md:p-10 grid md:grid-cols-2 gap-y-5 gap-x-8">
            <div>
              <div class="catalog-no text-ink/50 mb-2">IP</div>
              <div class="font-display text-lg text-ink">{{ order.ip.displayName }}</div>
              <div class="font-mono text-xs text-ink/40 mt-1">{{ order.ip.code }}</div>
            </div>
            <div>
              <div class="catalog-no text-ink/50 mb-2">AMOUNT</div>
              <div class="font-display text-3xl text-gold">{{ formatFen(order.amountFen) }}</div>
            </div>
            <div>
              <div class="catalog-no text-ink/50 mb-2">ORDER TYPE</div>
              <div class="text-ink">{{ order.orderType === 'DEPOSIT_INTENT' ? '意向金 / 测试期' : '正式授权' }}</div>
              <div v-if="order.licenseScope" class="font-mono text-xs text-ink/40 mt-1">{{ order.licenseScope }}</div>
            </div>
            <div>
              <div class="catalog-no text-ink/50 mb-2">COPYRIGHT</div>
              <div v-if="order.copyrightEffective" class="inline-flex items-center gap-2">
                <span class="catalog-no text-success">EFFECTIVE</span>
                <span class="text-xs text-ink/60">已生效</span>
              </div>
              <div v-else class="inline-flex items-center gap-2">
                <span class="catalog-no text-gold">CONDITIONAL</span>
                <span class="text-xs text-ink/60">附条件生效中</span>
              </div>
            </div>
            <div>
              <div class="catalog-no text-ink/50 mb-2">FILED</div>
              <div class="font-mono text-sm text-ink">{{ fmtDate(order.createdAt) }}</div>
            </div>
            <div>
              <div class="catalog-no text-ink/50 mb-2">TX HASH</div>
              <div class="font-mono text-xs text-ink/60 truncate">{{ order.blockchainTxId || '—' }}</div>
            </div>
          </div>
        </section>

        <!-- 合同 -->
        <section v-if="order.contract">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            — 03 — CONTRACT · 电子授权书
          </div>
          <div class="bg-surface border-0.5 border-ink p-8 md:p-10 relative">
            <div class="absolute -top-3 left-8">
              <div class="stamp text-gold bg-cream">E-SIGNED</div>
            </div>
            <div class="grid md:grid-cols-3 gap-6 mb-6">
              <div>
                <div class="catalog-no text-ink/50 mb-2">CONTRACT №</div>
                <div class="font-mono text-sm text-ink">{{ shortId(order.contract.id, 16) }}</div>
              </div>
              <div>
                <div class="catalog-no text-ink/50 mb-2">TEMPLATE</div>
                <div class="font-mono text-sm text-ink">{{ order.contract.templateCode }}</div>
              </div>
              <div>
                <div class="catalog-no text-ink/50 mb-2">STATUS</div>
                <div>
                  <span
                    :class="[
                      'inline-block px-2 py-1 catalog-no text-xs',
                      order.contract.status === 'FULLY_SIGNED' ? 'bg-success/10 text-success' :
                      order.contract.status === 'AWAITING_PLATFORM_SIGN' ? 'bg-gold/15 text-ink' :
                      'bg-ink/5 text-ink/60'
                    ]"
                  >
                    {{ order.contract.status }}
                  </span>
                </div>
              </div>
            </div>
            <div class="flex flex-wrap gap-3 hairline-t border-line pt-6">
              <button
                v-if="order.contract.status === 'AWAITING_BUYER_SIGN'"
                @click="buyerSignContract"
                class="inline-flex items-center gap-3 px-5 py-3 bg-ink text-cream hover:bg-gold transition group"
              >
                <span class="catalog-no text-cream/70 group-hover:text-ink/70 text-[10px]">SIGN AS BUYER</span>
                <span>买方签署</span>
                <span class="font-display-italic">→</span>
              </button>
              <button
                v-if="order.contract.status === 'AWAITING_PLATFORM_SIGN'"
                @click="adminSignContract"
                class="inline-flex items-center gap-3 px-5 py-3 bg-gold text-ink hover:bg-ink hover:text-cream transition"
              >
                <span class="catalog-no text-ink/70 text-[10px]">PLATFORM SIGN</span>
                <span>平台签署 (Mock)</span>
              </button>
              <button
                @click="downloadContract"
                class="inline-flex items-center gap-3 px-5 py-3 border-0.5 border-ink text-ink hover:bg-ink hover:text-cream transition"
              >
                <span>↓</span>
                <span>下载合同 PDF</span>
              </button>
            </div>
          </div>
        </section>

        <!-- 资产包下载 -->
        <section v-if="canDownload">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            — 04 — ASSETS · 资产包下载
          </div>
          <div class="bg-surface border-0.5 border-ink p-8 md:p-10">
            <div class="mb-6 p-4 bg-gold/5 border-0.5 border-gold/30 flex items-start gap-3">
              <span class="font-display-italic text-gold text-2xl shrink-0">※</span>
              <div class="text-sm leading-relaxed text-ink/70">
                <div class="font-display text-base text-ink mb-1">下载即溯源</div>
                每个文件均嵌入 DWT-SVD 隐水印 (含您的用户 ID + 时间戳)。
                文件即使被裁剪、压缩、调色, 平台仍可通过
                <code class="font-mono text-gold">ibi.ren/verify</code>
                提取水印取证。请勿外传, 以免被追溯至您的账户。
              </div>
            </div>

            <div v-if="filesLoading" class="space-y-3">
              <Skeleton shape="line" :lines="3" />
            </div>

            <ul v-else-if="files.length > 0" class="space-y-2">
              <li
                v-for="f in files"
                :key="f.id"
                class="flex items-center gap-4 py-3 hairline-b border-line last:border-b-0"
              >
                <div class="catalog-no text-gold shrink-0 w-12">FILE</div>
                <div class="flex-1 min-w-0">
                  <div class="font-mono text-sm text-ink truncate">{{ f.fileName || f.key }}</div>
                  <div class="text-xs text-ink/40 catalog-no mt-0.5">
                    {{ fmtSize(f.sizeBytes) }} · {{ f.mimeType || 'asset' }}
                  </div>
                </div>
                <button
                  @click="requestDownload(f.id)"
                  class="inline-flex items-center gap-2 px-4 py-2 border-0.5 border-ink text-ink hover:bg-ink hover:text-cream transition text-sm shrink-0"
                >
                  <span>↓</span>
                  <span>下载</span>
                </button>
              </li>
            </ul>

            <div v-else class="text-center py-8 text-sm text-ink/40 catalog-no">
              NO FILES ATTACHED · 资产包准备中
            </div>

            <p class="mt-4 text-[11px] text-ink/40 catalog-no">
              链接 5 分钟有效 · 过期请重新生成
            </p>
          </div>
        </section>
      </div>
    </main>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line mt-12">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. ORDER-{{ shortId(orderId) }}</span>
        <span>SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>
