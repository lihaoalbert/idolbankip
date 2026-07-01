<script setup lang="ts">
/**
 * /studio/catalog — 平台标准 SKU 菜单公开页
 * #30.7.1 W2 #28
 * 平台菜单透明不可议价;加价/加项走另外通道(Brief.bumpPrice / addOns)
 * 买家发包前 / 创作者投标前 / 公开宣传页 都能访问
 */
import { computed, onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';

interface Sku {
  id: string;
  code: string;
  category: string;
  tier: 'essential' | 'standard' | 'premium';
  basePrice: string;
  deliveryDays: number;
  quantity: number;
  ipsIncluded: number;
  platformsIncluded: number;
  description: string;
  enabled: boolean;
}

const skus = ref<Sku[]>([]);
const loading = ref(true);
const filterCategory = ref<string>('');
const filterTier = ref<string>('');

const CATEGORY_LABELS: Record<string, string> = {
  ad: '数字人广告',
  shortvideo: 'AIGC 短视频',
  livestream_clip: '直播切片',
  poster: '营销海报',
  '3d': '3D 数字人',
};
const TIER_LABELS: Record<string, string> = {
  essential: 'Essential 基础版',
  standard: 'Standard 标准版',
  premium: 'Premium 旗舰版',
};
const TIER_TAGLINE: Record<string, string> = {
  essential: '适合试水',
  standard: '主流选择',
  premium: '全功能旗舰',
};

const visibleSkus = computed(() =>
  skus.value
    .filter((s) => (filterCategory.value ? s.category === filterCategory.value : true))
    .filter((s) => (filterTier.value ? s.tier === filterTier.value : true)),
);

const groupedByCategory = computed(() => {
  const map = new Map<string, Sku[]>();
  for (const s of visibleSkus.value) {
    if (!map.has(s.category)) map.set(s.category, []);
    map.get(s.category)!.push(s);
  }
  return Array.from(map.entries());
});

onMounted(async () => {
  try {
    const { data } = await apiClient.get('/catalog/skus');
    skus.value = data.items;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">
    <div class="max-w-6xl mx-auto px-6 py-10">
      <!-- HEADER -->
      <div class="border-b border-ink pb-6 mb-8">
        <div class="catalog-no mb-2">PLATFORM · CATALOG · STUDIO</div>
        <h1 class="font-display text-4xl tracking-wide">平台标准 SKU 菜单</h1>
        <p class="text-sm text-ink/60 mt-2 max-w-2xl">
          所有服务单元标准化,价格透明不可议价。买家发包按菜单选 SKU,创作者接单前先看 SKU 明确工作量和验收标准。
          加价/加项走另外通道 — 详见 <RouterLink to="/studio/standards" class="text-stamp-red underline">平台标准</RouterLink>。
        </p>
      </div>

      <!-- 过滤 -->
      <div class="mb-8 space-y-3">
        <div class="flex flex-wrap gap-2">
          <span class="text-xs text-ink/50 self-center mr-2">品类</span>
          <button
            @click="filterCategory = ''"
            class="px-3 py-1 text-xs border-0.5"
            :class="!filterCategory ? 'border-stamp-red bg-stamp-red text-cream' : 'border-line bg-surface hover:border-ink/40'"
          >全部</button>
          <button
            v-for="(label, key) in CATEGORY_LABELS"
            :key="key"
            @click="filterCategory = key"
            class="px-3 py-1 text-xs border-0.5"
            :class="filterCategory === key ? 'border-stamp-red bg-stamp-red text-cream' : 'border-line bg-surface hover:border-ink/40'"
          >{{ label }}</button>
        </div>
        <div class="flex flex-wrap gap-2">
          <span class="text-xs text-ink/50 self-center mr-2">档位</span>
          <button
            @click="filterTier = ''"
            class="px-3 py-1 text-xs border-0.5"
            :class="!filterTier ? 'border-stamp-red bg-stamp-red text-cream' : 'border-line bg-surface hover:border-ink/40'"
          >全部</button>
          <button
            v-for="(label, key) in TIER_LABELS"
            :key="key"
            @click="filterTier = key"
            class="px-3 py-1 text-xs border-0.5"
            :class="filterTier === key ? 'border-stamp-red bg-stamp-red text-cream' : 'border-line bg-surface hover:border-ink/40'"
          >{{ label }}</button>
        </div>
      </div>

      <!-- 加载 / 空 -->
      <div v-if="loading" class="text-center py-20 text-ink/40 text-xs">加载中…</div>
      <div v-else-if="visibleSkus.length === 0" class="text-center py-20 border-0.5 border-dashed border-ink/20">
        <p class="text-sm text-ink/50">没有匹配的 SKU</p>
      </div>

      <!-- SKU 表格(按品类分组) -->
      <div v-else class="space-y-10">
        <section v-for="[cat, items] in groupedByCategory" :key="cat">
          <div class="catalog-no mb-3 text-stamp-red">{{ CATEGORY_LABELS[cat] }}</div>
          <div class="grid md:grid-cols-3 gap-4">
            <article
              v-for="s in items"
              :key="s.id"
              class="plate paper-grain p-5 border-0.5 border-line bg-surface flex flex-col"
            >
              <div class="flex items-start justify-between mb-2">
                <div>
                  <div class="font-mono text-[10px] text-ink/40">{{ s.code }}</div>
                  <div class="font-display text-lg mt-0.5">{{ TIER_LABELS[s.tier] }}</div>
                </div>
                <span class="text-[10px] text-ink/40 uppercase">{{ TIER_TAGLINE[s.tier] }}</span>
              </div>
              <div class="font-mono text-2xl text-stamp-red mb-3">¥{{ Number(s.basePrice).toLocaleString('zh-CN') }}</div>
              <p class="text-xs text-ink/70 leading-relaxed mb-3 flex-1">{{ s.description }}</p>
              <div class="border-t border-line pt-3 grid grid-cols-2 gap-y-1 text-[11px] text-ink/60">
                <span>交付 {{ s.deliveryDays }} 天</span>
                <span>{{ s.quantity }} 件成片</span>
                <span>含 {{ s.ipsIncluded }} 个 IP</span>
                <span>{{ s.platformsIncluded }} 平台</span>
              </div>
            </article>
          </div>
        </section>
      </div>

      <!-- 底部说明 -->
      <div class="mt-12 plate p-6 text-xs text-ink/60 leading-relaxed">
        <div class="catalog-no mb-2 text-gold">透明不可议价</div>
        <p>
          平台菜单价格 = 平台标准价(菜单价),所有 SKU 同品类同档位全国统一价。买家发包时菜单价自动锁定,创作者投标按菜单价 ±10% 内报价属正常。
        </p>
        <p class="mt-2">
          需加价? 详见 <RouterLink to="/studio/standards" class="text-stamp-red underline">动态调价机制(3 道软护栏)</RouterLink>
          — 累计 ≤ 3 次 / 超 2x 弹窗确认 / 创作者端只看到总价。
        </p>
      </div>
    </div>
  </div>
</template>
