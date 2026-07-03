<script setup lang="ts">
/**
 * Admin 质量评审队列 (D8-D9)
 *
 * 关联: docs/research/quality-eval-benchmark-2026.md §1 / §8.2 / §9
 * 列表按 grade/decision 过滤, 支持跳详情看 4 层 JSON
 *
 * 后续 (W3+): 加批量 approve/reject / 申诉复审表单 / SRCC 校准助手
 */
import { computed, onMounted, ref, watch } from 'vue';
import {
  qualityEvalAdminApi,
  type EvalDecision,
  type QualityEvalQueueItem,
  type SabcGrade,
} from '@/api/quality-eval';

const items = ref<QualityEvalQueueItem[]>([]);
const loading = ref(true);
const total = ref(0);
const filterGrade = ref<SabcGrade | ''>('');
const filterDecision = ref<EvalDecision | ''>('');
const page = ref(1);
const pageSize = 20;

const dashboard = ref<{
  totalCount: number;
  last7dCount: number;
  byGrade: Record<string, number>;
  byDecision: Record<string, number>;
  appealPending: number;
} | null>(null);

const gradeColor: Record<SabcGrade, string> = {
  S: 'bg-emerald-100 text-emerald-800',
  A: 'bg-sky-100 text-sky-800',
  B: 'bg-amber-100 text-amber-800',
  C: 'bg-rose-100 text-rose-800',
};
const decisionColor: Record<EvalDecision, string> = {
  PASS: 'bg-emerald-50 text-emerald-700',
  REVIEW: 'bg-amber-50 text-amber-700',
  FAIL: 'bg-rose-50 text-rose-700',
};

async function load() {
  loading.value = true;
  try {
    const r = await qualityEvalAdminApi.queue({
      grade: filterGrade.value || undefined,
      decision: filterDecision.value || undefined,
      page: page.value,
      pageSize,
    });
    items.value = r.items;
    total.value = r.total;
  } catch (e: any) {
    console.error('[quality-eval queue] failed', e?.response?.data || e);
    items.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function loadDashboard() {
  try {
    dashboard.value = await qualityEvalAdminApi.dashboard();
  } catch (e) {
    console.warn('[quality-eval dashboard] failed', e);
  }
}

onMounted(() => {
  load();
  loadDashboard();
});

watch([filterGrade, filterDecision], () => {
  page.value = 1;
  load();
});

watch(page, () => load());

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('zh-CN', { hour12: false });
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
</script>

<template>
  <section class="px-6 py-8 space-y-6">
    <header>
      <h1 class="text-2xl font-semibold text-ink">质量评审</h1>
      <p class="mt-2 text-sm text-ink/60">
        W2.5 AI 4 层评分 (技术 / 美学 / 合规 / 商业价值) · S/A/B/C 分级 · 评分公开
      </p>
    </header>

    <!-- Dashboard 统计 -->
    <div v-if="dashboard" class="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div class="rounded-lg border border-ink/10 bg-white p-4">
        <div class="text-xs text-ink/50">总评分数</div>
        <div class="mt-1 text-2xl font-semibold">{{ dashboard.totalCount }}</div>
      </div>
      <div class="rounded-lg border border-ink/10 bg-white p-4">
        <div class="text-xs text-ink/50">近 7 天</div>
        <div class="mt-1 text-2xl font-semibold">{{ dashboard.last7dCount }}</div>
      </div>
      <div class="rounded-lg border border-ink/10 bg-white p-4">
        <div class="text-xs text-ink/50">S / A 分布</div>
        <div class="mt-1 text-lg">
          <span class="font-semibold text-emerald-700">{{ dashboard.byGrade.S || 0 }}</span>
          <span class="mx-1 text-ink/40">/</span>
          <span class="font-semibold text-sky-700">{{ dashboard.byGrade.A || 0 }}</span>
        </div>
      </div>
      <div class="rounded-lg border border-ink/10 bg-white p-4">
        <div class="text-xs text-ink/50">B / C 分布</div>
        <div class="mt-1 text-lg">
          <span class="font-semibold text-amber-700">{{ dashboard.byGrade.B || 0 }}</span>
          <span class="mx-1 text-ink/40">/</span>
          <span class="font-semibold text-rose-700">{{ dashboard.byGrade.C || 0 }}</span>
        </div>
      </div>
      <div class="rounded-lg border border-rose-200 bg-rose-50 p-4">
        <div class="text-xs text-rose-700">待复审申诉</div>
        <div class="mt-1 text-2xl font-semibold text-rose-700">{{ dashboard.appealPending }}</div>
      </div>
    </div>

    <!-- 过滤器 -->
    <div class="flex flex-wrap gap-3 items-center">
      <div class="flex items-center gap-2">
        <label class="text-sm text-ink/60">等级</label>
        <select v-model="filterGrade" class="rounded border border-ink/20 px-2 py-1 text-sm">
          <option value="">全部</option>
          <option value="S">S</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-sm text-ink/60">决策</label>
        <select v-model="filterDecision" class="rounded border border-ink/20 px-2 py-1 text-sm">
          <option value="">全部</option>
          <option value="PASS">PASS</option>
          <option value="REVIEW">REVIEW</option>
          <option value="FAIL">FAIL</option>
        </select>
      </div>
      <div class="ml-auto text-sm text-ink/60">
        共 {{ total }} 条 · 第 {{ page }} / {{ totalPages }} 页
      </div>
    </div>

    <!-- 列表 -->
    <div class="rounded-lg border border-ink/10 bg-white overflow-hidden">
      <table class="min-w-full text-sm">
        <thead class="bg-ink/5 text-ink/70">
          <tr>
            <th class="px-4 py-2 text-left font-medium">评分 ID</th>
            <th class="px-4 py-2 text-left font-medium">Brief</th>
            <th class="px-4 py-2 text-left font-medium">L1 / L2 / L3 / L4</th>
            <th class="px-4 py-2 text-left font-medium">综合</th>
            <th class="px-4 py-2 text-left font-medium">等级</th>
            <th class="px-4 py-2 text-left font-medium">决策</th>
            <th class="px-4 py-2 text-left font-medium">触发</th>
            <th class="px-4 py-2 text-left font-medium">申诉</th>
            <th class="px-4 py-2 text-left font-medium">创建时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="9" class="px-4 py-8 text-center text-ink/50">加载中…</td>
          </tr>
          <tr v-else-if="!items.length">
            <td colspan="9" class="px-4 py-8 text-center text-ink/50">暂无评分记录</td>
          </tr>
          <tr
            v-for="it in items"
            :key="it.id"
            class="border-t border-ink/5 hover:bg-ink/3 cursor-pointer"
            @click="$router.push({ name: 'quality-eval-detail', params: { id: it.id } })"
          >
            <td class="px-4 py-2 font-mono text-xs">{{ it.id.slice(0, 10) }}</td>
            <td class="px-4 py-2 font-mono text-xs">{{ it.briefId.slice(0, 10) }}</td>
            <td class="px-4 py-2 text-xs tabular-nums">
              {{ it.l1Score.toFixed(2) }} / {{ it.l2Score.toFixed(2) }} /
              <span :class="it.l3Score === 0 ? 'text-rose-700 font-semibold' : ''">
                {{ it.l3Score.toFixed(2) }}
              </span>
              / {{ it.l4Score.toFixed(2) }}
            </td>
            <td class="px-4 py-2 font-semibold tabular-nums">
              {{ it.compositeScore.toFixed(3) }}
            </td>
            <td class="px-4 py-2">
              <span
                class="inline-block rounded px-2 py-0.5 text-xs font-semibold"
                :class="gradeColor[it.grade]"
              >
                {{ it.grade }}
              </span>
            </td>
            <td class="px-4 py-2">
              <span
                class="inline-block rounded px-2 py-0.5 text-xs font-medium"
                :class="decisionColor[it.decision]"
              >
                {{ it.decision }}
              </span>
            </td>
            <td class="px-4 py-2 text-xs text-ink/60">{{ it.trigger }}</td>
            <td class="px-4 py-2 text-xs">
              <span v-if="it.appealDecision" class="text-emerald-700">{{ it.appealDecision }}</span>
              <span v-else-if="it.appealedAt" class="text-amber-700">待复审</span>
              <span v-else class="text-ink/40">—</span>
            </td>
            <td class="px-4 py-2 text-xs text-ink/60">{{ fmtDate(it.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 分页 -->
    <div class="flex justify-between items-center">
      <button
        class="px-3 py-1 rounded border border-ink/20 disabled:opacity-40 text-sm"
        :disabled="page <= 1"
        @click="page--"
      >
        上一页
      </button>
      <button
        class="px-3 py-1 rounded border border-ink/20 disabled:opacity-40 text-sm"
        :disabled="page >= totalPages"
        @click="page++"
      >
        下一页
      </button>
    </div>
  </section>
</template>