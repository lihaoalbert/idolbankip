<script setup lang="ts">
/**
 * Step 8 — L8 评估 (Evaluation)
 *
 * R7 详: 8 维 sub-score → 3 维主分(originality/consistency/aesthetics)雷达图
 * 自动调 POST /blueprint/:id/evaluate 拿结果,显示雷达图 + 8 维 sub-score 表 + 矛盾组合
 * 用户不能直接改分(只展示不持久化),但可点"重新评估"重算
 *
 * Phase A Round 3 skeleton → Phase B R7 完整实现
 */
import { computed, inject, onMounted, ref } from 'vue';
import {
  blueprintApi,
  type EvaluationResult,
  type L8SubScores,
  type Contradiction,
} from '@/api/blueprint';
import { useToast } from '@/composables/useToast';
import RadarChart, { type RadarScore } from '@/components/blueprint/RadarChart.vue';
import { BlueprintKey } from '../context';

const props = defineProps<{ blueprintId: string }>();
const toast = useToast();

const ctx = inject(BlueprintKey);
if (!ctx) throw new Error('Step8Evaluate must be inside BlueprintWizard (BlueprintKey not provided)');
const blueprintCtx = ctx;

const evaluating = ref(false);
const result = ref<EvaluationResult | null>(null);

// 8 维 sub-score 元数据(label + 解释)
const SUB_SCORE_META: { key: keyof L8SubScores; label: string; hint: string }[] = [
  { key: 'L1_complexity', label: 'L1 骨骼复杂度', hint: '颅型/颧骨/下颌参数到典型值的距离' },
  { key: 'L2_expressiveness', label: 'L2 软组织表现力', hint: '脂肪/咬肌/颊脂等 6 项标准差' },
  { key: 'L3_distinctiveness', label: 'L3 五官独特性', hint: '眼/鼻/唇/耳 12 项极端度' },
  { key: 'L4_skin_realism', label: 'L4 皮肤真实感', hint: '雀斑/痣/皱纹/毛孔 + 极端肤色肤质' },
  { key: 'L5_hair_coverage', label: 'L5 毛发覆盖度', hint: '发型/发色/眉密度/鬓角组合' },
  { key: 'L6_decoration_completeness', label: 'L6 修饰完整度', hint: '妆容/唇色/配饰/3 滑块' },
  { key: 'L7_prompt_quality', label: 'L7 prompt 质量', hint: '中英 prompt 长度' },
  { key: 'L8_contradiction_bonus', label: 'L8 矛盾组合 bonus', hint: '矛盾组合数 × 0.5,激励另类脸' },
];

const radarScores = computed<RadarScore[]>(() => {
  if (!result.value) return [];
  return [
    { label: '原创度', value: result.value.scores.originality },
    { label: '一致性', value: result.value.scores.consistency },
    { label: '美学', value: result.value.scores.aesthetics },
  ];
});

const serverL8 = computed(() => blueprintCtx.blueprint.value?.layers.L8_evaluation as any);

async function runEvaluation() {
  if (evaluating.value) return;
  evaluating.value = true;
  try {
    const res = await blueprintApi.evaluate(props.blueprintId);
    result.value = res;
    // 触发 BlueprintContext 重新拉数据,这样 L8_evaluation layer 也能同步
    await blueprintCtx.refresh();
  } catch (err: any) {
    const detail = err?.response?.data?.error?.message ?? err?.message ?? '未知错误';
    toast.error('评估失败: ' + detail);
  } finally {
    evaluating.value = false;
  }
}

onMounted(async () => {
  // 优先用 server L8_evaluation(GPT eval 持久化)
  if (serverL8.value && serverL8.value.originality !== undefined) {
    result.value = {
      id: props.blueprintId,
      scores: {
        originality: serverL8.value.originality,
        consistency: serverL8.value.consistency,
        aesthetics: serverL8.value.aesthetics,
      },
      evaluated_at: serverL8.value.evaluatedAt ?? new Date().toISOString(),
      contradictions: [],
      sub_scores: serverL8.value.subScores,
    };
  } else {
    // 否则自动跑一次评估
    await runEvaluation();
  }
});

function contradictionLabel(c: Contradiction): string {
  return `${c.title} (${c.severity === 'warning' ? '⚠️' : 'ℹ️'})`;
}

function hasContradictionBonus(sub: L8SubScores | undefined): boolean {
  return (sub?.L8_contradiction_bonus ?? 0) > 0;
}
</script>

<template>
  <article class="paper-grain rounded-md border border-ink/15 bg-cream p-6 shadow-paper">
    <header class="mb-4 border-b border-ink/10 pb-3">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-mono text-xs uppercase tracking-widest text-ink/40">L8 / 8</p>
          <h2 class="font-display text-2xl text-ink">评估 (Evaluation)</h2>
          <p class="mt-1 text-sm text-ink/60">
            8 维参数 → 原创度 / 一致性 / 美学(mock 评分,Phase 3 接 FLAME)
          </p>
        </div>
        <div class="text-right">
          <div class="text-xs text-ink/50">状态</div>
          <div class="mt-1 flex items-center gap-2 text-xs">
            <span v-if="evaluating" class="text-ink/50">评估中…</span>
            <span v-else-if="result" class="text-ink/50">
              评估于 {{ new Date(result.evaluated_at).toLocaleString('zh-CN') }}
            </span>
            <button
              type="button"
              class="rounded border border-stamp-red px-2 py-1 text-stamp-red hover:bg-stamp-red hover:text-cream disabled:opacity-50"
              :disabled="evaluating"
              data-testid="reevaluate-btn"
              @click="runEvaluation"
            >
              重新评估
            </button>
          </div>
        </div>
      </div>
    </header>

    <div v-if="result" class="grid gap-6 lg:grid-cols-[280px_1fr]">
      <!-- 雷达图 -->
      <div class="flex flex-col items-center justify-start rounded border border-ink/10 bg-paper/50 p-4">
        <RadarChart :scores="radarScores" :size="240" />
        <p
          v-if="hasContradictionBonus(result.sub_scores)"
          class="mt-2 text-center text-xs text-stamp-red"
          data-testid="contradiction-bonus-tag"
        >
          ⭐ 矛盾组合 bonus 已生效
        </p>
      </div>

      <!-- 8 维 sub-score + 矛盾 -->
      <div>
        <h3 class="mb-2 text-sm font-medium text-ink">8 维 sub-score (0~1)</h3>
        <table class="w-full text-sm" data-testid="subscores-table">
          <thead>
            <tr class="border-b border-ink/10 text-left text-xs text-ink/50">
              <th class="py-1 pr-2">维度</th>
              <th class="py-1 pr-2">分值</th>
              <th class="py-1 pr-2">进度</th>
              <th class="py-1">说明</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="meta in SUB_SCORE_META"
              :key="meta.key"
              class="border-b border-ink/5"
              :data-testid="`subrow-${meta.key}`"
            >
              <td class="py-1 pr-2 font-mono text-xs">{{ meta.label }}</td>
              <td class="py-1 pr-2 font-mono text-xs">
                {{ ((result.sub_scores?.[meta.key] ?? 0)).toFixed(2) }}
              </td>
              <td class="py-1 pr-2">
                <div class="h-1.5 w-24 rounded bg-ink/10">
                  <div
                    class="h-full rounded transition-all"
                    :class="{
                      'bg-stamp-red': (result.sub_scores?.[meta.key] ?? 0) < 0.4,
                      'bg-yellow-500': (result.sub_scores?.[meta.key] ?? 0) >= 0.4 && (result.sub_scores?.[meta.key] ?? 0) < 0.7,
                      'bg-green-600': (result.sub_scores?.[meta.key] ?? 0) >= 0.7,
                    }"
                    :style="{ width: `${((result.sub_scores?.[meta.key] ?? 0) * 100).toFixed(0)}%` }"
                  />
                </div>
              </td>
              <td class="py-1 text-xs text-ink/50">{{ meta.hint }}</td>
            </tr>
          </tbody>
        </table>

        <!-- 矛盾组合 -->
        <div v-if="result.contradictions.length > 0" class="mt-4" data-testid="contradictions-section">
          <h3 class="mb-2 text-sm font-medium text-ink">
            矛盾组合 ({{ result.contradictions.length }})
          </h3>
          <ul class="space-y-1 text-xs">
            <li
              v-for="c in result.contradictions"
              :key="c.id"
              class="rounded border border-yellow-300 bg-yellow-50 px-2 py-1"
            >
              <span class="font-mono text-yellow-700">[{{ c.layer }}]</span>
              {{ contradictionLabel(c) }}
              <span class="ml-1 text-ink/50">— {{ c.description }}</span>
            </li>
          </ul>
        </div>
        <p v-else class="mt-4 text-xs text-ink/40" data-testid="no-contradictions">
          当前参数组合无矛盾,所有维度自洽。
        </p>
      </div>
    </div>

    <div
      v-else
      class="rounded border border-dashed border-ink/15 bg-paper/50 p-8 text-center text-sm text-ink/40"
    >
      评估准备中…
    </div>

    <p class="mt-4 text-xs text-ink/40">
      Mock 评分基于参数指纹,确定性可测;Phase 3 接入 FLAME / 3DMM 反推 + embedding 原创度后,会更准。
    </p>
  </article>
</template>
