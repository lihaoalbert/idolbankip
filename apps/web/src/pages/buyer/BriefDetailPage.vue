<script setup lang="ts">
/**
 * 买家 brief 详情页 — /buyer/briefs/:id
 * #30.7.1 W2 #28 动态调价(3 道软护栏)
 *  - 仅 bidding 状态可加价
 *  - bumpCount < 3 (封顶)
 *  - 加价后总价 > 2x 菜单价 → 弹窗二次确认
 *  - 创作者端脱敏(后端处理)
 *
 * #30.7.3 W2 #30 漏的 bid 列表 + accept 按钮
 *  - bidding 状态显示所有报价(按价格升序)
 *  - 接受/拒绝仅 pending 状态可点
 *  - accept 后:brief → in_progress + 创作者获得 workspace
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';
import { useCountdown } from '@/composables/useCountdown';
import CreditScoreBadge from '@/components/CreditScoreBadge.vue';

interface BidCreatorProfile {
  level: string;
  ratingAvg: number | null;
  completedOrders: number;
  responseRate: number | null;
}

interface BidCreator {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  creatorProfile: BidCreatorProfile | null;
}

interface Bid {
  id: string;
  briefId: string;
  creatorId: string;
  price: string;
  message: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  createdAt: string;
  acceptedAt: string | null;
  creator: BidCreator;
}

interface BidListResponse {
  items: Bid[];
  total: number;
}

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
  workspace: { id: string; status: string; creatorId: string } | null;
}

interface ReviewItem {
  id: string;
  briefId: string;
  fromUserId: string;
  toUserId: string;
  role: 'buyer_to_creator' | 'creator_to_buyer';
  rating: number;
  content: string;
  tags: string[] | null;
  createdAt: string;
  from?: { id: string; displayName: string; avatarUrl: string | null };
}

const brief = ref<Brief | null>(null);
const loading = ref(true);
const showBumpModal = ref(false);
const bumpPercent = ref<number>(10);
const needConfirmDialog = ref<{ newPrice: number; percent: number; basePrice: number } | null>(null);
const bumping = ref(false);

// W2 #30 bid 列表 + accept/reject
const bids = ref<Bid[]>([]);
const bidsLoading = ref(false);
const actingBidId = ref<string | null>(null);

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
  await loadBids();
  await loadReviews();
});

async function loadBrief() {
  loading.value = true;
  try {
    const { data } = await apiClient.get(`/buyer/briefs/${route.params.id}`);
    brief.value = data;
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '加载失败');
    // R9.4: 全站统一 /orders, 之前 /buyer/orders 404
    router.push('/orders');
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

// W2 #30 — bid 列表(按价格升序)
async function loadBids() {
  if (!brief.value) return;
  bidsLoading.value = true;
  try {
    const { data } = await apiClient.get<BidListResponse>(
      `/buyer/briefs/${brief.value.id}/bids`,
    );
    bids.value = data.items;
  } catch (e: any) {
    // 静默失败:新 brief 无 bid 时也会报,不影响主流程
    bids.value = [];
  } finally {
    bidsLoading.value = false;
  }
}

async function acceptBid(bid: Bid) {
  if (!brief.value) return;
  if (!confirm(`确认接受 ${bid.creator.displayName} 的报价 ¥${Number(bid.price).toLocaleString('zh-CN')}?其他报价将自动拒绝。`)) return;
  actingBidId.value = bid.id;
  try {
    const { data } = await apiClient.post<{ workspaceId: string }>(
      `/buyer/briefs/${brief.value.id}/bids/${bid.id}/accept`,
    );
    toast.success('已中标,跳转到工作台');
    if (data.workspaceId) {
      router.push({ name: 'workspace-detail', params: { id: data.workspaceId } });
      return;
    }
    await Promise.all([loadBrief(), loadBids()]);
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '接受失败');
  } finally {
    actingBidId.value = null;
  }
}

async function rejectBid(bid: Bid) {
  if (!brief.value) return;
  if (!confirm(`确认拒绝 ${bid.creator.displayName} 的报价?`)) return;
  actingBidId.value = bid.id;
  try {
    await apiClient.post(`/buyer/briefs/${brief.value.id}/bids/${bid.id}/reject`);
    toast.success('已拒绝');
    await loadBids();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '拒绝失败');
  } finally {
    actingBidId.value = null;
  }
}

const formatPrice = (n: number | string) => `¥${Number(n).toLocaleString('zh-CN')}`;

// W5 E2 — 评价 (buyer → creator)
const reviews = ref<ReviewItem[]>([]);
const reviewsLoading = ref(false);
const submitting = ref(false);
const myReview = ref<ReviewItem | null>(null);
const reviewForm = ref({ rating: 5, content: '', tags: '' });
const reviewFormOpen = ref(false);

const canReview = computed(() => brief.value?.workspace?.status === 'approved');
const hasReviewed = computed(() => reviews.value.some((r) => r.role === 'buyer_to_creator'));

async function loadReviews() {
  if (!brief.value) return;
  reviewsLoading.value = true;
  try {
    const { data } = await apiClient.get<{ items: ReviewItem[] }>(
      `/briefs/${brief.value.id}/reviews`,
    );
    reviews.value = data.items;
    const mine = data.items.find((r) => r.fromUserId === auth.user?.id);
    myReview.value = mine ?? null;
  } catch (e: any) {
    reviews.value = [];
  } finally {
    reviewsLoading.value = false;
  }
}

async function submitReview() {
  if (!brief.value) return;
  if (!reviewForm.value.content || reviewForm.value.content.length < 5) {
    toast.error('评价至少 5 字');
    return;
  }
  submitting.value = true;
  try {
    const tags = reviewForm.value.tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10);
    await apiClient.post(`/briefs/${brief.value.id}/reviews`, {
      role: 'buyer_to_creator',
      rating: reviewForm.value.rating,
      content: reviewForm.value.content,
      tags,
    });
    toast.success('评价已提交');
    reviewFormOpen.value = false;
    reviewForm.value = { rating: 5, content: '', tags: '' };
    await loadReviews();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '提交失败');
  } finally {
    submitting.value = false;
  }
}
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
          to="/orders"
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

        <!-- R10 P0-1: 中标后工作区入口 — 之前数据已就绪 (brief.workspace),
          但模板没消费,中标后买家无 workspace 入口,核心业务流断裂 -->
        <section v-if="brief.status === 'in_progress' || brief.status === 'delivered'" class="plate p-6 border-stamp-red/30">
          <div class="catalog-no mb-3 text-stamp-red">WORKSPACE · 协作中</div>
          <div v-if="brief.workspace" class="flex items-center justify-between gap-4">
            <div>
              <div class="text-xs text-ink/60 mb-1">
                {{ brief.status === 'in_progress' ? '订单进行中,创作者已进入工作区' : '创作者已交付,等待你验收' }}
              </div>
              <div class="text-[10px] text-ink/40 font-mono">
                workspace · {{ brief.workspace.id.slice(-12) }} · {{ brief.workspace.status }}
              </div>
            </div>
            <RouterLink
              :to="`/workspaces/${brief.workspace.id}`"
              class="inline-block px-5 py-2.5 bg-ink text-cream text-xs font-medium tracking-widest uppercase hover:bg-stamp-red shrink-0"
            >
              {{ brief.status === 'in_progress' ? '进入工作区 →' : '去验收 →' }}
            </RouterLink>
          </div>
          <div v-else class="text-xs text-ink/50">
            工作区尚未创建(等待创作者开启协作)
          </div>
        </section>

        <!-- W2 #30 — 创作者报价(按价格升序) -->
        <section class="plate p-6">
          <div class="flex items-center justify-between mb-3">
            <div class="catalog-no">CREATOR BIDS · {{ bids.length }}</div>
            <span v-if="brief.status === 'in_progress'" class="text-xs text-ink/50">
              订单进行中,不再接受报价
            </span>
            <span v-else-if="brief.status === 'closed'" class="text-xs text-ink/50">
              brief 已关闭
            </span>
            <span v-else-if="brief.status === 'delivered'" class="text-xs text-ink/50">
              订单已交付
            </span>
          </div>

          <div v-if="bidsLoading" class="text-center text-ink/40 py-6 text-xs">加载报价中…</div>

          <div v-else-if="!bids.length" class="text-center text-ink/40 py-6 text-xs">
            暂无报价 · 创作者会在招集中持续看到这条 brief
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="(b, idx) in bids"
              :key="b.id"
              class="border-0.5 border-line p-4 bg-surface/30"
              :class="{
                'border-stamp-red bg-stamp-red/5': b.status === 'accepted',
                'border-ink/10 opacity-60': b.status === 'rejected' || b.status === 'withdrawn',
              }"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-3 flex-1 min-w-0">
                  <!-- 排名标 -->
                  <div
                    class="font-display text-2xl w-10 text-center shrink-0"
                    :class="idx === 0 ? 'text-stamp-red' : 'text-ink/30'"
                  >
                    #{{ idx + 1 }}
                  </div>
                  <!-- 创作者头像 + 信息 -->
                  <img
                    v-if="b.creator.avatarUrl"
                    :src="b.creator.avatarUrl"
                    :alt="b.creator.displayName"
                    class="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                  <div
                    v-else
                    class="w-10 h-10 rounded-full bg-ink/10 flex items-center justify-center text-xs text-ink/40 shrink-0"
                  >
                    {{ b.creator.displayName.charAt(0) }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-medium text-sm">{{ b.creator.displayName }}</span>
                      <span
                        v-if="b.creator.creatorProfile"
                        class="text-[10px] px-1.5 py-0.5 bg-ink/5 text-ink/60 font-mono"
                      >
                        {{ b.creator.creatorProfile.level }}
                      </span>
                      <span
                        v-if="b.status === 'accepted'"
                        class="text-[10px] px-1.5 py-0.5 bg-stamp-red text-cream font-mono"
                      >
                        已中标
                      </span>
                      <span
                        v-else-if="b.status === 'rejected'"
                        class="text-[10px] px-1.5 py-0.5 bg-ink/10 text-ink/50"
                      >
                        已拒绝
                      </span>
                      <span
                        v-else-if="b.status === 'withdrawn'"
                        class="text-[10px] px-1.5 py-0.5 bg-ink/10 text-ink/50"
                      >
                        已撤回
                      </span>
                    </div>
                    <div v-if="b.creator.creatorProfile" class="text-[10px] text-ink/50 mb-2 flex gap-3">
                      <span v-if="b.creator.creatorProfile.ratingAvg !== null">
                        ⭐ {{ b.creator.creatorProfile.ratingAvg.toFixed(2) }}
                      </span>
                      <span>
                        成交 {{ b.creator.creatorProfile.completedOrders }} 单
                      </span>
                      <span v-if="b.creator.creatorProfile.responseRate !== null">
                        响应率 {{ Math.round(b.creator.creatorProfile.responseRate * 100) }}%
                      </span>
                    </div>
                    <!-- W5 E3 — 信用分 (实时计算, 5min cache) -->
                    <CreditScoreBadge :user-id="b.creator.id" as-role="creator" compact class="mt-1" />
                    <div v-if="b.message" class="text-xs text-ink/70 whitespace-pre-line leading-relaxed">
                      {{ b.message }}
                    </div>
                    <div class="text-[10px] text-ink/40 mt-2">
                      {{ new Date(b.createdAt).toLocaleString('zh-CN') }}
                    </div>
                  </div>
                </div>

                <!-- 报价 + 操作 -->
                <div class="text-right shrink-0">
                  <div class="font-display text-2xl text-stamp-red mb-2 tabular-nums">
                    {{ formatPrice(b.price) }}
                  </div>
                  <div class="flex flex-col gap-1">
                    <button
                      v-if="b.status === 'pending' && brief.status === 'bidding'"
                      @click="acceptBid(b)"
                      :disabled="actingBidId === b.id"
                      class="px-4 py-1.5 bg-stamp-red text-cream text-[11px] tracking-widest uppercase hover:bg-ink disabled:opacity-50"
                    >
                      {{ actingBidId === b.id ? '处理中…' : '接受报价' }}
                    </button>
                    <button
                      v-if="b.status === 'pending' && brief.status === 'bidding'"
                      @click="rejectBid(b)"
                      :disabled="actingBidId === b.id"
                      class="px-4 py-1.5 border-0.5 border-ink/30 text-[11px] hover:border-ink disabled:opacity-50"
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- W5 E2 — 评价 (buyer → creator, 仅 workspace.approved 后才可评) -->
        <section class="plate p-6">
          <div class="flex items-center justify-between mb-3">
            <div class="catalog-no">REVIEW · 双向评价 · {{ reviews.length }}</div>
            <span v-if="canReview && !hasReviewed" class="text-[10px] text-stamp-red">
              订单已结案,可对创作者评价
            </span>
            <span v-else-if="hasReviewed" class="text-[10px] text-ink/50">
              已评价
            </span>
            <span v-else class="text-[10px] text-ink/40">
              订单结束后开放评价
            </span>
          </div>

          <div v-if="reviewsLoading" class="text-center text-ink/40 py-6 text-xs">加载评价中…</div>

          <div v-else-if="reviews.length === 0" class="text-center text-ink/40 py-6 text-xs">
            暂无评价
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="r in reviews"
              :key="r.id"
              class="border-0.5 border-line p-4 bg-surface/30"
            >
              <div class="flex items-start justify-between gap-3 mb-2">
                <div class="flex items-center gap-2">
                  <img
                    v-if="r.from?.avatarUrl"
                    :src="r.from.avatarUrl"
                    :alt="r.from.displayName"
                    class="w-8 h-8 rounded-full object-cover"
                  />
                  <div
                    v-else
                    class="w-8 h-8 rounded-full bg-ink/10 flex items-center justify-center text-xs text-ink/40"
                  >
                    {{ r.from?.displayName?.charAt(0) || '?' }}
                  </div>
                  <div>
                    <div class="text-xs font-medium">{{ r.from?.displayName || r.fromUserId }}</div>
                    <div class="text-[10px] text-ink/40">
                      {{ r.role === 'buyer_to_creator' ? '买家评价创作者' : '创作者评价买家' }}
                      · {{ new Date(r.createdAt).toLocaleString('zh-CN') }}
                    </div>
                  </div>
                </div>
                <div class="text-stamp-red text-sm font-mono">
                  <span v-for="i in 5" :key="i" :class="i <= r.rating ? 'text-stamp-red' : 'text-ink/15'">★</span>
                </div>
              </div>
              <div class="text-xs text-ink/80 leading-relaxed mb-2 whitespace-pre-line">{{ r.content }}</div>
              <div v-if="r.tags && r.tags.length" class="flex flex-wrap gap-1">
                <span
                  v-for="t in r.tags"
                  :key="t"
                  class="text-[10px] px-2 py-0.5 bg-ink/5 text-ink/60"
                >#{{ t }}</span>
              </div>
            </div>
          </div>

          <!-- 提交评价 (仅买家本人 + 已结案 + 未评过) -->
          <div
            v-if="canReview && !hasReviewed && !reviewFormOpen"
            class="mt-4 pt-4 border-t border-line"
          >
            <button
              @click="reviewFormOpen = true"
              class="w-full py-3 bg-stamp-red text-cream text-xs font-medium tracking-widest uppercase hover:bg-ink"
            >
              评价创作者 →
            </button>
          </div>

          <div
            v-if="reviewFormOpen"
            class="mt-4 pt-4 border-t border-line space-y-3"
          >
            <div>
              <div class="text-xs text-ink/60 mb-2">评分</div>
              <div class="flex gap-2">
                <button
                  v-for="n in [1, 2, 3, 4, 5]"
                  :key="n"
                  @click="reviewForm.rating = n"
                  class="text-2xl"
                  :class="n <= reviewForm.rating ? 'text-stamp-red' : 'text-ink/15 hover:text-ink/40'"
                >★</button>
              </div>
            </div>
            <div>
              <div class="text-xs text-ink/60 mb-1">评价内容 (≥ 5 字)</div>
              <textarea
                v-model="reviewForm.content"
                rows="4"
                maxlength="1000"
                placeholder="说说合作感受,例如交付质量 / 沟通态度 / 时间观念等"
                class="w-full px-3 py-2 border-0.5 border-line bg-cream text-xs focus:outline-none focus:border-stamp-red"
              />
              <div class="text-[10px] text-ink/40 mt-1 text-right">
                {{ reviewForm.content.length }} / 1000
              </div>
            </div>
            <div>
              <div class="text-xs text-ink/60 mb-1">标签 (逗号分隔,最多 10 个)</div>
              <input
                v-model="reviewForm.tags"
                placeholder="如:守时,专业,有创意"
                class="w-full px-3 py-2 border-0.5 border-line bg-cream text-xs focus:outline-none focus:border-stamp-red"
              />
            </div>
            <div class="flex gap-2 justify-end">
              <button
                @click="reviewFormOpen = false"
                class="px-4 py-2 border-0.5 border-ink/30 text-xs"
              >取消</button>
              <button
                @click="submitReview"
                :disabled="submitting"
                class="px-5 py-2 bg-stamp-red text-cream text-xs font-medium tracking-widest uppercase hover:bg-ink disabled:opacity-50"
              >
                {{ submitting ? '提交中…' : '提交评价 →' }}
              </button>
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
