<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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

// #32 形象库覆盖度
const coverage = ref<any>(null);
const coverageLoading = ref(false);
const ETHNICITY_LABEL: Record<string, string> = {
  EAST_ASIAN: '东亚', SOUTHEAST_ASIAN: '东南亚', SOUTH_ASIAN: '南亚',
  AFRICAN: '非洲', EUROPEAN: '欧洲', MIXED: '混合/其他',
};
const GENDER_LABEL: Record<string, string> = { FEMALE: '女', MALE: '男', NONBINARY: '无性别' };
const AGE_LABEL: Record<string, string> = { CHILD: '童颜', YOUNG: '青年', MIDDLE: '中年', ELDERLY: '银发' };

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

async function loadCoverage() {
  coverageLoading.value = true;
  try {
    const { data } = await apiClient.get('/admin/library/coverage');
    coverage.value = data;
  } catch (e) {
    coverage.value = null;
  } finally { coverageLoading.value = false; }
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

// #32: heatmap lookup Map (key = gender-age-ethnicity → count)
const heatmapMap = computed(() => {
  const m = new Map<string, number>();
  for (const h of coverage.value?.heatmap || []) {
    m.set(`${h.gender}-${h.ageBucket}-${h.ethnicity}`, h.count);
  }
  return m;
});

function cellCount(gender: string, age: string, eth: string): number {
  return heatmapMap.value.get(`${gender}-${age}-${eth}`) || 0;
}

function pct(cnt: number): number {
  if (!coverage.value?.totalIps) return 0;
  return Math.round((cnt / coverage.value.totalIps) * 100);
}

onMounted(() => { load(); loadCoverage(); });
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

      <!-- #32 形象库覆盖度 -->
      <section v-if="coverage">
        <h2 class="text-sm font-medium text-ink/60 mb-3">形象库覆盖度 (性别 × 年龄 × 种族 = 72 格)</h2>

        <div v-if="coverageLoading && !coverage" class="card-base text-center text-ink/40 text-sm py-8">加载中...</div>

        <div v-else>
          <!-- 总分 + 待补种族 banner -->
          <div class="grid md:grid-cols-3 gap-3 mb-4">
            <div class="card-base">
              <div class="text-xs text-ink/50">覆盖度</div>
              <div class="text-2xl font-display mt-1">
                {{ coverage.grid.filledCells }} / {{ coverage.grid.totalCells }}
              </div>
              <div class="text-xs text-ink/50 mt-1">
                {{ coverage.grid.coveragePct }}% 格子被填充
              </div>
              <div class="h-1.5 bg-cream rounded-full overflow-hidden mt-2">
                <div class="h-full bg-gold transition-all" :style="{ width: coverage.grid.coveragePct + '%' }"></div>
              </div>
            </div>
            <div class="card-base">
              <div class="text-xs text-ink/50">已登记 IP</div>
              <div class="text-2xl font-display mt-1">{{ coverage.totalIps }}</div>
              <div class="text-xs text-ink/50 mt-1">计入覆盖度</div>
            </div>
            <div :class="['card-base', coverage.missingEthnicityCount > 0 ? 'border-warn/30 bg-warn/5' : 'border-line']">
              <div :class="['text-xs', coverage.missingEthnicityCount > 0 ? 'text-warn' : 'text-ink/50']">未标注种族</div>
              <div :class="['text-2xl font-display mt-1', coverage.missingEthnicityCount > 0 ? 'text-warn' : 'text-ink/40']">
                {{ coverage.missingEthnicityCount }}
              </div>
              <div class="text-xs text-ink/50 mt-1">个 IP 待补种族</div>
            </div>
          </div>

          <!-- heatmap: 按 gender 分 3 个 sub-grid (4 年龄行 × 6 种族列) -->
          <div class="card-base">
            <div class="text-xs text-ink/50 mb-3">分布热度 (数字 = IP 数量,空格 = 未填充)</div>
            <div class="grid md:grid-cols-3 gap-4">
              <div v-for="gender in ['FEMALE', 'MALE', 'NONBINARY']" :key="gender">
                <div class="text-xs font-medium text-ink/70 mb-2">{{ GENDER_LABEL[gender] }}</div>
                <div class="grid grid-cols-6 gap-1 text-[10px]">
                  <template v-for="age in ['CHILD', 'YOUNG', 'MIDDLE', 'ELDERLY']" :key="age">
                    <template v-for="eth in ['EAST_ASIAN', 'SOUTHEAST_ASIAN', 'SOUTH_ASIAN', 'AFRICAN', 'EUROPEAN', 'MIXED']" :key="`${gender}-${age}-${eth}`">
                      <div
                        :class="[
                          'aspect-square rounded flex flex-col items-center justify-center text-center p-0.5',
                          cellCount(gender, age, eth) > 0 ? 'bg-gold/30 text-ink' : 'bg-cream text-ink/30',
                        ]"
                        :title="`${GENDER_LABEL[gender]} · ${AGE_LABEL[age]} · ${ETHNICITY_LABEL[eth]}: ${cellCount(gender, age, eth)} 个`"
                      >
                        <div class="text-[9px] leading-none">{{ ETHNICITY_LABEL[eth].slice(0, 2) }}</div>
                        <div class="font-mono font-medium text-[11px] leading-tight">{{ cellCount(gender, age, eth) }}</div>
                      </div>
                    </template>
                  </template>
                </div>
                <!-- 列标题 -->
                <div class="grid grid-cols-6 gap-1 mt-1 text-[8px] text-ink/40 text-center">
                  <div v-for="eth in ['EAST_ASIAN', 'SOUTHEAST_ASIAN', 'SOUTH_ASIAN', 'AFRICAN', 'EUROPEAN', 'MIXED']" :key="`${gender}-label-${eth}`">
                    {{ ETHNICITY_LABEL[eth].slice(0, 1) }}
                  </div>
                </div>
              </div>
            </div>
            <!-- 行标题 (放在最下面) -->
            <div class="flex items-center gap-4 mt-3 text-[10px] text-ink/40">
              <span>行:</span>
              <span v-for="age in ['CHILD', 'YOUNG', 'MIDDLE', 'ELDERLY']" :key="age">{{ AGE_LABEL[age] }}</span>
            </div>
          </div>

          <!-- 维度分布条 -->
          <div class="grid md:grid-cols-3 gap-3 mt-3">
            <div class="card-base">
              <div class="text-xs text-ink/50 mb-2">按性别 (IP 数 / 单元格)</div>
              <div v-for="(v, g) in coverage.byGender" :key="g" class="flex items-center gap-2 text-xs mb-1">
                <span class="w-12 text-ink/60">{{ GENDER_LABEL[g] }}</span>
                <div class="flex-1 h-3 bg-cream rounded-full overflow-hidden">
                  <div class="h-full bg-gold" :style="{ width: pct(v.count) + '%' }"></div>
                </div>
                <span class="w-16 text-right font-mono text-ink/60">{{ v.count }} / {{ v.filledCells }}/{{ v.totalCells }}</span>
              </div>
            </div>
            <div class="card-base">
              <div class="text-xs text-ink/50 mb-2">按年龄 (IP 数 / 单元格)</div>
              <div v-for="(v, a) in coverage.byAgeBucket" :key="a" class="flex items-center gap-2 text-xs mb-1">
                <span class="w-12 text-ink/60">{{ AGE_LABEL[a] }}</span>
                <div class="flex-1 h-3 bg-cream rounded-full overflow-hidden">
                  <div class="h-full bg-gold" :style="{ width: pct(v.count) + '%' }"></div>
                </div>
                <span class="w-16 text-right font-mono text-ink/60">{{ v.count }} / {{ v.filledCells }}/{{ v.totalCells }}</span>
              </div>
            </div>
            <div class="card-base">
              <div class="text-xs text-ink/50 mb-2">按种族 (IP 数 / 单元格)</div>
              <div v-for="(v, e) in coverage.byEthnicity" :key="e" class="flex items-center gap-2 text-xs mb-1">
                <span class="w-16 text-ink/60">{{ ETHNICITY_LABEL[e] }}</span>
                <div class="flex-1 h-3 bg-cream rounded-full overflow-hidden">
                  <div class="h-full bg-gold" :style="{ width: pct(v.count) + '%' }"></div>
                </div>
                <span class="w-16 text-right font-mono text-ink/60">{{ v.count }} / {{ v.filledCells }}/{{ v.totalCells }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
