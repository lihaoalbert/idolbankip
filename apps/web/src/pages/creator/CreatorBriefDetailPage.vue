<script setup lang="ts">
/**
 * 创作者侧 brief 详情页 — /creator/briefs/:id
 * #30.7.1 W2 #30 接入真实 API
 *  - 只读 brief(后端 getPublicById 已脱敏 bumpHistory,3 道软护栏之三)
 *  - "我要投标" 弹窗 → POST /creator/briefs/:briefId/bids
 *  - 若已报价,展示"已报价 ¥X" 状态 + 撤回入口
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
  buyerId: string;
  createdAt: string;
  updatedAt: string;
  workspace: { id: string; status: string; creatorId: string } | null;
}

interface MyBid {
  id: string;
  briefId: string;
  price: string;
  deliveryDays: number;
  proposal: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  createdAt: string;
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
const myBid = ref<MyBid | null>(null);
const loading = ref(true);
const showBidModal = ref(false);
const submitting = ref(false);
const withdrawing = ref(false);

const bidForm = ref({
  price: 0,
  deliveryDays: 7,
  proposal: '',
});

// W5 E2 — 评价 (creator → buyer)
const reviews = ref<ReviewItem[]>([]);
const reviewsLoading = ref(false);
const submittingReview = ref(false);
const myReview = ref<ReviewItem | null>(null);
const reviewForm = ref({ rating: 5, content: '', tags: '' });
const reviewFormOpen = ref(false);

const canReview = computed(
  () =>
    brief.value?.workspace?.status === 'approved' &&
    !!myBid.value &&
    myBid.value.status === 'accepted',
);
const hasReviewed = computed(() =>
  reviews.value.some((r) => r.role === 'creator_to_buyer'),
);

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
const PLATFORM_LABEL: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat: '视频号',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'IG',
  x: 'X',
  linkedin: 'LinkedIn',
  bilibili: 'B站',
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

const budgetMin = computed(() => Number(brief.value?.budgetMin ?? 0));
const budgetMax = computed(() => Number(brief.value?.budgetMax ?? 0));
const currentPriceNum = computed(() => Number(brief.value?.currentPrice ?? 0));
const isOwnBrief = computed(() => brief.value?.buyerId === auth.user?.id);
const canBid = computed(() => brief.value?.status === 'bidding' && !myBid.value && !isOwnBrief.value);

onMounted(async () => {
  if (!auth.hasAnyRole(['CREATOR'])) {
    toast.error('请用创作者账号登录');
    router.push('/login');
    return;
  }
  await Promise.all([loadBrief(), loadMyBid(), loadReviews()]);
});

async function loadBrief() {
  loading.value = true;
  try {
    const { data } = await apiClient.get(`/creator/briefs/${route.params.id}`);
    brief.value = data;
    // 默认 price = 当前价 (创作者看的是 currentPrice,3 道软护栏之三)
    if (brief.value && currentPriceNum.value > 0) {
      bidForm.value.price = currentPriceNum.value;
    }
  } catch (e: any) {
    // R10 P0-2: 区分 403(已中标/已关闭)与 404(真不存在) —
    //   后端已放宽到 bidding/in_progress/delivered/closed,403 应该没了;
    //   真 403 兜底为"已被接单"并跳 workspace;404 才回列表
    const status = e?.response?.status ?? e?.status;
    if (status === 403) {
      if (brief.value?.workspace) {
        toast.info('该 brief 已被接单,请到工作区协作');
        router.push(`/workspaces/${brief.value.workspace.id}`);
      } else {
        toast.info('该 brief 暂不可查看');
        router.push('/creator/briefs');
      }
    } else if (status === 404) {
      toast.error('brief 不存在');
      router.push('/creator/briefs');
    } else {
      toast.error(e?.response?.data?.message || '加载失败');
      router.push('/creator/briefs');
    }
  } finally {
    loading.value = false;
  }
}

async function loadMyBid() {
  try {
    const { data } = await apiClient.get(`/creator/briefs/${route.params.id}/bids/mine`);
    const items = data?.items ?? [];
    // 取该 brief 的最新 pending/accepted bid
    const found = items.find((b: any) => b.briefId === route.params.id);
    myBid.value = found ?? null;
  } catch {
    myBid.value = null;
  }
}

async function submitBid() {
  if (!brief.value) return;
  if (!bidForm.value.proposal || bidForm.value.proposal.trim().length < 10) {
    toast.error('提案至少 10 个字');
    return;
  }
  if (bidForm.value.price < budgetMin.value || bidForm.value.price > budgetMax.value) {
    toast.error(`报价必须在预算区间 ¥${budgetMin.value} - ¥${budgetMax.value}`);
    return;
  }
  submitting.value = true;
  try {
    await apiClient.post(`/creator/briefs/${brief.value.id}/bids`, {
      price: bidForm.value.price,
      deliveryDays: bidForm.value.deliveryDays,
      proposal: bidForm.value.proposal.trim(),
    });
    toast.success('已报价,等待买家选择');
    showBidModal.value = false;
    await loadMyBid();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '报价失败');
  } finally {
    submitting.value = false;
  }
}

async function withdrawBid() {
  if (!myBid.value || !brief.value) return;
  if (!confirm('确认撤回报价?撤回后可重新报价。')) return;
  withdrawing.value = true;
  try {
    await apiClient.post(`/creator/briefs/${brief.value.id}/bids/${myBid.value.id}/withdraw`);
    toast.success('已撤回');
    myBid.value = null;
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '撤回失败');
  } finally {
    withdrawing.value = false;
  }
}

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
  } catch {
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
  submittingReview.value = true;
  try {
    const tags = reviewForm.value.tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10);
    await apiClient.post(`/briefs/${brief.value.id}/reviews`, {
      role: 'creator_to_buyer',
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
    submittingReview.value = false;
  }
}

const formatPrice = (n: number | string) => `¥${Number(n).toLocaleString('zh-CN')}`;
const formatPlatforms = (arr: string[]) => (arr ?? []).map((p) => PLATFORM_LABEL[p] || p).join(' · ');
const countdown = useCountdown(() => brief.value?.deadlineAt);
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">
    <div class="max-w-4xl mx-auto px-6 py-10">
      <div class="border-b border-ink pb-6 mb-8 flex items-end justify-between">
        <div>
          <div class="catalog-no mb-2">AIGC · BRIEF · DETAIL (CREATOR)</div>
          <h1 class="font-display text-2xl tracking-wide">{{ brief?.title || '...' }}</h1>
          <div v-if="brief" class="flex items-center gap-3 mt-2 text-xs text-ink/60">
            <span class="px-2 py-0.5" :class="STATUS_COLOR[brief.status]">
              {{ STATUS_LABEL[brief.status] }}
            </span>
            <span>{{ CATEGORY_LABEL[brief.category] }}</span>
            <span>·</span>
            <span>{{ TIER_LABEL[brief.packageTier] }}</span>
            <span>·</span>
            <span class="font-mono">{{ countdown.label.value }} 截止</span>
          </div>
        </div>
        <RouterLink
          to="/creator/briefs"
          class="text-xs font-mono tracking-widest uppercase text-ink/60 hover:text-gold"
        >
          ← 浏览需求
        </RouterLink>
      </div>

      <div v-if="loading" class="text-center text-ink/40 py-20">加载中…</div>

      <div v-else-if="brief" class="space-y-8">
        <!-- 当前价 (创作者只看到 currentPrice,看不到 bumpHistory — 3 道软护栏之三) -->
        <section class="plate p-6">
          <div class="catalog-no mb-3">PRICING · 当前价 (创作者视角)</div>
          <div class="flex items-baseline gap-6">
            <div>
              <div class="text-xs text-ink/50 mb-1">当前价</div>
              <div class="font-display text-4xl text-stamp-red">{{ formatPrice(currentPriceNum) }}</div>
            </div>
            <div v-if="budgetMax > currentPriceNum" class="text-xs text-ink/50">
              预算区间 {{ formatPrice(budgetMin) }} - {{ formatPrice(budgetMax) }}
            </div>
          </div>
          <div class="mt-4 pt-4 border-t border-line text-[10px] text-ink/40 leading-relaxed">
            平台已脱敏 bumpHistory(看不到买家加价历史),你看到的当前价就是你能报的最高锚点。
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
              <div class="font-mono">{{ formatPlatforms(brief.platformSet) || '—' }}</div>
            </div>
            <div>
              <div class="text-ink/40 mb-1">截止时间</div>
              <div>{{ new Date(brief.deadlineAt).toLocaleString('zh-CN') }}</div>
            </div>
            <div>
              <div class="text-ink/40 mb-1">预算区间</div>
              <div>{{ formatPrice(budgetMin) }} - {{ formatPrice(budgetMax) }}</div>
            </div>
            <div>
              <div class="text-ink/40 mb-1">SKU 标识</div>
              <div class="font-mono text-[10px] text-ink/60">{{ brief.standardSkuId ?? '—' }}</div>
            </div>
          </div>
        </section>

        <!-- W5 E2 — 评价 (creator → buyer, 仅 workspace.approved + 我的 bid 是 accepted) -->
        <section class="plate p-6">
          <div class="flex items-center justify-between mb-3">
            <div class="catalog-no">REVIEW · 双向评价 · {{ reviews.length }}</div>
            <span v-if="canReview && !hasReviewed" class="text-[10px] text-stamp-red">
              订单已结案,可对买家评价
            </span>
            <span v-else-if="hasReviewed" class="text-[10px] text-ink/50">已评价</span>
            <span v-else class="text-[10px] text-ink/40">订单结束后开放评价</span>
          </div>

          <div v-if="reviewsLoading" class="text-center text-ink/40 py-6 text-xs">加载评价中…</div>

          <div v-else-if="reviews.length === 0" class="text-center text-ink/40 py-6 text-xs">
            暂无评价
          </div>

          <div v-else class="space-y-3">
            <div v-for="r in reviews" :key="r.id" class="border-0.5 border-line p-4 bg-surface/30">
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
                <div class="text-sm font-mono">
                  <span v-for="i in 5" :key="i" :class="i <= r.rating ? 'text-stamp-red' : 'text-ink/15'">★</span>
                </div>
              </div>
              <div class="text-xs text-ink/80 leading-relaxed mb-2 whitespace-pre-line">{{ r.content }}</div>
              <div v-if="r.tags && r.tags.length" class="flex flex-wrap gap-1">
                <span v-for="t in r.tags" :key="t" class="text-[10px] px-2 py-0.5 bg-ink/5 text-ink/60">
                  #{{ t }}
                </span>
              </div>
            </div>
          </div>

          <div
            v-if="canReview && !hasReviewed && !reviewFormOpen"
            class="mt-4 pt-4 border-t border-line"
          >
            <button
              @click="reviewFormOpen = true"
              class="w-full py-3 bg-stamp-red text-cream text-xs font-medium tracking-widest uppercase hover:bg-ink"
            >
              评价买家 →
            </button>
          </div>

          <div v-if="reviewFormOpen" class="mt-4 pt-4 border-t border-line space-y-3">
            <div>
              <div class="text-xs text-ink/60 mb-2">评分</div>
              <div class="flex gap-2">
                <button
                  v-for="n in [1, 2, 3, 4, 5]"
                  :key="n"
                  @click="reviewForm.rating = n"
                  class="text-2xl"
                  :class="n <= reviewForm.rating ? 'text-stamp-red' : 'text-ink/15 hover:text-ink/40'"
                >
                  ★
                </button>
              </div>
            </div>
            <div>
              <div class="text-xs text-ink/60 mb-1">评价内容 (≥ 5 字)</div>
              <textarea
                v-model="reviewForm.content"
                rows="4"
                maxlength="1000"
                placeholder="聊聊合作感受,例如清晰度 / 反馈响应 / 预算合理性等"
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
                placeholder="如:清晰,预算合理,响应快"
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
                :disabled="submittingReview"
                class="px-5 py-2 bg-stamp-red text-cream text-xs font-medium tracking-widest uppercase hover:bg-ink disabled:opacity-50"
              >
                {{ submittingReview ? '提交中…' : '提交评价 →' }}
              </button>
            </div>
          </div>
        </section>

        <!-- 报价 CTA 区 -->
        <section class="plate p-6 border-0.5 border-gold/40">
          <div class="catalog-no mb-3 text-gold">ACTION · 报价 / 已报价状态</div>

          <!-- 已报价 -->
          <div v-if="myBid" class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-baseline gap-4">
                <div>
                  <div class="text-xs text-ink/50 mb-1">你已报价</div>
                  <div class="font-display text-3xl text-stamp-red">{{ formatPrice(myBid.price) }}</div>
                </div>
                <div class="text-xs text-ink/60">
                  <div>{{ myBid.deliveryDays }} 天交付</div>
                  <div class="text-ink/40">{{ new Date(myBid.createdAt).toLocaleString('zh-CN') }}</div>
                </div>
              </div>
              <span
                :class="[
                  'px-3 py-1 text-xs',
                  myBid.status === 'pending' ? 'bg-gold/15 text-stamp-red'
                    : myBid.status === 'accepted' ? 'bg-success/10 text-success'
                    : 'bg-ink/10 text-ink/60'
                ]"
              >
                {{ myBid.status === 'pending' ? '等待买家选择' : myBid.status === 'accepted' ? '已中标' : myBid.status === 'rejected' ? '未中标' : '已撤回' }}
              </span>
            </div>
            <details class="text-xs text-ink/60">
              <summary class="cursor-pointer hover:text-ink">查看我的提案</summary>
              <p class="mt-2 p-3 bg-surface border-0.5 border-line whitespace-pre-line">{{ myBid.proposal }}</p>
            </details>
            <div v-if="myBid.status === 'pending'" class="pt-3 border-t border-line">
              <button
                @click="withdrawBid"
                :disabled="withdrawing"
                class="px-4 py-2 border-0.5 border-ink/30 text-xs hover:border-ink disabled:opacity-50"
              >
                {{ withdrawing ? '处理中…' : '撤回报价' }}
              </button>
            </div>
          </div>

          <!-- 自己的 brief (创作者+买家双角色时才会进入;只有 buyer 角色才显示跳转入口) -->
          <div v-else-if="isOwnBrief" class="text-center py-4">
            <div class="text-xs text-ink/50">这是你自己发的需求</div>
            <RouterLink
              v-if="auth.hasAnyRole(['BUYER'])"
              to="/orders"
              class="inline-block mt-3 px-4 py-2 border-0.5 border-ink/30 text-xs hover:border-ink"
            >
              前往买家工作台 →
            </RouterLink>
          </div>

          <!-- 不可接单 -->
          <div v-else-if="brief.status !== 'bidding'" class="text-center py-4 text-xs text-ink/40">
            该 brief 状态为 {{ STATUS_LABEL[brief.status] }},暂不可报价
          </div>

          <!-- 可报价 -->
          <div v-else class="text-center py-2">
            <p class="text-xs text-ink/60 mb-3">
              报价区间 {{ formatPrice(budgetMin) }} - {{ formatPrice(budgetMax) }},当前价 {{ formatPrice(currentPriceNum) }}
            </p>
            <button
              @click="showBidModal = true"
              class="px-6 py-3 bg-stamp-red text-cream text-sm font-medium tracking-widest uppercase hover:bg-ink"
            >
              我要投标 →
            </button>
          </div>
        </section>
      </div>

      <!-- 报价 modal -->
      <Teleport to="body">
        <div
          v-if="showBidModal && brief"
          class="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4"
          @click.self="showBidModal = false"
        >
          <div class="bg-cream paper-grain max-w-md w-full p-8 border-0.5 border-ink shadow-soft">
            <div class="catalog-no mb-2">SUBMIT BID</div>
            <h3 class="font-display text-xl mb-4">对「{{ brief.title }}」报价</h3>

            <div class="space-y-4">
              <div>
                <label class="text-xs text-ink/60 block mb-1">报价 (¥)</label>
                <input
                  v-model.number="bidForm.price"
                  type="number"
                  :min="budgetMin"
                  :max="budgetMax"
                  class="w-full px-3 py-2 border-0.5 border-line bg-surface text-sm font-mono"
                />
                <div class="text-[10px] text-ink/40 mt-1">
                  预算区间: {{ formatPrice(budgetMin) }} - {{ formatPrice(budgetMax) }}
                </div>
              </div>

              <div>
                <label class="text-xs text-ink/60 block mb-1">交付天数</label>
                <input
                  v-model.number="bidForm.deliveryDays"
                  type="number"
                  min="1"
                  max="90"
                  class="w-full px-3 py-2 border-0.5 border-line bg-surface text-sm font-mono"
                />
              </div>

              <div>
                <label class="text-xs text-ink/60 block mb-1">提案 (10-2000 字)</label>
                <textarea
                  v-model="bidForm.proposal"
                  rows="4"
                  maxlength="2000"
                  class="w-full px-3 py-2 border-0.5 border-line bg-surface text-sm"
                  placeholder="说明你的方案、参考作品、为什么你能完成这个 brief..."
                ></textarea>
                <div class="text-[10px] text-ink/40 mt-1 text-right">
                  {{ bidForm.proposal.length }} / 2000
                </div>
              </div>
            </div>

            <div class="flex gap-2 justify-end mt-6">
              <button
                @click="showBidModal = false"
                class="px-4 py-2 border-0.5 border-ink/30 text-xs"
              >取消</button>
              <button
                @click="submitBid"
                :disabled="submitting"
                class="px-5 py-2 bg-stamp-red text-cream text-xs font-medium tracking-widest uppercase hover:bg-ink disabled:opacity-50"
              >
                {{ submitting ? '提交中…' : '提交报价 →' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>