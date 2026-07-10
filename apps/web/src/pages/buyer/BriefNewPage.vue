<script setup lang="ts">
/**
 * 买家发包页 — /buyer/brief/new
 * #30.7.1 AIGC 众包
 * W1 静态骨架: UI 完成,后端接 stub
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const toast = useToast();
const auth = useAuthStore();

const CATEGORIES = [
  { value: 'ad', label: '数字人广告片', desc: '30s / 60s 数字人出镜广告' },
  { value: 'shortvideo', label: 'AIGC 短视频', desc: '抖音 / 视频号 / TikTok' },
  { value: 'livestream_clip', label: '直播切片', desc: '直播录像 + AI 二剪' },
  { value: 'poster', label: '营销海报', desc: '主视觉 / banner / 小红书' },
  { value: '3d', label: '3D 数字人', desc: 'Live2D / 3D 角色定制' },
];

const CATEGORY_LABELS: Record<string, string> = {
  ad: '数字人广告片',
  shortvideo: 'AIGC 短视频',
  livestream_clip: '直播切片',
  poster: '营销海报',
  '3d': '3D 数字人',
};

const PLATFORMS = [
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'wechat', label: '视频号' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'x', label: 'X(Twitter)' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'bilibili', label: 'B站' },
];

const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.value, p.label]),
);

const PACKAGES = [
  {
    value: 'essential',
    label: 'Essential 基础版',
    priceRange: '¥700 - ¥1,000',
    desc: '1 条 30s 视频 / 1 平台 / 1 个 IP',
  },
  {
    value: 'standard',
    label: 'Standard 标准版',
    priceRange: '¥1,400 - ¥2,000',
    desc: '5 条 30s / 3 平台 / 2 个 IP + 多比例适配',
  },
  {
    value: 'premium',
    label: 'Premium 旗舰版',
    priceRange: '¥2,500 - ¥3,500',
    desc: '10 条 + 9 平台 + IP 二次授权 + 数据看板',
  },
];

const PACKAGE_LABELS: Record<string, string> = Object.fromEntries(
  PACKAGES.map((p) => [p.value, p.label]),
);

const form = ref({
  title: '',
  description: '',
  category: 'shortvideo',
  platformSet: [] as string[],
  ipIds: [] as string[],
  budgetMin: 1400,
  budgetMax: 2000,
  packageTier: 'standard',
  deadlineAt: '',
});

const myIPs = ref<Array<{ id: string; code: string; displayName: string; thumbnailUrl?: string }>>([]);
const submitting = ref(false);

// 选 platform 自动调整套餐预算参考
function onCategoryChange() {
  if (form.value.category === 'ad') {
    form.value.budgetMin = 2500;
    form.value.budgetMax = 3500;
    form.value.packageTier = 'premium';
  } else if (form.value.category === '3d') {
    form.value.budgetMin = 2500;
    form.value.budgetMax = 3500;
    form.value.packageTier = 'premium';
  } else if (form.value.category === 'poster') {
    form.value.budgetMin = 700;
    form.value.budgetMax = 1000;
    form.value.packageTier = 'essential';
  }
}

function togglePlatform(p: string) {
  const i = form.value.platformSet.indexOf(p);
  if (i >= 0) form.value.platformSet.splice(i, 1);
  else form.value.platformSet.push(p);
}

function toggleIp(id: string) {
  const i = form.value.ipIds.indexOf(id);
  if (i >= 0) form.value.ipIds.splice(i, 1);
  else form.value.ipIds.push(id);
}

const deadlineMinDate = computed(() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 16);
});

// #30.7.1 W2 #28 — AI 拆解显式按钮(非自动触发)
const aiDecomposing = ref(false);
const aiResult = ref<{
  declaredCategory?: string;
  suggestedPlatforms?: string[];
  suggestedTier?: string;
  checklistHint?: string;
} | null>(null);

// W5 E1 — AI 3 档报价推荐
interface PricingTier {
  price: number;
  rationale: string;
}
interface PricingEstimate {
  essential: PricingTier;
  standard: PricingTier;
  premium: PricingTier;
  recommend: 'essential' | 'standard' | 'premium';
  reasoning: string;
}
const aiEstimating = ref(false);
const aiPricing = ref<PricingEstimate | null>(null);

async function aiEstimate() {
  if (!form.value.title) {
    toast.error('请先填标题');
    return;
  }
  aiEstimating.value = true;
  try {
    // 1) 先拆解拿 spec (复用 aiResult 里的归类)
    const declaredCategory = aiResult.value?.declaredCategory ?? form.value.category;
    const { data: specData } = await apiClient.post('/pricing/decompose', {
      title: form.value.title,
      description: form.value.description || undefined,
      declaredCategory,
    });
    // 2) 拿当前预算作为 hint
    const budgetHint =
      form.value.budgetMin && form.value.budgetMax
        ? { min: Number(form.value.budgetMin), max: Number(form.value.budgetMax) }
        : undefined;
    // 3) 调 /pricing/estimate
    const { data: estData } = await apiClient.post('/pricing/estimate', {
      spec: specData?.spec ?? {},
      budgetHint,
    });
    aiPricing.value = estData?.pricing ?? null;
    if (aiPricing.value) {
      toast.success(`AI 推荐 ${tierLabel(aiPricing.value.recommend)} 套餐 ¥${aiPricing.value[aiPricing.value.recommend].price}`);
    }
  } catch (e: any) {
    toast.error(e?.response?.data?.message || 'AI 估价失败');
  } finally {
    aiEstimating.value = false;
  }
}

function tierLabel(tier: 'essential' | 'standard' | 'premium' | string): string {
  return { essential: '精简', standard: '标准', premium: '旗舰' }[tier] ?? tier;
}

function applyRecommendedTier() {
  if (!aiPricing.value) return;
  const tier = aiPricing.value.recommend;
  form.value.packageTier = tier;
  // 同步预算范围到推荐档位
  const t = aiPricing.value[tier];
  if (t?.price) {
    form.value.budgetMin = Math.max(100, Math.round(t.price * 0.8));
    form.value.budgetMax = Math.round(t.price * 1.2);
  }
  toast.success(`已套用 ${tierLabel(tier)} 套餐 + 预算 ¥${form.value.budgetMin}-${form.value.budgetMax}`);
}
async function aiDecompose() {
  if (!form.value.title) {
    toast.error('请先填标题');
    return;
  }
  aiDecomposing.value = true;
  try {
    // 1) 品类识别
    const { data: catData } = await apiClient.post('/pricing/categorize', {
      title: form.value.title,
      description: form.value.description || undefined,
    });
    const cat = catData?.result?.category ?? catData?.result;
    const suggestedPlatforms: string[] = catData?.result?.platforms ?? [];

    // 2) 任务包拆解(spec)
    const { data: specData } = await apiClient.post('/pricing/decompose', {
      title: form.value.title,
      description: form.value.description || undefined,
      declaredCategory: cat,
    });

    // 3) 简单合并建议(不动表单,只显示"建议",用户可手动采纳)
    const tierMap: Record<string, string> = {
      ad: 'premium', shortvideo: 'standard', livestream_clip: 'standard',
      poster: 'essential', '3d': 'premium',
    };
    aiResult.value = {
      declaredCategory: cat,
      suggestedPlatforms: suggestedPlatforms.length ? suggestedPlatforms : undefined,
      suggestedTier: tierMap[cat],
      checklistHint: specData?.spec?.acceptanceHint ?? specData?.spec?.checklistHint,
    };

    // 4) 一键填表(用户授权后)
    if (cat && CATEGORIES.find((c) => c.value === cat)) {
      form.value.category = cat;
      onCategoryChange();
    }
    if (suggestedPlatforms.length) {
      // 只填入还没选的平台
      for (const p of suggestedPlatforms) {
        if (!form.value.platformSet.includes(p)) {
          form.value.platformSet.push(p);
        }
      }
    }
    toast.success('AI 拆解完成 — 已自动填入品类/平台,请确认');
  } catch (e: any) {
    toast.error(e?.response?.data?.message || 'AI 拆解失败');
  } finally {
    aiDecomposing.value = false;
  }
}

onMounted(async () => {
  if (!auth.hasAnyRole(['BUYER'])) {
    toast.error('请用买家账号登录');
    router.push('/login');
    return;
  }
  // 加载自己已有的 IP(用于选择)
  try {
    const { data } = await apiClient.get('/ips/mine/list');
    myIPs.value = data?.items ?? [];
  } catch {
    /* 静默 */
  }
  // 默认 deadline 7 天后
  const d = new Date();
  d.setDate(d.getDate() + 7);
  form.value.deadlineAt = d.toISOString().slice(0, 16);
});

async function submit(action: 'draft' | 'publish') {
  if (form.value.title.length < 5) {
    toast.error('标题至少 5 个字');
    return;
  }
  if (form.value.platformSet.length === 0) {
    toast.error('至少选 1 个平台');
    return;
  }
  if (!form.value.deadlineAt) {
    toast.error('请选择截止时间');
    return;
  }

  submitting.value = true;
  try {
    const { data } = await apiClient.post('/buyer/briefs', {
      title: form.value.title,
      description: form.value.description || undefined,
      category: form.value.category,
      platformSet: form.value.platformSet,
      ipIds: form.value.ipIds,
      budgetMin: Number(form.value.budgetMin),
      budgetMax: Number(form.value.budgetMax),
      packageTier: form.value.packageTier,
      deadlineAt: new Date(form.value.deadlineAt).toISOString(),
    });
    if (action === 'publish' && data?.brief?.id) {
      await apiClient.post(`/buyer/briefs/${data.brief.id}/publish`);
      toast.success('已发布,创作者可在 24h 内报价');
      router.push(`/buyer/briefs/${data.brief.id}`);
    } else {
      toast.success('已存草稿');
      router.push(`/buyer/briefs/${data.brief.id}`);
    }
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '提交失败');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">
    <div class="max-w-5xl mx-auto px-6 py-10">
      <!-- HEADER -->
      <div class="border-b border-ink pb-6 mb-8 flex items-end justify-between">
        <div>
          <div class="catalog-no mb-2">AIGC · BRIEF · NEW</div>
          <h1 class="font-display text-3xl tracking-wide">发布新需求</h1>
          <p class="text-xs text-ink/50 mt-1">填写需求 → 选择 IP / 平台 → 平台匹配创作者 24h 内报价</p>
        </div>
        <RouterLink
          to="/buyer/orders"
          class="text-xs font-mono tracking-widest uppercase text-ink/60 hover:text-gold"
        >
          ← 我的订单
        </RouterLink>
      </div>

      <form @submit.prevent="submit('publish')" class="space-y-10">
        <!-- 1. 基本信息 -->
        <section>
          <div class="catalog-no mb-3">01 · 基本信息</div>
          <label class="block mb-4">
            <span class="text-xs text-ink/60 mb-1 block">需求标题</span>
            <input
              v-model="form.title"
              type="text"
              maxlength="80"
              placeholder="例:晶新 AI 7 月新品发布短视频 × 5 条"
              class="w-full px-4 py-3 bg-surface border-0.5 border-ink/30 focus:border-gold outline-none transition"
            />
          </label>
          <label class="block">
            <span class="text-xs text-ink/60 mb-1 block">需求描述(选填)</span>
            <textarea
              v-model="form.description"
              rows="4"
              placeholder="品牌调性、目标人群、参考案例、必须出现的元素..."
              class="w-full px-4 py-3 bg-surface border-0.5 border-ink/30 focus:border-gold outline-none transition resize-none"
            ></textarea>
          </label>

          <!-- AI 拆解显式按钮 — #30.7.1 W2 #28 -->
          <div class="mt-4 plate p-4 border-0.5 border-gold bg-cream">
            <div class="flex items-start gap-4">
              <div class="flex-1">
                <div class="text-xs text-stamp-red font-mono mb-1">AI · DECOMPOSE</div>
                <p class="text-xs text-ink/70">
                  不确定怎么填?点 <span class="font-medium text-stamp-red">"AI 拆解"</span>,平台 Agent 会根据标题+描述自动:
                  识别品类 → 推荐平台/IP/档位 → 生成验收清单 → 填到下方表单(你可以再改)
                </p>
              </div>
              <button
                type="button"
                @click="aiDecompose"
                :disabled="aiDecomposing || !form.title"
                class="px-5 py-2 bg-stamp-red text-cream text-xs font-medium tracking-widest uppercase hover:bg-ink transition disabled:opacity-50"
              >
                {{ aiDecomposing ? '拆解中…' : 'AI 拆解 →' }}
              </button>
            </div>
            <div v-if="aiResult" class="mt-3 pt-3 border-t border-gold text-xs text-ink/70">
              <div class="font-mono text-[10px] text-stamp-red mb-1">PLATFORM AGENT 建议</div>
              <div v-if="aiResult.declaredCategory">
                · 品类: <span class="text-ink">{{ CATEGORY_LABELS[aiResult.declaredCategory] || aiResult.declaredCategory }}</span>
              </div>
              <div v-if="aiResult.suggestedPlatforms?.length">
                · 平台: <span class="text-ink">{{ aiResult.suggestedPlatforms.map(p => PLATFORM_LABELS[p] || p).join(' / ') }}</span>
              </div>
              <div v-if="aiResult.suggestedTier">
                · 档位: <span class="text-ink">{{ PACKAGE_LABELS[aiResult.suggestedTier] || aiResult.suggestedTier }}</span>
              </div>
              <div v-if="aiResult.checklistHint">
                · 验收要点: <span class="text-ink">{{ aiResult.checklistHint }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 2. 品类 -->
        <section>
          <div class="catalog-no mb-3">02 · 内容品类</div>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <button
              v-for="c in CATEGORIES"
              :key="c.value"
              type="button"
              @click="onCategoryChange(); form.category = c.value"
              class="plate p-4 text-left border-0.5 transition"
              :class="form.category === c.value
                ? 'border-gold bg-cream shadow-soft'
                : 'border-line bg-surface hover:border-ink/40'"
            >
              <div class="font-display text-base">{{ c.label }}</div>
              <div class="text-[10px] text-ink/50 mt-1">{{ c.desc }}</div>
            </button>
          </div>
        </section>

        <!-- 3. 投放平台(多选) -->
        <section>
          <div class="catalog-no mb-3">03 · 投放平台</div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in PLATFORMS"
              :key="p.value"
              type="button"
              @click="togglePlatform(p.value)"
              class="px-4 py-2 border-0.5 text-sm transition"
              :class="form.platformSet.includes(p.value)
                ? 'border-stamp-red bg-stamp-red text-cream'
                : 'border-line bg-surface hover:border-ink/40'"
            >
              {{ p.label }}
            </button>
          </div>
          <p class="text-[10px] text-ink/40 mt-2">已选 {{ form.platformSet.length }} 个 · 平台越多,创作者工作量越大,价格越高</p>
        </section>

        <!-- 4. 数字人 IP(多选) -->
        <section v-if="myIPs.length > 0">
          <div class="catalog-no mb-3">04 · 数字人 IP(选填)</div>
          <p class="text-xs text-ink/50 mb-3">从你已购买的 IP 中选择,创作者将使用这些形象出镜</p>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              v-for="ip in myIPs"
              :key="ip.id"
              type="button"
              @click="toggleIp(ip.id)"
              class="plate-frame border-0.5 p-2 transition"
              :class="form.ipIds.includes(ip.id) ? 'border-gold bg-gold/5' : 'border-line bg-surface'"
            >
              <div class="aspect-square bg-cream mb-2 flex items-center justify-center text-xs text-ink/30">
                {{ ip.code }}
              </div>
              <div class="text-xs truncate">{{ ip.displayName }}</div>
            </button>
          </div>
        </section>

        <!-- 5. 套餐 + 预算 -->
        <section>
          <div class="catalog-no mb-3">05 · 套餐</div>

          <!-- W5 E1 — AI 3 档报价推荐 -->
          <div class="mb-4 p-4 border-0.5 border-gold/40 bg-gold/5 rounded">
            <div class="flex items-center justify-between mb-2">
              <div class="text-xs text-ink/70">
                <span class="font-display text-sm text-stamp-red mr-2">AI 估价</span>
                基于 brief 内容推荐 3 档价格 + 推荐套餐
              </div>
              <button
                type="button"
                class="px-3 py-1.5 bg-stamp-red text-white text-xs rounded hover:bg-stamp-red/90 disabled:opacity-50"
                :disabled="aiEstimating"
                @click="aiEstimate"
              >
                {{ aiEstimating ? '估价中…' : '✦ AI 估价' }}
              </button>
            </div>
            <div v-if="aiPricing" class="mt-3">
              <div class="grid grid-cols-3 gap-2 mb-3">
                <div
                  v-for="tier in (['essential','standard','premium'] as const)"
                  :key="tier"
                  :class="['p-3 border-0.5 rounded cursor-pointer transition',
                    aiPricing.recommend === tier ? 'border-stamp-red bg-cream' : 'border-line bg-surface hover:border-ink/40']"
                  @click="form.packageTier = tier; applyRecommendedTier()"
                >
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-display">{{ tierLabel(tier) }}</span>
                    <span v-if="aiPricing.recommend === tier" class="text-[10px] px-1.5 py-0.5 bg-stamp-red text-white rounded">推荐</span>
                  </div>
                  <div class="text-lg font-mono text-ink">¥{{ aiPricing[tier].price }}</div>
                  <div class="text-xs text-ink/60 mt-1 line-clamp-2">{{ aiPricing[tier].rationale }}</div>
                </div>
              </div>
              <div class="text-xs text-ink/60 italic">
                💡 {{ aiPricing.reasoning }}
              </div>
              <button
                type="button"
                class="mt-2 px-3 py-1.5 bg-ink text-white text-xs rounded hover:bg-ink/90"
                @click="applyRecommendedTier"
              >
                ⚡ 一键套用推荐档位 + 预算
              </button>
            </div>
          </div>

          <div class="grid md:grid-cols-3 gap-3">
            <button
              v-for="pkg in PACKAGES"
              :key="pkg.value"
              type="button"
              @click="form.packageTier = pkg.value"
              class="plate p-5 text-left border-0.5 transition"
              :class="form.packageTier === pkg.value
                ? 'border-stamp-red bg-cream shadow-soft'
                : 'border-line bg-surface hover:border-ink/40'"
            >
              <div class="font-display text-lg mb-1">{{ pkg.label }}</div>
              <div class="text-xs text-gold font-mono mb-2">{{ pkg.priceRange }}</div>
              <div class="text-xs text-ink/60">{{ pkg.desc }}</div>
            </button>
          </div>
          <div class="grid grid-cols-2 gap-3 mt-4">
            <label class="block">
              <span class="text-xs text-ink/60 mb-1 block">预算下限(¥)</span>
              <input
                v-model.number="form.budgetMin"
                type="number"
                min="100"
                class="w-full px-3 py-2 bg-surface border-0.5 border-ink/30 focus:border-gold outline-none transition"
              />
            </label>
            <label class="block">
              <span class="text-xs text-ink/60 mb-1 block">预算上限(¥)</span>
              <input
                v-model.number="form.budgetMax"
                type="number"
                min="100"
                class="w-full px-3 py-2 bg-surface border-0.5 border-ink/30 focus:border-gold outline-none transition"
              />
            </label>
          </div>
        </section>

        <!-- 6. 截止时间 -->
        <section>
          <div class="catalog-no mb-3">06 · 截止时间</div>
          <input
            v-model="form.deadlineAt"
            type="datetime-local"
            :min="deadlineMinDate"
            class="w-full px-4 py-3 bg-surface border-0.5 border-ink/30 focus:border-gold outline-none transition"
          />
        </section>

        <!-- 提交 -->
        <div class="border-t border-ink/20 pt-6 flex gap-3 justify-end">
          <button
            type="button"
            @click="submit('draft')"
            :disabled="submitting"
            class="px-6 py-3 border-0.5 border-ink/30 text-sm hover:border-ink transition"
          >
            存草稿
          </button>
          <button
            type="submit"
            :disabled="submitting"
            class="px-8 py-3 bg-stamp-red text-cream text-sm font-medium tracking-widest uppercase hover:bg-ink transition disabled:opacity-50"
          >
            {{ submitting ? '提交中…' : '发布需求 →' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>