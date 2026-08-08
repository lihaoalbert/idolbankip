<script setup lang="ts">
/**
 * Admin 评分详情 — 4 层 JSON 完整展示 + 申诉复审
 *
 * §9.1 决策 #1 (评分公开): evidence 必现
 * §9.1 决策 #6 (申诉 SLA 48h, 1 次): 复审表单只对 appealedAt 非空 且 appealDecision 空 显示
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { qualityEvalAdminApi } from '@/api/quality-eval';

const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id as string);

const detail = ref<any>(null);
const loading = ref(true);
const appealForm = ref({
  appealDecision: 'confirmed' as 'overridden' | 'confirmed',
  appealSummary: '',
  newScores: [0.7, 0.7, 0.7, 0.7] as number[],
});
const submitting = ref(false);

async function load() {
  loading.value = true;
  try {
    detail.value = await qualityEvalAdminApi.get(id.value);
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function submitAppeal() {
  if (!detail.value) return;
  submitting.value = true;
  try {
    const body: any = {
      appealDecision: appealForm.value.appealDecision,
      appealSummary: appealForm.value.appealSummary || undefined,
    };
    if (appealForm.value.appealDecision === 'overridden') {
      body.newScores = appealForm.value.newScores;
    }
    await qualityEvalAdminApi.appealDecision(id.value, body);
    await load();
  } catch (e: any) {
    alert(e?.response?.data?.message || e?.message || '复审失败');
  } finally {
    submitting.value = false;
  }
}

const gateLabel = computed(() => {
  if (!detail.value) return '';
  if (detail.value.gateReason === 'compliance_fatal') return '合规致命 — L3 闸门触发';
  if (detail.value.gateReason === 'technical_below_threshold') return '技术不达标 (L1<0.60)';
  return '正常评分';
});

function formatJson(j: any) {
  if (!j) return '{}';
  try {
    return JSON.stringify(j, null, 2);
  } catch {
    return String(j);
  }
}
</script>

<template>
  <section class="px-6 py-8 space-y-6 max-w-5xl">
    <div class="flex items-center gap-3">
      <button class="text-sm text-ink/60 hover:text-ink" @click="router.back()">← 返回</button>
      <h1 class="text-xl font-semibold text-ink">评分详情</h1>
      <span v-if="detail" class="font-mono text-xs text-ink/50">{{ detail.id }}</span>
    </div>

    <div v-if="loading" class="text-ink/60">加载中…</div>

    <div v-else-if="detail" class="space-y-6">
      <!-- 概览 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="rounded-lg border border-ink/10 bg-white p-4">
          <div class="text-xs text-ink/50">综合分</div>
          <div class="mt-1 text-2xl font-bold">{{ detail.compositeScore.toFixed(3) }}</div>
        </div>
        <div class="rounded-lg border border-ink/10 bg-white p-4">
          <div class="text-xs text-ink/50">等级</div>
          <div class="mt-1 text-2xl font-bold">{{ detail.grade }}</div>
        </div>
        <div class="rounded-lg border border-ink/10 bg-white p-4">
          <div class="text-xs text-ink/50">决策</div>
          <div class="mt-1 text-2xl font-bold">{{ detail.decision }}</div>
        </div>
        <div class="rounded-lg border border-ink/10 bg-white p-4">
          <div class="text-xs text-ink/50">闸门</div>
          <div class="mt-1 text-sm">{{ gateLabel }}</div>
        </div>
      </div>

      <!-- 4 层评分 -->
      <div class="grid grid-cols-4 gap-3">
        <div class="rounded-lg border border-ink/10 bg-white p-3">
          <div class="text-xs text-ink/50">L1 技术</div>
          <div class="mt-1 text-xl font-semibold tabular-nums">{{ detail.l1Score.toFixed(2) }}</div>
        </div>
        <div class="rounded-lg border border-ink/10 bg-white p-3">
          <div class="text-xs text-ink/50">L2 美学</div>
          <div class="mt-1 text-xl font-semibold tabular-nums">{{ detail.l2Score.toFixed(2) }}</div>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="detail.l3Score === 0 ? 'border-rose-300 bg-rose-50' : 'border-ink/10 bg-white'"
        >
          <div class="text-xs text-ink/50">L3 合规</div>
          <div class="mt-1 text-xl font-semibold tabular-nums">{{ detail.l3Score.toFixed(2) }}</div>
        </div>
        <div class="rounded-lg border border-ink/10 bg-white p-3">
          <div class="text-xs text-ink/50">L4 商业价值</div>
          <div class="mt-1 text-xl font-semibold tabular-nums">{{ detail.l4Score.toFixed(2) }}</div>
        </div>
      </div>

      <!-- 元信息 -->
      <div class="rounded-lg border border-ink/10 bg-white p-4 text-sm space-y-2">
        <div><span class="text-ink/50">Brief:</span> <span class="font-mono text-xs">{{ detail.briefId }}</span></div>
        <div><span class="text-ink/50">Deliverable:</span> <span class="font-mono text-xs">{{ detail.deliverableId || '—' }}</span></div>
        <div><span class="text-ink/50">Trigger:</span> {{ detail.trigger }} · by {{ detail.triggeredBy }}</div>
        <div><span class="text-ink/50">模型版本:</span> <span class="font-mono text-xs">{{ JSON.stringify(detail.modelVersions) }}</span></div>
        <div><span class="text-ink/50">Disclaimer:</span> {{ detail.disclaimerVersion }}</div>
        <div><span class="text-ink/50">商业价值不达标:</span> {{ detail.commercialWarning ? '是' : '否' }}</div>
        <div><span class="text-ink/50">创建时间:</span> {{ new Date(detail.createdAt).toLocaleString('zh-CN') }}</div>
      </div>

      <!-- 4 层 JSON 详情 -->
      <details open class="rounded-lg border border-ink/10 bg-white p-4">
        <summary class="cursor-pointer font-medium">L1 技术质量 详情</summary>
        <pre class="mt-3 text-xs overflow-auto bg-ink/3 p-3 rounded">{{ formatJson(detail.l1Detail) }}</pre>
      </details>
      <details class="rounded-lg border border-ink/10 bg-white p-4">
        <summary class="cursor-pointer font-medium">L2 美学质量 详情</summary>
        <pre class="mt-3 text-xs overflow-auto bg-ink/3 p-3 rounded">{{ formatJson(detail.l2Detail) }}</pre>
      </details>
      <details class="rounded-lg border border-ink/10 bg-white p-4">
        <summary class="cursor-pointer font-medium">L3 合规质量 详情</summary>
        <pre class="mt-3 text-xs overflow-auto bg-ink/3 p-3 rounded">{{ formatJson(detail.l3Detail) }}</pre>
      </details>
      <details class="rounded-lg border border-ink/10 bg-white p-4">
        <summary class="cursor-pointer font-medium">L4 商业价值 详情</summary>
        <pre class="mt-3 text-xs overflow-auto bg-ink/3 p-3 rounded">{{ formatJson(detail.l4Detail) }}</pre>
      </details>

      <!-- 申诉 + 复审表单 -->
      <div class="rounded-lg border border-ink/10 bg-white p-4 space-y-3">
        <h3 class="font-medium">申诉状态</h3>
        <div v-if="!detail.appealedAt" class="text-ink/60 text-sm">用户尚未申诉</div>
        <div v-else-if="detail.appealDecision" class="space-y-2 text-sm">
          <div><span class="text-ink/50">申诉时间:</span> {{ new Date(detail.appealedAt).toLocaleString('zh-CN') }}</div>
          <div><span class="text-ink/50">申诉理由:</span> {{ detail.appealReason }}</div>
          <div><span class="text-ink/50">复审结论:</span> {{ detail.appealDecision }}</div>
          <div v-if="detail.appealSummary"><span class="text-ink/50">复审摘要:</span> {{ detail.appealSummary }}</div>
        </div>
        <form v-else class="space-y-3" @submit.prevent="submitAppeal">
          <div class="text-sm">
            <span class="text-ink/50">申诉时间:</span> {{ new Date(detail.appealedAt).toLocaleString('zh-CN') }}
          </div>
          <div class="text-sm">
            <span class="text-ink/50">申诉理由:</span> {{ detail.appealReason }}
          </div>
          <div class="space-y-1">
            <label class="block text-sm">复审决定</label>
            <select v-model="appealForm.appealDecision" class="rounded border border-ink/20 px-2 py-1 text-sm">
              <option value="confirmed">维持原分</option>
              <option value="overridden">推翻原分</option>
            </select>
          </div>
          <div class="space-y-1" v-if="appealForm.appealDecision === 'overridden'">
            <label class="block text-sm">调整后 4 层分数 (L1 / L2 / L3 / L4)</label>
            <div class="grid grid-cols-4 gap-2">
              <input
                v-for="(_, i) in appealForm.newScores"
                :key="i"
                type="number"
                step="0.05"
                min="0"
                max="1"
                v-model.number="appealForm.newScores[i]"
                class="rounded border border-ink/20 px-2 py-1 text-sm"
              />
            </div>
          </div>
          <div class="space-y-1">
            <label class="block text-sm">复审摘要</label>
            <textarea
              v-model="appealForm.appealSummary"
              rows="3"
              class="w-full rounded border border-ink/20 px-2 py-1 text-sm"
              placeholder="overridden 时必填, 说明调整依据"
            />
          </div>
          <button
            type="submit"
            :disabled="submitting"
            class="px-4 py-2 rounded bg-ink text-white text-sm disabled:opacity-40"
          >
            {{ submitting ? '提交中…' : '提交复审' }}
          </button>
        </form>
      </div>
    </div>
  </section>
</template>