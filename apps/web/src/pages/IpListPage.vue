<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import IpCard from '@/components/IpCard.vue';
import Skeleton from '@/components/Skeleton.vue';
import EmptyState from '@/components/EmptyState.vue';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

interface IpItem {
  id: string;
  code: string;
  displayName: string;
  tagline?: string;
  thumbnailKey: string;
  styleTags: string;
  scenarioTags: string;
  gender: string;
  ageBucket: string;
  ethnicity?: string | null;
  faceTags?: Array<{ category: string; value: string }> | null;
  depositPriceFen: number;
  fullLicensePriceFen: number;
  status: string;
  officialCertNo?: string;
  blockchainTxId?: string;
  blockchainHash?: string;
  publishedAt?: string;
}

const items = ref<IpItem[]>([]);
const total = ref(0);
const loading = ref(false);
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const filters = ref({
  gender: (route.query.gender as string) || '',
  ageBucket: (route.query.ageBucket as string) || '',
  ethnicity: (route.query.ethnicity as string) || '',
  style: (route.query.style as string) || '',
  scenario: (route.query.scenario as string) || '',
  creatorName: (route.query.creatorName as string) || '',
  page: parseInt((route.query.page as string) || '1', 10),
});
const sort = ref<'newest' | 'popular'>(((route.query.sort as string) || 'newest') as 'newest' | 'popular');

const SIZE = 24;

/** W6-R7: embed 模式 — 由 ResultsPane 嵌入右屏 (`?embed=ip-library` 或显式 prop),
 *   隐藏 hero/header chrome。 prop 优先于 query (组件嵌套时 query 会和 page 冲突)。*/
const props = defineProps<{ embedMode?: boolean }>();
const isEmbed = computed(() => !!props.embedMode || route.query.embed === 'ip-library');
/** W6-R7: fullscreen 模式 — 占满右屏 (`?fullscreen=true`), 隐藏 ResultsPane 顶栏 */
const isFullscreen = computed(() => route.query.fullscreen === 'true');

const watermarkText = computed(() =>
  auth.user?.email ? `IBIren · ${auth.user.email}` : 'IBIren · guest'
);

// Chip filter 选项 — #32 enum 值大写, 与后端 1:1
const genderChips = [
  { value: '', label: '全部', cn: 'ALL' },
  { value: 'FEMALE', label: '女', cn: 'FEMALE' },
  { value: 'MALE', label: '男', cn: 'MALE' },
  { value: 'NONBINARY', label: '无性别', cn: 'NONBIN' },
];
const ageChips = [
  { value: '', label: '全部', cn: 'ALL' },
  { value: 'CHILD', label: '童颜', cn: 'CHILD' },
  { value: 'YOUNG', label: '青年', cn: 'YOUNG' },
  { value: 'MIDDLE', label: '中年', cn: 'MIDDLE' },
  { value: 'ELDERLY', label: '银发', cn: 'ELDER' },
];
const ethnicityChips = [
  { value: '', label: '全部', cn: 'ALL' },
  { value: 'EAST_ASIAN', label: '东亚', cn: 'E.ASIA' },
  { value: 'SOUTHEAST_ASIAN', label: '东南亚', cn: 'SE.ASIA' },
  { value: 'SOUTH_ASIAN', label: '南亚', cn: 'S.ASIA' },
  { value: 'AFRICAN', label: '非洲', cn: 'AFRICA' },
  { value: 'EUROPEAN', label: '欧洲', cn: 'EUROPE' },
  { value: 'MIXED', label: '混合', cn: 'MIXED' },
];
const styleChips = [
  { value: '', label: '全部', cn: 'ALL' },
  { value: '现代', label: '现代', cn: 'MODERN' },
  { value: '古风', label: '古风', cn: 'CLASSIC' },
  { value: '赛博', label: '赛博', cn: 'CYBER' },
  { value: '二次元', label: '二次元', cn: 'ANIME' },
];
const scenarioChips = [
  { value: '', label: '全部', cn: 'ALL' },
  { value: '短剧群演', label: '群演', cn: 'EXTRA' },
  { value: '短剧主演', label: '主演', cn: 'LEAD' },
  { value: '品牌代言', label: '代言', cn: 'BRAND' },
  { value: '平面模特', label: '平面', cn: 'PRINT' },
  { value: '游戏角色', label: '游戏', cn: 'GAME' },
];

const activeFilterCount = computed(() =>
  [filters.value.gender, filters.value.ageBucket, filters.value.ethnicity, filters.value.style, filters.value.scenario]
    .filter(Boolean).length
);

async function fetchList() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/ips', {
      params: {
        gender: filters.value.gender || undefined,
        ageBucket: filters.value.ageBucket || undefined,
        ethnicity: filters.value.ethnicity || undefined,
        style: filters.value.style || undefined,
        scenario: filters.value.scenario || undefined,
        creatorName: filters.value.creatorName || undefined,
        sort: sort.value,
        page: filters.value.page,
        size: SIZE,
      },
    });
    items.value = data.items;
    total.value = data.total;
    if (!isEmbed.value) {
      // embed 模式下 ResultsPane 已经控制 URL, 这里再 replace 会冲突
      router.replace({
        query: {
          ...filters.value,
          sort: sort.value,
          page: filters.value.page || undefined,
          gender: filters.value.gender || undefined,
          ageBucket: filters.value.ageBucket || undefined,
          ethnicity: filters.value.ethnicity || undefined,
          style: filters.value.style || undefined,
          scenario: filters.value.scenario || undefined,
        },
      });
    }
  } finally {
    loading.value = false;
  }
}

function applyFilter(key: 'gender' | 'ageBucket' | 'ethnicity' | 'style' | 'scenario', value: string) {
  filters.value = { ...filters.value, [key]: value, page: 1 };
  fetchList();
}

function applyCreatorName(name: string) {
  filters.value = { ...filters.value, creatorName: name, page: 1 };
  fetchList();
}

function setSort(s: 'newest' | 'popular') {
  sort.value = s;
  filters.value = { ...filters.value, page: 1 };
  fetchList();
}

function resetFilters() {
  filters.value = { gender: '', ageBucket: '', ethnicity: '', style: '', scenario: '', creatorName: '', page: 1 };
  sort.value = 'newest';
  fetchList();
}

const totalPages = computed(() => Math.ceil(total.value / SIZE));

onMounted(fetchList);
</script>

<template>
  <div :class="['bg-cream', isEmbed ? 'h-full overflow-y-auto' : '']">

    <!-- W6-R7: 嵌入右屏模式 → 跳过 hero header (ResultsPane 已自带头部) -->
    <template v-if="!isEmbed">
      <!-- ============================================================
         HEADER · 档案首页
         ============================================================ -->
      <section class="relative paper-grain border-b hairline-b border-line">
        <div class="max-w-[1320px] mx-auto px-6 lg:px-10 pt-14 md:pt-20 pb-10 md:pb-14 relative z-10">

        <!-- 元数据行 -->
        <div class="grid grid-cols-12 gap-4 mb-10 md:mb-14">
          <div class="col-span-3 catalog-no text-ink/50">№ 002</div>
          <div class="col-span-3 col-start-5 catalog-no text-ink/50">CHAPTER II — CATALOGUE</div>
          <div class="col-span-3 col-start-9 catalog-no text-ink/50">ACCESSIONED · ON-CHAIN</div>
          <div class="col-span-3 col-start-12 catalog-no text-ink/50 text-right hidden md:block">2026 / Q2</div>
        </div>

        <div class="grid md:grid-cols-12 gap-6 items-end">
          <div class="md:col-span-7">
            <h1 class="font-display text-6xl md:text-8xl lg:text-9xl leading-[0.9] text-ink">
              形象<span class="font-display-italic text-gold">库</span>
            </h1>
            <p class="mt-6 text-base md:text-lg text-ink/60 max-w-xl leading-relaxed">
              共 <span class="font-display text-3xl text-gold mx-1">{{ total }}</span> 件已登记 AI 虚拟人资产 ·
              <span class="font-display-italic">每一件都有作品著作权登记证书与区块链时间戳。</span>
            </p>
          </div>

          <!-- 排序 · 像图录版次 -->
          <div class="md:col-span-4 md:col-start-9 flex md:justify-end">
            <div class="inline-flex items-stretch border-0.5 border-ink">
              <div class="px-4 py-3 catalog-no text-ink/50 border-r-0.5 border-ink bg-surface">
                SORT BY
              </div>
              <button
                @click="setSort('newest')"
                :class="sort === 'newest' ? 'bg-ink text-cream' : 'text-ink/70 hover:bg-ink hover:text-cream'"
                class="px-5 py-3 font-mono text-xs tracking-widest uppercase transition"
              >最新</button>
              <button
                @click="setSort('popular')"
                :class="sort === 'popular' ? 'bg-ink text-cream' : 'text-ink/70 hover:bg-ink hover:text-cream'"
                class="px-5 py-3 font-mono text-xs tracking-widest uppercase transition border-l-0.5 border-ink"
              >热门</button>
            </div>
          </div>
        </div>

        <!-- 已激活筛选 · 像图录的索引横标 -->
        <div v-if="activeFilterCount > 0" class="mt-10 pt-6 hairline-t border-line flex items-center gap-3 flex-wrap">
          <span class="catalog-no text-ink/50">ACTIVE FILTERS · {{ String(activeFilterCount).padStart(2, '0') }}</span>
          <span class="catalog-no text-gold">{{ activeFilterCount }} of 5</span>
          <button @click="resetFilters" class="ml-auto catalog-no text-ink/50 hover:text-gold transition flex items-center gap-2">
            <span>RESET ALL</span>
            <span>×</span>
          </button>
        </div>
      </div>
    </section>
    </template>

    <!-- ============================================================
         MAIN · 左侧固定图录索引 + 右侧画廊
         ============================================================ -->
    <section class="max-w-[1320px] mx-auto px-6 lg:px-10 py-10 md:py-14">
      <div class="grid lg:grid-cols-12 gap-8 lg:gap-12">

        <!-- ============= LEFT · 美术馆图录索引 (固定侧栏) ============= -->
        <aside class="lg:col-span-3 lg:sticky lg:top-6 self-start space-y-8 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto pr-2">

          <!-- 性别 -->
          <div>
            <div class="flex items-baseline justify-between mb-4 pb-3 hairline-b border-line">
              <h3 class="catalog-no text-ink/60">A · GENDER</h3>
              <span class="catalog-no text-ink/30">{{ filters.gender ? '01' : '—' }}</span>
            </div>
            <ul class="space-y-1">
              <li v-for="c in genderChips" :key="c.value || 'all'">
                <button
                  type="button"
                  @click="applyFilter('gender', c.value)"
                  :class="['archive-tab w-full flex items-center gap-3 px-3 py-1.5 text-left', filters.gender === c.value ? 'is-active' : '']"
                >
                  <span class="font-mono text-[10px] opacity-50 shrink-0 w-12">{{ c.cn }}</span>
                  <span class="font-sans text-sm text-ink">{{ c.label }}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- 年龄 -->
          <div>
            <div class="flex items-baseline justify-between mb-4 pb-3 hairline-b border-line">
              <h3 class="catalog-no text-ink/60">B · AGE BUCKET</h3>
              <span class="catalog-no text-ink/30">{{ filters.ageBucket ? '01' : '—' }}</span>
            </div>
            <ul class="space-y-1">
              <li v-for="c in ageChips" :key="c.value || 'all'">
                <button
                  type="button"
                  @click="applyFilter('ageBucket', c.value)"
                  :class="['archive-tab w-full flex items-center gap-3 px-3 py-1.5 text-left', filters.ageBucket === c.value ? 'is-active' : '']"
                >
                  <span class="font-mono text-[10px] opacity-50 shrink-0 w-12">{{ c.cn }}</span>
                  <span class="font-sans text-sm text-ink">{{ c.label }}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- 种族 -->
          <div>
            <div class="flex items-baseline justify-between mb-4 pb-3 hairline-b border-line">
              <h3 class="catalog-no text-ink/60">C · ETHNICITY</h3>
              <span class="catalog-no text-ink/30">{{ filters.ethnicity ? '01' : '—' }}</span>
            </div>
            <ul class="space-y-1">
              <li v-for="c in ethnicityChips" :key="c.value || 'all'">
                <button
                  type="button"
                  @click="applyFilter('ethnicity', c.value)"
                  :class="['archive-tab w-full flex items-center gap-3 px-3 py-1.5 text-left', filters.ethnicity === c.value ? 'is-active' : '']"
                >
                  <span class="font-mono text-[10px] opacity-50 shrink-0 w-12">{{ c.cn }}</span>
                  <span class="font-sans text-sm text-ink">{{ c.label }}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- 风格 -->
          <div>
            <div class="flex items-baseline justify-between mb-4 pb-3 hairline-b border-line">
              <h3 class="catalog-no text-ink/60">D · STYLE</h3>
              <span class="catalog-no text-ink/30">{{ filters.style ? '01' : '—' }}</span>
            </div>
            <ul class="space-y-1">
              <li v-for="c in styleChips" :key="c.value || 'all'">
                <button
                  type="button"
                  @click="applyFilter('style', c.value)"
                  :class="['archive-tab w-full flex items-center gap-3 px-3 py-1.5 text-left', filters.style === c.value ? 'is-active' : '']"
                >
                  <span class="font-mono text-[10px] opacity-50 shrink-0 w-12">{{ c.cn }}</span>
                  <span class="font-sans text-sm text-ink">{{ c.label }}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- 场景 -->
          <div>
            <div class="flex items-baseline justify-between mb-4 pb-3 hairline-b border-line">
              <h3 class="catalog-no text-ink/60">E · SCENARIO</h3>
              <span class="catalog-no text-ink/30">{{ filters.scenario ? '01' : '—' }}</span>
            </div>
            <ul class="space-y-1">
              <li v-for="c in scenarioChips" :key="c.value || 'all'">
                <button
                  type="button"
                  @click="applyFilter('scenario', c.value)"
                  :class="['archive-tab w-full flex items-center gap-3 px-3 py-1.5 text-left', filters.scenario === c.value ? 'is-active' : '']"
                >
                  <span class="font-mono text-[10px] opacity-50 shrink-0 w-12">{{ c.cn }}</span>
                  <span class="font-sans text-sm text-ink">{{ c.label }}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- W6-R7: 创作者名搜索 (模糊匹配 User.displayName) -->
          <div>
            <div class="flex items-baseline justify-between mb-4 pb-3 hairline-b border-line">
              <h3 class="catalog-no text-ink/60">F · CREATOR</h3>
              <span class="catalog-no text-ink/30">{{ filters.creatorName ? '01' : '—' }}</span>
            </div>
            <input
              type="text"
              :value="filters.creatorName"
              @input="(e: any) => applyCreatorName(e.target.value)"
              placeholder="搜索创作者名…"
              class="w-full px-3 py-1.5 bg-surface border border-line text-sm text-ink placeholder:text-ink/30 focus:outline-none focus:border-gold"
              data-testid="ip-filter-creator-name"
            />
          </div>

          <!-- Footer note -->
          <div class="pt-6 hairline-t border-line">
            <div class="catalog-no text-ink/40 mb-2">CURATOR'S NOTE</div>
            <p class="font-display-italic text-base text-ink/60 leading-relaxed">
              所有作品已通过区块链存证 + 国家或省级著作权登记,
              可直接进入采购流程。
            </p>
          </div>
        </aside>

        <!-- ============= RIGHT · 画廊墙 ============= -->
        <div class="lg:col-span-9">

          <!-- Loading -->
          <div v-if="loading" class="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            <div v-for="i in 9" :key="i" class="space-y-3">
              <Skeleton shape="block" aspect="3/4" width-class="w-full" />
              <div class="space-y-2">
                <Skeleton shape="line" width="60%" height-class="h-3" />
                <Skeleton shape="line" width="40%" height-class="h-2" />
              </div>
            </div>
          </div>

          <!-- Empty -->
          <div v-else-if="items.length === 0" class="py-24">
            <EmptyState
              icon="◇"
              title="— No matching plates —"
              description="尝试放宽筛选条件, 或直接浏览全部形象"
              action-label="RESET FILTERS"
              :action-on-click="resetFilters"
            />
          </div>

          <!-- 画廊 grid · 4 列为主,每张 IP 用 archive-tab 卡片 -->
          <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            <IpCard v-for="ip in items" :key="ip.id" :ip="ip" :watermark-text="watermarkText" />
          </div>

          <!-- 分页 · 像翻图录的页码 -->
          <div v-if="totalPages > 1" class="mt-16 pt-6 hairline-t border-line">
            <div class="flex items-center justify-between gap-4 flex-wrap">
              <div class="catalog-no text-ink/50">
                PAGE <span class="text-gold">{{ String(filters.page).padStart(2, '0') }}</span> / {{ String(totalPages).padStart(2, '0') }}
              </div>
              <div class="flex items-stretch border-0.5 border-ink">
                <button
                  v-for="p in totalPages"
                  :key="p"
                  @click="filters.page = p; fetchList()"
                  :class="filters.page === p ? 'bg-ink text-cream' : 'text-ink hover:bg-ink hover:text-cream'"
                  class="w-10 h-10 font-mono text-xs transition border-r-0.5 border-ink last:border-r-0"
                >{{ String(p).padStart(2, '0') }}</button>
              </div>
            </div>
          </div>

          <!-- Colophon · 底部档案签名 -->
          <div v-if="items.length > 0" class="mt-12 grid grid-cols-12 gap-4 catalog-no text-ink/40">
            <div class="col-span-3">CAT. NF-26</div>
            <div class="col-span-6 col-start-4">CATALOGUED BY IBIren ARCHIVE DEPT.</div>
            <div class="col-span-3 col-start-10 text-right">© 2026</div>
          </div>
        </div>

      </div>
    </section>

  </div>
</template>