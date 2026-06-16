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
  visualAgeBucket: string;
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
  visualAgeBucket: (route.query.visualAgeBucket as string) || '',
  style: (route.query.style as string) || '',
  scenario: (route.query.scenario as string) || '',
  page: parseInt((route.query.page as string) || '1', 10),
});
const sort = ref<'newest' | 'popular'>(((route.query.sort as string) || 'newest') as 'newest' | 'popular');

const SIZE = 24;

const watermarkText = computed(() =>
  auth.user?.email ? `ibi.ren · ${auth.user.email}` : 'ibi.ren · guest'
);

// Chip filter 选项
const genderChips = [
  { value: '', label: '全部性别' },
  { value: 'female', label: '女' },
  { value: 'male', label: '男' },
  { value: 'nonbinary', label: '无性别' },
];
const ageChips = [
  { value: '', label: '全部年龄' },
  { value: 'child', label: '童颜' },
  { value: 'young', label: '青年' },
  { value: 'middle', label: '熟龄' },
  { value: 'old', label: '银发' },
];
const styleChips = [
  { value: '', label: '全部风格' },
  { value: '现代', label: '现代' },
  { value: '古风', label: '古风' },
  { value: '赛博', label: '赛博' },
  { value: '二次元', label: '二次元' },
];
const scenarioChips = [
  { value: '', label: '全部场景' },
  { value: '短剧群演', label: '短剧群演' },
  { value: '短剧主演', label: '短剧主演' },
  { value: '品牌代言', label: '品牌代言' },
  { value: '平面模特', label: '平面模特' },
  { value: '游戏角色', label: '游戏角色' },
];

const activeFilterCount = computed(() =>
  [filters.value.gender, filters.value.visualAgeBucket, filters.value.style, filters.value.scenario]
    .filter(Boolean).length
);

async function fetchList() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/ips', {
      params: {
        gender: filters.value.gender || undefined,
        visualAgeBucket: filters.value.visualAgeBucket || undefined,
        style: filters.value.style || undefined,
        scenario: filters.value.scenario || undefined,
        sort: sort.value,
        page: filters.value.page,
        size: SIZE,
      },
    });
    items.value = data.items;
    total.value = data.total;
    router.replace({
      query: {
        ...filters.value,
        sort: sort.value,
        page: filters.value.page || undefined,
        gender: filters.value.gender || undefined,
        visualAgeBucket: filters.value.visualAgeBucket || undefined,
        style: filters.value.style || undefined,
        scenario: filters.value.scenario || undefined,
      },
    });
  } finally {
    loading.value = false;
  }
}

function applyFilter(key: 'gender' | 'visualAgeBucket' | 'style' | 'scenario', value: string) {
  filters.value = { ...filters.value, [key]: value, page: 1 };
  fetchList();
}

function setSort(s: 'newest' | 'popular') {
  sort.value = s;
  filters.value = { ...filters.value, page: 1 };
  fetchList();
}

function resetFilters() {
  filters.value = { gender: '', visualAgeBucket: '', style: '', scenario: '', page: 1 };
  sort.value = 'newest';
  fetchList();
}

const totalPages = computed(() => Math.ceil(total.value / SIZE));

onMounted(fetchList);
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-10">
    <!-- 标题 + 总数 + 排序 -->
    <div class="mb-8 flex items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl">形象库</h1>
        <p class="text-sm text-ink/60 mt-1">
          共 <span class="font-mono">{{ total }}</span> 个 IP · 已存证可商用
        </p>
      </div>
      <div class="flex items-center gap-1 text-xs bg-white border border-line rounded-full p-1">
        <button
          @click="setSort('newest')"
          :class="sort === 'newest' ? 'bg-ink text-cream' : 'text-ink/60 hover:text-ink'"
          class="px-3 py-1 rounded-full transition"
        >最新</button>
        <button
          @click="setSort('popular')"
          :class="sort === 'popular' ? 'bg-ink text-cream' : 'text-ink/60 hover:text-ink'"
          class="px-3 py-1 rounded-full transition"
        >热门</button>
      </div>
    </div>

    <!-- Chip 筛选条 -->
    <div class="mb-8 p-4 bg-white rounded-2xl border border-line space-y-3">
      <div class="flex items-start gap-3 flex-wrap">
        <span class="text-xs text-ink/50 mt-1.5 shrink-0 w-12">性别</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="c in genderChips"
            :key="c.value || 'all'"
            type="button"
            @click="applyFilter('gender', c.value)"
            :class="filters.gender === c.value
              ? 'bg-ink text-cream'
              : 'bg-cream text-ink/70 border border-line hover:border-gold hover:text-ink'"
            class="px-3 py-1 text-xs rounded-full transition"
          >{{ c.label }}</button>
        </div>
      </div>
      <div class="flex items-start gap-3 flex-wrap">
        <span class="text-xs text-ink/50 mt-1.5 shrink-0 w-12">年龄</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="c in ageChips"
            :key="c.value || 'all'"
            type="button"
            @click="applyFilter('visualAgeBucket', c.value)"
            :class="filters.visualAgeBucket === c.value
              ? 'bg-ink text-cream'
              : 'bg-cream text-ink/70 border border-line hover:border-gold hover:text-ink'"
            class="px-3 py-1 text-xs rounded-full transition"
          >{{ c.label }}</button>
        </div>
      </div>
      <div class="flex items-start gap-3 flex-wrap">
        <span class="text-xs text-ink/50 mt-1.5 shrink-0 w-12">风格</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="c in styleChips"
            :key="c.value || 'all'"
            type="button"
            @click="applyFilter('style', c.value)"
            :class="filters.style === c.value
              ? 'bg-ink text-cream'
              : 'bg-cream text-ink/70 border border-line hover:border-gold hover:text-ink'"
            class="px-3 py-1 text-xs rounded-full transition"
          >{{ c.label }}</button>
        </div>
      </div>
      <div class="flex items-start gap-3 flex-wrap">
        <span class="text-xs text-ink/50 mt-1.5 shrink-0 w-12">场景</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="c in scenarioChips"
            :key="c.value || 'all'"
            type="button"
            @click="applyFilter('scenario', c.value)"
            :class="filters.scenario === c.value
              ? 'bg-ink text-cream'
              : 'bg-cream text-ink/70 border border-line hover:border-gold hover:text-ink'"
            class="px-3 py-1 text-xs rounded-full transition"
          >{{ c.label }}</button>
        </div>
      </div>

      <div v-if="activeFilterCount > 0 || sort !== 'newest'" class="pt-2 border-t border-line flex items-center gap-3">
        <span class="text-xs text-ink/50">已激活 {{ activeFilterCount }} 个筛选</span>
        <button @click="resetFilters" class="text-xs text-ink/60 hover:text-ink underline ml-auto">
          全部重置
        </button>
      </div>
    </div>

    <!-- 列表 / 骨架 / 空态 -->
    <div v-if="loading" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
      <div v-for="i in 8" :key="i" class="bg-white rounded-2xl border border-line overflow-hidden">
        <Skeleton shape="block" aspect="1/1" />
        <div class="p-3 space-y-2">
          <Skeleton shape="line" width="60%" />
          <Skeleton shape="line" width="40%" height-class="h-2" />
        </div>
      </div>
    </div>
    <EmptyState
      v-else-if="items.length === 0"
      icon="🔍"
      title="未找到匹配的 IP"
      description="试试放宽筛选条件,或者直接浏览全部形象"
      action-label="全部重置"
      :action-on-click="resetFilters"
    />
    <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
      <IpCard v-for="ip in items" :key="ip.id" :ip="ip" :watermark-text="watermarkText" />
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="mt-10 flex justify-center gap-2">
      <button
        v-for="p in totalPages"
        :key="p"
        @click="filters.page = p; fetchList()"
        class="w-9 h-9 rounded-full text-sm"
        :class="filters.page === p ? 'bg-ink text-cream' : 'bg-white border border-line hover:bg-cream'"
      >
        {{ p }}
      </button>
    </div>
  </div>
</template>