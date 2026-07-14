<script setup lang="ts">
/**
 * 创作者抢单页 — /creator/briefs
 * #30.7.1 AIGC 众包
 * W1 静态骨架: UI 完成,接 stub
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const toast = useToast();
const auth = useAuthStore();

const CATEGORY_LABELS: Record<string, string> = {
  ad: '数字人广告',
  shortvideo: '短视频',
  livestream_clip: '直播切片',
  poster: '营销海报',
  '3d': '3D 数字人',
};

const PACKAGE_LABELS: Record<string, string> = {
  essential: '基础版',
  standard: '标准版',
  premium: '旗舰版',
};

const PLATFORM_LABELS: Record<string, string> = {
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

const briefs = ref<any[]>([]);
const loading = ref(false);
const filterCategory = ref<string>('');

const visibleBriefs = computed(() => {
  // R10 P0-4: 前端兜底过滤 EXPIRED — 后端 listPublic 已加 deadlineAt >= now() 硬过滤,
  //   但用户可能在两轮请求之间碰到临界值过期,前端再兜一刀保证列表永远不显示已截止 brief
  const nowMs = Date.now();
  return briefs.value
    .filter((b) => new Date(b.deadlineAt).getTime() > nowMs)
    .filter((b) => !filterCategory.value || b.category === filterCategory.value);
});

const now = ref(Date.now());
setInterval(() => (now.value = Date.now()), 60_000);

function timeLeft(deadlineAt: string) {
  const ms = new Date(deadlineAt).getTime() - now.value;
  if (ms < 0) return { text: 'EXPIRED', cn: '已截止', danger: true };
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days === 0) return { text: `${hours}H LEFT`, cn: `${hours} 小时截止`, danger: true };
  if (days <= 3) return { text: `${days}D LEFT`, cn: `${days} 天截止`, danger: true };
  return { text: `${days}D LEFT`, cn: `${days} 天截止`, danger: false };
}

function fmtPlatforms(arr: string[]) {
  if (!Array.isArray(arr)) return '';
  return arr.map((p) => PLATFORM_LABELS[p] || p).join(' · ');
}

function fmtBudget(min: any, max: any) {
  const n = (v: any) => Number(v).toLocaleString();
  return `¥${n(min)} - ¥${n(max)}`;
}

async function load() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/creator/briefs', { params: { size: 50 } });
    briefs.value = data?.items ?? [];
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function openBrief(id: string) {
  router.push(`/creator/briefs/${id}`);
}

onMounted(async () => {
  if (!auth.hasAnyRole(['CREATOR'])) {
    toast.error('请用创作者账号登录');
    router.push('/login');
    return;
  }
  await load();
});
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">
    <div class="max-w-6xl mx-auto px-6 py-10">
      <!-- HEADER -->
      <div class="border-b border-ink pb-6 mb-8 flex items-end justify-between">
        <div>
          <div class="catalog-no mb-2">AIGC · BRIEFS · OPEN</div>
          <h1 class="font-display text-3xl tracking-wide">浏览需求</h1>
          <p class="text-xs text-ink/50 mt-1">所有公开需求 · 报价区间合理即可中标 · 24h 内响应</p>
        </div>
        <div class="flex items-center gap-2 text-xs">
          <span class="text-ink/50">共</span>
          <span class="font-mono text-xl">{{ briefs.length }}</span>
          <span class="text-ink/50">单</span>
        </div>
      </div>

      <!-- 品类过滤 -->
      <div class="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          @click="filterCategory = ''"
          class="px-4 py-1.5 border-0.5 text-xs transition"
          :class="!filterCategory ? 'border-stamp-red bg-stamp-red text-cream' : 'border-line bg-surface hover:border-ink/40'"
        >
          全部
        </button>
        <button
          v-for="(label, key) in CATEGORY_LABELS"
          :key="key"
          type="button"
          @click="filterCategory = key"
          class="px-4 py-1.5 border-0.5 text-xs transition"
          :class="filterCategory === key ? 'border-stamp-red bg-stamp-red text-cream' : 'border-line bg-surface hover:border-ink/40'"
        >
          {{ label }}
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-20 text-ink/40 text-xs">加载中…</div>

      <!-- 空状态 -->
      <div v-else-if="visibleBriefs.length === 0" class="text-center py-20 border-0.5 border-dashed border-ink/20">
        <div class="catalog-no mb-3">NO OPEN BRIEFS</div>
        <p class="text-sm text-ink/50">暂无开放需求,稍后再来看看</p>
      </div>

      <!-- BRIEF 列表 -->
      <div v-else class="grid gap-4">
        <article
          v-for="b in visibleBriefs"
          :key="b.id"
          class="plate paper-grain relative p-6 border-0.5 border-line bg-surface cursor-pointer hover:border-gold transition"
          @click="openBrief(b.id)"
        >
          <!-- 编号 + 截止时间(右上) -->
          <div class="absolute top-4 right-4 text-right">
            <div class="catalog-no" :class="timeLeft(b.deadlineAt).danger ? 'text-stamp-red' : 'text-ink/40'">
              {{ timeLeft(b.deadlineAt).text }}
            </div>
            <div class="text-[10px] text-ink/40 mt-0.5">{{ timeLeft(b.deadlineAt).cn }}</div>
          </div>

          <div class="catalog-no mb-2 text-gold">{{ CATEGORY_LABELS[b.category] || b.category }}</div>
          <h2 class="font-display text-xl pr-32 mb-2">{{ b.title }}</h2>
          <p v-if="b.description" class="text-sm text-ink/60 mb-4 line-clamp-2">{{ b.description }}</p>

          <!-- Tags -->
          <div class="flex flex-wrap items-center gap-2 text-[11px] text-ink/60">
            <span class="stamp">{{ PACKAGE_LABELS[b.packageTier] || b.packageTier }}</span>
            <span class="font-mono">{{ fmtPlatforms(b.platformSet) }}</span>
            <span class="text-ink/30">·</span>
            <span v-if="b.currentPrice" class="font-mono text-stamp-red font-medium">
              当前价 ¥{{ Number(b.currentPrice).toLocaleString('zh-CN') }}
            </span>
            <span v-else class="font-mono text-gold">{{ fmtBudget(b.budgetMin, b.budgetMax) }}</span>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>