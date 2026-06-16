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

const SIZE = 24;

const watermarkText = computed(() =>
  auth.user?.email ? `ibi.ren · ${auth.user.email}` : 'ibi.ren · guest'
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
        page: filters.value.page,
        size: SIZE,
      },
    });
    items.value = data.items;
    total.value = data.total;
    router.replace({ query: { ...filters.value, page: filters.value.page || undefined } });
  } finally {
    loading.value = false;
  }
}

function applyFilter(key: keyof typeof filters.value, value: string) {
  filters.value = { ...filters.value, [key]: value, page: 1 };
  fetchList();
}

function resetFilters() {
  filters.value = { gender: '', visualAgeBucket: '', style: '', scenario: '', page: 1 };
  fetchList();
}

const totalPages = computed(() => Math.ceil(total.value / SIZE));

onMounted(fetchList);
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-10">
    <div class="mb-8 flex items-baseline justify-between">
      <h1 class="font-display text-3xl">形象库</h1>
      <div class="text-sm text-ink/60">共 {{ total }} 个 IP</div>
    </div>

    <div class="mb-6 flex flex-wrap gap-3 p-4 bg-white rounded-2xl border border-line">
      <select
        :value="filters.gender"
        @change="(e) => applyFilter('gender', (e.target as HTMLSelectElement).value)"
        class="px-3 py-1.5 text-sm border border-line rounded-full bg-cream"
      >
        <option value="">全部性别</option>
        <option value="male">男</option>
        <option value="female">女</option>
        <option value="nonbinary">无性别</option>
      </select>

      <select
        :value="filters.visualAgeBucket"
        @change="(e) => applyFilter('visualAgeBucket', (e.target as HTMLSelectElement).value)"
        class="px-3 py-1.5 text-sm border border-line rounded-full bg-cream"
      >
        <option value="">全部年龄段</option>
        <option value="child">童</option>
        <option value="young">青</option>
        <option value="middle">中</option>
        <option value="old">老</option>
      </select>

      <select
        :value="filters.style"
        @change="(e) => applyFilter('style', (e.target as HTMLSelectElement).value)"
        class="px-3 py-1.5 text-sm border border-line rounded-full bg-cream"
      >
        <option value="">全部风格</option>
        <option value="现代">现代</option>
        <option value="古风">古风</option>
        <option value="赛博">赛博</option>
        <option value="二次元">二次元</option>
      </select>

      <select
        :value="filters.scenario"
        @change="(e) => applyFilter('scenario', (e.target as HTMLSelectElement).value)"
        class="px-3 py-1.5 text-sm border border-line rounded-full bg-cream"
      >
        <option value="">全部场景</option>
        <option value="短剧群演">短剧群演</option>
        <option value="短剧主演">短剧主演</option>
        <option value="品牌代言">品牌代言</option>
        <option value="平面模特">平面模特</option>
        <option value="游戏角色">游戏角色</option>
      </select>

      <button @click="resetFilters" class="ml-auto text-xs text-ink/50 hover:text-ink underline">
        重置筛选
      </button>
    </div>

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
      action-label="重置筛选"
      :action-on-click="resetFilters"
    />
    <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
      <IpCard v-for="ip in items" :key="ip.id" :ip="ip" :watermark-text="watermarkText" />
    </div>

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