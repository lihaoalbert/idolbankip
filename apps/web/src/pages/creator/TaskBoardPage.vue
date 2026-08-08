<script setup lang="ts">
/**
 * #30 创作者任务板 — 浏览 OPEN 任务 + 我接过的任务
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';

const router = useRouter();
const toast = useToast();

const tab = ref<'open' | 'mine'>('open');
const openTasks = ref<any[]>([]);
const myAccepts = ref<any[]>([]);
const loading = ref(false);
const acting = ref<string | null>(null);

const genderLabel: Record<string, string> = { FEMALE: '女', MALE: '男', NONBINARY: '无性别' };
const ageLabel: Record<string, string> = { CHILD: '童颜', YOUNG: '青年', MIDDLE: '中年', ELDERLY: '银发' };
const ethLabel: Record<string, string> = {
  EAST_ASIAN: '东亚', SOUTHEAST_ASIAN: '东南亚', SOUTH_ASIAN: '南亚',
  AFRICAN: '非洲', EUROPEAN: '欧洲', MIXED: '混合/其他',
};

const now = ref(Date.now());

function fmtSpec(spec: any) {
  if (!spec) return '';
  const parts: string[] = [];
  if (spec.gender) parts.push(genderLabel[spec.gender] || spec.gender);
  if (spec.ageBuckets?.length) parts.push(spec.ageBuckets.map((a: string) => ageLabel[a] || a).join('/'));
  if (spec.ethnicities?.length) parts.push(spec.ethnicities.map((e: string) => ethLabel[e] || e).join('/'));
  if (spec.styleTags?.length) parts.push(spec.styleTags.join('·'));
  if (spec.scenarioTags?.length) parts.push(spec.scenarioTags.join('·'));
  if (spec.count) parts.push(`期望 ${spec.count} 个`);
  return parts.join(' · ');
}

function daysLeft(deadlineAt: string) {
  const ms = new Date(deadlineAt).getTime() - now.value;
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days < 0) return { text: 'EXPIRED', cn: '已截止', danger: true };
  if (days === 0) return { text: 'TODAY', cn: '今天截止', danger: true };
  if (days <= 3) return { text: `${days}D LEFT`, cn: `${days} 天后截止`, danger: true };
  return { text: `${days}D LEFT`, cn: `${days} 天后截止`, danger: false };
}

async function loadOpen() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/tasks');
    openTasks.value = Array.isArray(data) ? data : data?.items || [];
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadMine() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/tasks/my/accepts');
    myAccepts.value = Array.isArray(data) ? data : [];
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

const visibleTasks = computed(() => {
  if (tab.value === 'open') return openTasks.value;
  return myAccepts.value.map((a) => ({
    ...a.task,
    acceptedAt: a.acceptedAt,
    submittedCount: a.submittedCount,
    acceptedByMe: true,
  }));
});

async function load() {
  if (tab.value === 'open') await loadOpen();
  else await loadMine();
}

async function accept(task: any) {
  if (!confirm(`确认接单「${task.title}」? 接单后可提交 IP, 版权归平台`)) return;
  acting.value = task.id;
  try {
    await apiClient.post(`/tasks/${task.id}/accept`);
    toast.success('接单成功, 可前往提交 IP');
    router.push(`/creator/ips/new?taskId=${task.id}`);
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '接单失败');
  } finally {
    acting.value = null;
  }
}

function goSubmit(taskId: string) {
  router.push(`/creator/ips/new?taskId=${taskId}`);
}

function switchTab(t: 'open' | 'mine') {
  tab.value = t;
  load();
}

onMounted(() => {
  now.value = Date.now();
  load();
});
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <!-- 顶部条 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">IBIren · TASK BOARD</div>
        <div class="catalog-no text-ink/40">VOL. I — COMMISSIONS</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-[1320px] mx-auto px-6 lg:px-10 py-10 md:py-14">
      <!-- 返回捏者中心 -->
      <RouterLink to="/creator" class="catalog-no text-ink/50 hover:text-gold transition inline-flex items-center gap-2 mb-6">
        <span>←</span><span>RETURN TO CREATOR CENTER</span>
      </RouterLink>

      <!-- 章节头 -->
      <div class="grid grid-cols-12 gap-4 mb-8">
        <div class="col-span-3 catalog-no text-ink/50">№ 031</div>
        <div class="col-span-3 col-start-5 catalog-no text-ink/50">CHAPTER XXXI — COMMISSIONS</div>
        <div class="col-span-3 col-start-9 catalog-no text-ink/50">OFFICIAL BRIEFS</div>
        <div class="col-span-3 col-start-12 catalog-no text-ink/50 text-right hidden md:block">{{ visibleTasks.length }} ACTIVE</div>
      </div>

      <div class="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <h1 class="font-display text-5xl md:text-7xl text-ink leading-[0.95]">
            任务<span class="font-display-italic text-gold">板</span>
          </h1>
          <p class="mt-3 text-sm text-ink/60 max-w-xl leading-relaxed">
            平台发布的官方形象征集任务 · 接单后版权归平台 ·
            审核通过后获得报酬。
          </p>
        </div>
        <RouterLink to="/creator" class="catalog-no text-ink/50 hover:text-gold transition inline-flex items-center gap-2">
          <span>←</span><span>RETURN TO STUDIO</span>
        </RouterLink>
      </div>

      <!-- Tabs · 像图录版次切换 -->
      <div class="flex items-stretch border-0.5 border-ink mb-10">
        <button
          @click="switchTab('open')"
          :class="[
            'flex-1 px-5 py-3 catalog-no transition border-r-0.5 border-ink',
            tab === 'open' ? 'bg-ink text-cream' : 'text-ink/60 hover:bg-ink hover:text-cream'
          ]"
        >
          OPEN · 可接任务
        </button>
        <button
          @click="switchTab('mine')"
          :class="[
            'flex-1 px-5 py-3 catalog-no transition',
            tab === 'mine' ? 'bg-ink text-cream' : 'text-ink/60 hover:bg-ink hover:text-cream'
          ]"
        >
          MINE · 我接的
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="grid md:grid-cols-2 gap-6">
        <div v-for="i in 4" :key="i" class="bg-surface border-0.5 border-ink p-6 space-y-4">
          <Skeleton shape="line" width="70%" height-class="h-5" />
          <Skeleton shape="line" :lines="3" />
          <Skeleton shape="line" width="40%" height-class="h-3" />
        </div>
      </div>

      <!-- Empty open -->
      <div v-else-if="tab === 'open' && openTasks.length === 0" class="py-24 text-center bg-surface border-0.5 border-line">
        <div class="catalog-no text-ink/40 mb-3">— EMPTY BOARD —</div>
        <div class="font-display text-xl text-ink/60">暂无可接任务</div>
        <div class="text-sm text-ink/40 mt-2 catalog-no">下批任务敬请期待</div>
      </div>

      <!-- Empty mine -->
      <div v-else-if="tab === 'mine' && myAccepts.length === 0" class="py-24 text-center bg-surface border-0.5 border-line">
        <div class="catalog-no text-ink/40 mb-3">— NO COMMISSIONS YET —</div>
        <div class="font-display text-xl text-ink/60 mb-3">你还没接过任务</div>
        <button @click="switchTab('open')" class="catalog-no text-gold hover:underline">去看看 →</button>
      </div>

      <!-- 任务卡片 grid -->
      <div v-else class="grid md:grid-cols-2 gap-6">
        <article
          v-for="(t, idx) in visibleTasks"
          :key="t.id"
          class="bg-surface border-0.5 border-ink p-6 md:p-7 relative hover:border-gold transition group"
        >
          <div class="absolute -top-3 left-6">
            <div class="stamp text-gold border-gold bg-cream">№ {{ String(idx + 1).padStart(3, '0') }}</div>
          </div>

          <header class="flex items-start justify-between gap-3 mb-3">
            <h3 class="font-display text-xl text-ink leading-tight flex-1">{{ t.title }}</h3>
            <span
              v-if="tab === 'open'"
              :class="[
                'shrink-0 catalog-no text-xs px-2 py-1',
                daysLeft(t.deadlineAt).danger ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
              ]"
            >
              {{ daysLeft(t.deadlineAt).text }}
            </span>
            <span
              v-else-if="t.acceptedByMe"
              class="shrink-0 catalog-no text-xs px-2 py-1 bg-success/10 text-success"
            >
              ACCEPTED
            </span>
          </header>

          <p class="text-sm text-ink/70 leading-relaxed line-clamp-3 mb-4 whitespace-pre-line">{{ t.description }}</p>

          <div class="mb-4 p-3 bg-cream border-0.5 border-line catalog-no text-xs">
            <span class="text-ink/50 mr-2">SPEC · 规格</span>
            <span class="text-ink/80">{{ fmtSpec(t.spec) || '不限' }}</span>
          </div>

          <footer class="hairline-t border-line pt-4 flex items-center justify-between flex-wrap gap-3">
            <div class="flex items-baseline gap-4">
              <div class="font-display text-2xl text-ink">
                ¥{{ (t.perIpFen ? t.perIpFen / 100 : t.budgetFen / 100).toFixed(0) }}
                <span class="catalog-no text-xs text-ink/50 ml-1">{{ t.perIpFen ? '/ IP' : 'TOTAL' }}</span>
              </div>
              <div class="catalog-no text-xs text-ink/50">
                {{ tab === 'open' ? `${t.acceptedCount || 0}/${t.maxAccepts} ACCEPTED` : `${t.submittedCount} SUBMITTED` }}
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="tab === 'open' && !t.acceptedByMe"
                @click="accept(t)"
                :disabled="acting === t.id"
                class="inline-flex items-center gap-2 px-4 py-2 bg-ink text-cream hover:bg-gold transition catalog-no text-xs disabled:opacity-50"
              >
                {{ acting === t.id ? 'ACCEPTING…' : 'ACCEPT' }}
              </button>
              <button
                v-if="(tab === 'open' && t.acceptedByMe) || tab === 'mine'"
                @click="goSubmit(t.id)"
                class="inline-flex items-center gap-2 px-4 py-2 border-0.5 border-gold text-gold hover:bg-gold hover:text-ink transition catalog-no text-xs"
              >
                {{ t.submittedCount > 0 ? 'CONTINUE' : 'SUBMIT IP' }}
                <span class="font-display-italic">→</span>
              </button>
            </div>
          </footer>
        </article>
      </div>
    </main>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line mt-12">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. COMM-031</span>
        <span>SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>
