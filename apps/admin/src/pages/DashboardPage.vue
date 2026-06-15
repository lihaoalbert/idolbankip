<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';

const loading = ref(true);
const stats = ref<any>({
  totalIps: 0,
  pendingReview: 0,
  proofing: 0,
  publicIntent: 0,
  official: 0,
  rejected: 0,
  totalUsers: 0,
  totalCreators: 0,
  totalBuyers: 0,
  pendingKyc: 0,
  totalOrders: 0,
  paidOrders: 0,
  unlockedOrders: 0,
  gmvFen: 0,
});

async function load() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/admin/stats');
    stats.value = data.stats;
  } catch (e) {
    // 后端可能没实现 /admin/stats,降级用子接口聚合
    await fallback();
  } finally { loading.value = false; }
}

async function fallback() {
  try {
    const [ipQ, kyc, orders] = await Promise.all([
      apiClient.get('/ips/queue', { params: { status: 'PENDING_REVIEW' } }),
      apiClient.get('/kyc/queue'),
      apiClient.get('/orders/mine/list').catch(() => ({ data: { items: [] } })),
    ]);
    stats.value.pendingReview = ipQ.data.items?.length || 0;
    stats.value.pendingKyc = kyc.data.items?.filter((k: any) => k.status === 'PENDING').length || 0;
  } catch { /* ignore */ }
}

function formatFen(fen: number) {
  return '¥' + ((fen || 0) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

onMounted(load);
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-8">
    <h1 class="font-display text-2xl mb-6">运营仪表盘</h1>

    <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>

    <div v-else class="space-y-6">
      <!-- IP 状态机分布 -->
      <section>
        <h2 class="text-sm font-medium text-ink/60 mb-3">IP 状态分布</h2>
        <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div class="card-base text-center">
            <div class="text-2xl font-display">{{ stats.totalIps }}</div>
            <div class="text-xs text-ink/50 mt-1">全部 IP</div>
          </div>
          <div class="card-base text-center border-warn/30 bg-warn/5">
            <div class="text-2xl font-display text-warn">{{ stats.pendingReview }}</div>
            <div class="text-xs text-ink/50 mt-1">待审核</div>
          </div>
          <div class="card-base text-center">
            <div class="text-2xl font-display">{{ stats.proofing }}</div>
            <div class="text-xs text-ink/50 mt-1">存证中</div>
          </div>
          <div class="card-base text-center bg-gold/5 border-gold/30">
            <div class="text-2xl font-display">{{ stats.publicIntent }}</div>
            <div class="text-xs text-ink/50 mt-1">公示中</div>
          </div>
          <div class="card-base text-center bg-success/5 border-success/30">
            <div class="text-2xl font-display text-success">{{ stats.official }}</div>
            <div class="text-xs text-ink/50 mt-1">已登记</div>
          </div>
          <div class="card-base text-center bg-danger/5 border-danger/30">
            <div class="text-2xl font-display text-danger">{{ stats.rejected }}</div>
            <div class="text-xs text-ink/50 mt-1">已拒绝</div>
          </div>
        </div>
      </section>

      <!-- 用户 / KYC -->
      <section>
        <h2 class="text-sm font-medium text-ink/60 mb-3">用户与合规</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="card-base">
            <div class="text-xs text-ink/50">用户总数</div>
            <div class="text-2xl font-display mt-1">{{ stats.totalUsers }}</div>
          </div>
          <div class="card-base">
            <div class="text-xs text-ink/50">创作者</div>
            <div class="text-2xl font-display mt-1">{{ stats.totalCreators }}</div>
          </div>
          <div class="card-base">
            <div class="text-xs text-ink/50">采购方</div>
            <div class="text-2xl font-display mt-1">{{ stats.totalBuyers }}</div>
          </div>
          <div class="card-base border-warn/30">
            <div class="text-xs text-warn">待审 KYC</div>
            <div class="text-2xl font-display mt-1">{{ stats.pendingKyc }}</div>
            <RouterLink to="/kyc/queue" class="text-xs text-gold hover:underline mt-2 inline-block">前往处理 →</RouterLink>
          </div>
        </div>
      </section>

      <!-- 订单 / 收入 -->
      <section>
        <h2 class="text-sm font-medium text-ink/60 mb-3">订单与流水</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="card-base">
            <div class="text-xs text-ink/50">订单总数</div>
            <div class="text-2xl font-display mt-1">{{ stats.totalOrders }}</div>
          </div>
          <div class="card-base">
            <div class="text-xs text-ink/50">已支付</div>
            <div class="text-2xl font-display mt-1">{{ stats.paidOrders }}</div>
          </div>
          <div class="card-base bg-success/5 border-success/30">
            <div class="text-xs text-success">已解锁下载</div>
            <div class="text-2xl font-display mt-1 text-success">{{ stats.unlockedOrders }}</div>
          </div>
          <div class="card-base bg-gold/5 border-gold/30">
            <div class="text-xs text-ink/50">GMV</div>
            <div class="text-2xl font-display mt-1">{{ formatFen(stats.gmvFen) }}</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
