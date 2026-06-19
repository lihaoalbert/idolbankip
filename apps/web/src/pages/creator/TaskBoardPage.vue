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
  if (days < 0) return { text: '已截止', danger: true };
  if (days === 0) return { text: '今天截止', danger: true };
  if (days <= 3) return { text: `${days} 天后截止`, danger: true };
  return { text: `${days} 天后截止`, danger: false };
}

async function loadOpen() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/tasks');
    openTasks.value = data || [];
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
    myAccepts.value = data || [];
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function load() {
  if (tab.value === 'open') await loadOpen();
  else await loadMine();
}

async function accept(task: any) {
  if (!confirm(`确认接单「${task.title}」? 接单后可提交 IP, 版权归平台`)) return;
  acting.value = task.id;
  try {
    await apiClient.post(`/tasks/${task.id}/accept`);
    toast.success('接单成功,可前往提交 IP');
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
  <div class="max-w-6xl mx-auto px-6 py-10 space-y-6">
    <div class="flex items-baseline justify-between">
      <h1 class="font-display text-3xl">任务板</h1>
      <RouterLink to="/creator" class="text-xs text-ink/60 hover:text-gold transition">← 返回创作者中心</RouterLink>
    </div>
    <p class="text-sm text-ink/60">平台发布的官方形象征集任务,接单后版权归平台,审核通过后获得报酬。</p>

    <!-- Tabs -->
    <div class="flex items-center gap-2 border-b border-line">
      <button
        @click="switchTab('open')"
        :class="[
          'px-4 py-2 text-sm font-medium transition border-b-2 -mb-px',
          tab === 'open' ? 'border-gold text-ink' : 'border-transparent text-ink/50 hover:text-ink',
        ]"
      >可接任务</button>
      <button
        @click="switchTab('mine')"
        :class="[
          'px-4 py-2 text-sm font-medium transition border-b-2 -mb-px',
          tab === 'mine' ? 'border-gold text-ink' : 'border-transparent text-ink/50 hover:text-ink',
        ]"
      >我接的</button>
    </div>

    <!-- 任务卡片网格 -->
    <div v-if="loading" class="text-center text-sm text-ink/50 py-8">加载中…</div>
    <div v-else-if="tab === 'open' && openTasks.length === 0" class="text-center py-12 bg-cream/40 rounded-2xl">
      <div class="text-3xl mb-2">📭</div>
      <div class="text-sm text-ink/60">暂无可接任务,下批任务敬请期待</div>
    </div>
    <div v-else-if="tab === 'mine' && myAccepts.length === 0" class="text-center py-12 bg-cream/40 rounded-2xl">
      <div class="text-3xl mb-2">📭</div>
      <div class="text-sm text-ink/60">你还没接过任务</div>
      <button @click="switchTab('open')" class="mt-3 text-xs text-gold hover:underline">去看看 →</button>
    </div>
    <div v-else class="grid md:grid-cols-2 gap-4">
      <!-- 任务板卡片 -->
      <div
        v-for="t in (tab === 'open' ? openTasks : myAccepts)"
        :key="t.id"
        class="bg-surface rounded-2xl border border-line p-5 hover:border-gold/50 transition"
      >
        <div class="flex items-start justify-between gap-2 mb-2">
          <h3 class="font-medium text-lg flex-1 min-w-0">{{ t.title }}</h3>
          <span
            v-if="tab === 'open' && daysLeft(t.deadlineAt).danger"
            class="shrink-0 text-xs px-2 py-0.5 bg-danger/10 text-danger rounded-full"
          >{{ daysLeft(t.deadlineAt).text }}</span>
          <span
            v-else-if="tab === 'open'"
            class="shrink-0 text-xs px-2 py-0.5 bg-success/10 text-success rounded-full"
          >{{ daysLeft(t.deadlineAt).text }}</span>
        </div>
        <p class="text-sm text-ink/70 leading-relaxed line-clamp-3 mb-3 whitespace-pre-line">
          {{ t.description }}
        </p>
        <div class="text-xs text-ink/60 mb-3 p-2 bg-cream/60 rounded-lg">
          <span class="font-medium">规格:</span> {{ fmtSpec(t.spec) || '不限' }}
        </div>
        <div class="flex items-center justify-between text-xs text-ink/50 flex-wrap gap-2">
          <div class="flex items-center gap-3">
            <span class="text-ink font-mono text-base">¥{{ (t.perIpFen ? t.perIpFen / 100 : t.budgetFen / 100).toFixed(0) }}<span class="text-xs text-ink/50">{{ t.perIpFen ? ' / IP' : ' 总预算' }}</span></span>
            <span v-if="tab === 'open'">{{ t.acceptedCount || 0 }}/{{ t.maxAccepts }} 已接</span>
            <span v-else>已交 {{ t.submittedCount }} 个</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="tab === 'open' && !t.acceptedByMe"
              @click="accept(t)"
              :disabled="acting === t.id"
              class="px-4 py-1.5 bg-ink text-cream rounded-full text-xs font-medium hover:bg-gold transition disabled:opacity-50"
            >{{ acting === t.id ? '接单中...' : '接单' }}</button>
            <span
              v-if="tab === 'open' && t.acceptedByMe"
              class="text-xs px-3 py-1 bg-success/15 text-success rounded-full"
            >已接单</span>
            <button
              v-if="(tab === 'open' && t.acceptedByMe) || tab === 'mine'"
              @click="goSubmit(t.task?.id || t.id)"
              class="px-4 py-1.5 border border-gold text-gold rounded-full text-xs font-medium hover:bg-gold hover:text-ink transition"
            >{{ t.submittedCount > 0 ? '继续提交' : '提交 IP' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
