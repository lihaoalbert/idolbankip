<script setup lang="ts">
/**
 * 买家 brief 详情页 — /buyer/briefs/:id
 * #30.7.1 W2 #28 动态调价(3 道软护栏)
 *  - 仅 bidding 状态可加价
 *  - bumpCount < 3 (封顶)
 *  - 加价后总价 > 2x 菜单价 → 弹窗二次确认
 *  - 创作者端脱敏(后端处理)
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';
import { useCountdown } from '@/composables/useCountdown';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const auth = useAuthStore();

interface Brief {
  id: string;
  title: string;
  description: string | null;
  category: string;
  platformSet: string[];
  ipIds: string[];
  budgetMin: string;
  budgetMax: string;
  packageTier: string;
  deadlineAt: string;
  status: 'draft' | 'bidding' | 'in_progress' | 'delivered' | 'closed' | 'disputed';
  currentPrice: string | null;
  standardSkuId: string | null;
  bumpCount: number;
  bumpHistory: Array<{ at: string; fromPrice: number; toPrice: number; percent: number; by: string }> | null;
  createdAt: string;
  updatedAt: string;
}

const brief = ref<Brief | null>(null);
const loading = ref(true);
const showBumpModal = ref(false);
const bumpPercent = ref<number>(10);
const needConfirmDialog = ref<{ newPrice: number; percent: number; basePrice: number } | null>(null);
const bumping = ref(false);

const CATEGORY_LABEL: Record<string, string> = {
  ad: '数字人广告片',
  shortvideo: 'AIGC 短视频',
  livestream_clip: '直播切片',
  poster: '营销海报',
  '3d': '3D 数字人',
};
const TIER_LABEL: Record<string, string> = {
  essential: 'Essential 基础版',
  standard: 'Standard 标准版',
  premium: 'Premium 旗舰版',
};
const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  bidding: '招集中',
  in_progress: '进行中',
  delivered: '已交付',
  closed: '已关闭',
  disputed: '争议中',
};
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-ink/10 text-ink/60',
  bidding: 'bg-gold/15 text-stamp-red',
  in_progress: 'bg-stamp-red text-cream',
  delivered: 'bg-ink text-cream',
  closed: 'bg-ink/30 text-ink/60',
  disputed: 'bg-stamp-red/20 text-stamp-red',
};

// 基础价(用户视角) = 第一次 publish 时的价 = bumpHistory[0].fromPrice 或 currentPrice
const basePrice = computed(() => {
  if (!brief.value) return 0;
  const hist = brief.value.bumpHistory ?? [];
  return hist.length > 0 ? hist[0].fromPrice : Number(brief.value.currentPrice ?? 0);
});

const currentPriceNum = computed(() => Number(brief.value?.currentPrice ?? 0));
const overCap = computed(() => {
  if (!bumpPercent.value) return false;
  const projected = Math.round(currentPriceNum.value * (1 + bumpPercent.value / 100));
  return projected > basePrice.value * 2;
});

const bumpCountRemaining = computed(() => Math.max(0, 3 - (brief.value?.bumpCount ?? 0)));
const canBump = computed(() => brief.value?.status === 'bidding' && bumpCountRemaining.value > 0);

const countdown = useCountdown(() => brief.value?.deadlineAt);

onMounted(async () => {
  if (!auth.hasAnyRole(['BUYER'])) {
    toast.error('请用买家账号登录');
    router.push('/login');
    return;
  }
  await loadBrief();
});

async function loadBrief() {
  loading.value = true;
  try {
    const { data } = await apiClient.get(`/buyer/briefs/${route.params.id}`);
    brief.value = data;
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '加载失败');
    router.push('/buyer/orders');
  } finally {
    loading.value = false;
  }
}

async function doBump(confirmed = false) {
  if (!brief.value || !bumpPercent.value) return;
  bumping.value = true;
  try {
    const { data } = await apiClient.post(`/buyer/briefs/${brief.value.id}/bump`, {
      percent: bumpPercent.value,
      confirmed,
    });
    if (data.needConfirm) {
      // 弹窗二次确认
      const projected = Math.round(currentPriceNum.value * (1 + bumpPercent.value / 100));
      needConfirmDialog.value = {
        newPrice: projected,
        percent: bumpPercent.value,
        basePrice: basePrice.value,
      };
      showBumpModal.value = false;
    } else {
      toast.success(
        `已加价:¥${currentPriceNum.value} → ¥${data.brief.currentPrice} (+${bumpPercent.value}%)`,
      );
      showBumpModal.value = false;
      needConfirmDialog.value = null;
      await loadBrief();
    }
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '加价失败');
  } finally {
    bumping.value = false;
  }
}

async function closeBrief() {
  if (!brief.value) return;
  if (!confirm('确认关闭此 brief?关闭后无法恢复。')) return;
  try {
    await apiClient.post(`/buyer/briefs/${brief.value.id}/close`);
    toast.success('已关闭');
    await loadBrief();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '关闭失败');
  }
}

const formatPrice = (n: number | string) => `¥${Number(n).toLocaleString('zh-CN')}`;
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">
    <div class="max-w-4xl mx-auto px-6 py-10">
      <div class="border-b border-ink pb-6 mb-8 flex items-end justify-between">
        <div>
          <div class="catalog-no mb-2">AIGC · BRIEF · DETAIL</div>
          <h1 class="font-display text-2xl tracking-wide">{{ brief?.title || '...' }}</h1>
          <div v-if="brief" class="flex items-center gap-3 mt-2 text-xs text-ink/60">
            <span class="px-2 py-0.5" :class="STATUS_COLOR[brief.status]">
              {{ STATUS_LABEL[brief.status] }}
            </span>
            <span>{{ CATEGORY_LABEL[brief.category] }}</span>
            <span>·</span>
            <span>{{ TIER_LABEL[brief.packageTier] }}</span>
          </div>
        </div>
        <RouterLink
          to="/buyer/orders"
          class="text-xs font-mono tracking-widest uppercase text-ink/60 hover:text-gold"
        >
          ← 我的订单
        </RouterLink>
      </div>

      <div v-if="loading" class="text-center text-ink/40 py-20">加载中…</div>

      <div v-else-if="brief" class="space-y-8">
        <!-- 价格 + 加价(核心) -->
        <section class="plate p-6">
          <div class="catalog-no mb-3">PRICING · 当前价 / 菜单价</div>
          <div class="grid grid-cols-2 gap-6">
            <div>
              <div class="text-xs text-ink/50 mb-1">当前价 (currentPrice)</div>
              <div class="font-display text-3xl text-stamp-red">{{ formatPrice(brief.currentPrice ?? 0) }}</div>
            </div>
            <div>
              <div class="text-xs text-ink/50 mb-1">菜单价 (首次发布价)</div>
              <div class="font-display text-2xl text-ink/70">{{ formatPrice(basePrice) }}</div>
            </div>
          </div>
          <!-- W2 #31 倒计时 -->
          <div class="mt-4 pt-4 border-t border-line flex items-center gap-3 text-xs">
            <span class="catalog-no text-ink/40">DEADLINE</span>
            <span
              :class="[
                'font-mono text-sm',
                countdown.variant.value === 'expired' ? 'text-ink/40 line-through'
                  : countdown.variant.value === 'danger' ? 'text-stamp-red font-medium'
                  : 'text-ink/80'
              ]"
            >
              {{ countdown.label.value }}
            </span>
            <span class="text-ink/40">· {{ new Date(brief.deadlineAt).toLocaleString('zh-CN') }}</span>
          </div>
          <div class="mt-4 pt-4 border-t border-line">
            <div class="flex items-center justify-between mb-3">
              <div class="text-xs text-ink/60">
                已加价 <span class="font-mono text-stamp-red">{{ brief.bumpCount }}</span> / 3 次
                <span v-if="bumpCountRemaining > 0" class="ml-2">
                  · 剩余 <span class="font-mono text-ink">{{ bumpCountRemaining }}</span> 次
                </span>
                <span v-else class="ml-2 text-ink/40">· 已达上限</span>
              </div>
              <div v-if="canBump" class="flex gap-2">
                <button
                  @click="closeBrief"
                  class="px-4 py-2 border-0.5 border-ink/30 text-xs hover:border-ink"
                >
                  关闭 brief
                </button>
                <button
                  @click="showBumpModal = true"
                  class="px-5 py-2 bg-stamp-red text-cream text-xs font-medium tracking-widest uppercase hover:bg-ink"
                >
                  加价吸引接单 →
                </button>
              </div>
            </div>
            <div v-if="canBump" class="text-[10px] text-ink/40 leading-relaxed">
              3 道软护栏: ① 单 brief 累计加价 ≤ 3 次 ② 加价后总价超 2x 菜单价需二次确认
              ③ 创作者端只看到当前价,看不到加价幅度
            </div>
          </div>
        </section>

        <!-- 加价历史(仅买家自己可见) -->
        <section v-if="(brief.bumpHistory ?? []).length > 0" class="plate p-6">
          <div class="catalog-no mb-3">BUMP HISTORY</div>
          <div class="space-y-2">
            <div
              v-for="(h, i) in brief.bumpHistory"
              :key="i"
              class="flex items-center justify-between text-xs py-2 border-b border-line last:border-0"
            >
              <div class="text-ink/60">
                #{{ i + 1 }} · {{ new Date(h.at).toLocaleString('zh-CN') }}
              </div>
              <div>
                {{ formatPrice(h.fromPrice) }} → {{ formatPrice(h.toPrice) }}
                <span class="ml-2 text-stamp-red font-mono">+{{ h.percent }}%</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Brief 详情 -->
        <section class="plate p-6 space-y-3 text-sm">
          <div class="catalog-no mb-2">BRIEF DETAIL</div>
          <div v-if="brief.description" class="text-ink/80 whitespace-pre-line">
            {{ brief.description }}
          </div>
          <div v-else class="text-ink/40 text-xs">（无描述）</div>
          <div class="grid grid-cols-2 gap-4 pt-3 border-t border-line text-xs">
            <div>
              <div class="text-ink/40 mb-1">投放平台</div>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="p in brief.platformSet"
                  :key="p"
                  class="px-2 py-0.5 border-0.5 border-line"
                >{{ p }}</span>
              </div>
            </div>
            <div>
              <div class="text-ink/40 mb-1">截止时间</div>
              <div>{{ new Date(brief.deadlineAt).toLocaleString('zh-CN') }}</div>
            </div>
            <div>
              <div class="text-ink/40 mb-1">预算区间</div>
              <div>{{ formatPrice(brief.budgetMin) }} - {{ formatPrice(brief.budgetMax) }}</div>
            </div>
            <div>
              <div class="text-ink/40 mb-1">关联 SKU</div>
              <div class="font-mono text-[10px] text-ink/60">{{ brief.standardSkuId ?? '—' }}</div>
            </div>
          </div>
        </section>
      </div>

      <!-- 加价 modal -->
      <Teleport to="body">
        <div
          v-if="showBumpModal"
          class="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4"
          @click.self="showBumpModal = false"
        >
          <div class="bg-cream paper-grain max-w-md w-full p-8 border-0.5 border-ink shadow-soft">
            <div class="catalog-no mb-2">BUMP PRICE</div>
            <h3 class="font-display text-xl mb-4">加价吸引接单</h3>

            <div class="text-xs text-ink/60 mb-2">选择加价幅度</div>
            <div class="grid grid-cols-4 gap-2 mb-4">
              <button
                v-for="p in [10, 20, 30, 50]"
                :key="p"
                @click="bumpPercent = p"
                class="py-2 border-0.5 text-sm font-mono"
                :class="bumpPercent === p
                  ? 'border-stamp-red bg-stamp-red text-cream'
                  : 'border-line bg-surface hover:border-ink/40'"
              >
                +{{ p }}%
              </button>
            </div>

            <div class="bg-surface p-4 mb-4 text-xs space-y-1">
              <div class="flex justify-between">
                <span class="text-ink/60">当前价</span>
                <span class="font-mono">{{ formatPrice(currentPriceNum) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-ink/60">加价后</span>
                <span class="font-mono text-stamp-red font-medium">
                  {{ formatPrice(Math.round(currentPriceNum * (1 + bumpPercent / 100))) }}
                </span>
              </div>
              <div class="flex justify-between text-ink/40">
                <span>菜单价 2x 上限</span>
                <span class="font-mono">{{ formatPrice(basePrice * 2) }}</span>
              </div>
              <div v-if="overCap" class="text-stamp-red text-[10px] pt-1">
                ⚠️ 加价后超过菜单价 2x,需二次确认
              </div>
            </div>

            <div class="flex gap-2 justify-end">
              <button
                @click="showBumpModal = false"
                class="px-4 py-2 border-0.5 border-ink/30 text-xs"
              >取消</button>
              <button
                @click="doBump(false)"
                :disabled="bumping"
                class="px-5 py-2 bg-stamp-red text-cream text-xs font-medium tracking-widest uppercase hover:bg-ink disabled:opacity-50"
              >
                {{ bumping ? '处理中…' : overCap ? '继续(需确认) →' : '确认加价 →' }}
              </button>
            </div>
          </div>
        </div>

        <!-- 二次确认 dialog (3 道软护栏之二) -->
        <div
          v-if="needConfirmDialog"
          class="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4"
          @click.self="needConfirmDialog = null"
        >
          <div class="bg-cream paper-grain max-w-md w-full p-8 border-0.5 border-stamp-red shadow-soft">
            <div class="catalog-no mb-2 text-stamp-red">⚠️ HIGH PREMIUM CONFIRM</div>
            <h3 class="font-display text-xl mb-3">这是高溢价</h3>
            <p class="text-sm text-ink/80 mb-4">
              加价后总价 <span class="font-mono text-stamp-red font-medium">{{ formatPrice(needConfirmDialog.newPrice) }}</span>
              超过菜单价 2x ({{ formatPrice(needConfirmDialog.basePrice * 2) }})。
            </p>
            <p class="text-xs text-ink/60 mb-6">
              创作者端只看到总价(看不到加价幅度),平台建议谨慎加价避免被算法识别为"异常 brief"。
              确认后无法撤销,只能继续加价或关闭 brief。
            </p>
            <div class="flex gap-2 justify-end">
              <button
                @click="needConfirmDialog = null"
                class="px-4 py-2 border-0.5 border-ink/30 text-xs"
              >取消</button>
              <button
                @click="doBump(true)"
                :disabled="bumping"
                class="px-5 py-2 bg-stamp-red text-cream text-xs font-medium tracking-widest uppercase hover:bg-ink disabled:opacity-50"
              >
                {{ bumping ? '处理中…' : '我知这是高溢价,继续 →' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>
