<script setup lang="ts">
/**
 * Admin 质量评审 A/B 切流配置 — W2.5 D13-D14
 *
 * 控制 AI 自动评分的发布策略:
 * - mode='off'    完全关闭 (默认, 上线前保持)
 * - mode='shadow' 跑 + 落库 + 不影响下游决策 (用于校准对比)
 * - mode='active' 跑 + 落库 + AI decision 写入下游
 *
 * rolloutPct 0-100: 触发概率 (按 deliverableId hash 分桶)
 * 关联: docs/research/w25-calibration-2026-07.md §7
 */
import { computed, onMounted, ref } from 'vue';
import { qualityEvalAdminApi, type RolloutConfig } from '@/api/quality-eval';

const cfg = ref<RolloutConfig | null>(null);
const loading = ref(true);
const saving = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

const editMode = ref<'off' | 'shadow' | 'active'>('off');
const editPct = ref(0);
const editNote = ref('');

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    cfg.value = await qualityEvalAdminApi.getRollout();
    editMode.value = cfg.value.mode;
    editPct.value = cfg.value.rolloutPct;
    editNote.value = cfg.value.note ?? '';
  } catch (e: any) {
    console.error(e);
    errorMsg.value = e?.response?.data?.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const dirty = computed(() => {
  if (!cfg.value) return false;
  return (
    editMode.value !== cfg.value.mode ||
    editPct.value !== cfg.value.rolloutPct ||
    editNote.value !== (cfg.value.note ?? '')
  );
});

const preview = computed(() => {
  if (editMode.value === 'off') return '🛑 完全关闭 — 不跑 AI 评分';
  if (editMode.value === 'shadow') return `👻 Shadow — 跑 + 落库, 不影响决策 (${editPct.value}% 桶)`;
  return `🟢 Active — 跑 + 落库 + AI decision 写入下游 (${editPct.value}% 桶)`;
});

async function save() {
  if (!cfg.value) return;
  saving.value = true;
  errorMsg.value = '';
  successMsg.value = '';
  try {
    cfg.value = await qualityEvalAdminApi.updateRollout({
      mode: editMode.value,
      rolloutPct: editPct.value,
      note: editNote.value || undefined,
    });
    successMsg.value = '已保存';
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.message || '保存失败';
  } finally {
    saving.value = false;
  }
}

async function reset() {
  if (!cfg.value) return;
  editMode.value = cfg.value.mode;
  editPct.value = cfg.value.rolloutPct;
  editNote.value = cfg.value.note ?? '';
}

const modeColor: Record<string, string> = {
  off: 'bg-ink/10 text-ink/60',
  shadow: 'bg-amber-50 text-amber-700',
  active: 'bg-emerald-50 text-emerald-700',
};
const modeLabel: Record<string, string> = {
  off: 'OFF',
  shadow: 'SHADOW',
  active: 'ACTIVE',
};
</script>

<template>
  <section class="px-6 py-8 space-y-6 max-w-4xl">
    <header>
      <h1 class="text-2xl font-semibold text-ink">A/B 切流配置</h1>
      <p class="mt-2 text-sm text-ink/60">
        W2.5 AI 自动评分的发布策略 · D13-D14 · 改完会写 audit log
      </p>
    </header>

    <div v-if="loading" class="text-ink/60">加载中…</div>

    <div v-if="errorMsg" class="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
      {{ errorMsg }}
    </div>
    <div v-if="successMsg" class="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">
      {{ successMsg }}
    </div>

    <div v-if="!loading && cfg" class="space-y-6">
      <!-- 当前状态 -->
      <div class="rounded-lg border border-ink/10 bg-white p-4">
        <div class="text-xs text-ink/50 mb-2">当前状态</div>
        <div class="flex items-center gap-3">
          <span
            class="inline-block rounded px-3 py-1 text-sm font-semibold"
            :class="modeColor[cfg.mode]"
          >
            {{ modeLabel[cfg.mode] }}
          </span>
          <span class="text-2xl font-bold tabular-nums">{{ cfg.rolloutPct }}%</span>
          <span class="text-xs text-ink/50 ml-auto">
            最近更新: {{ cfg.updatedAt ? new Date(cfg.updatedAt).toLocaleString('zh-CN') : '—' }}
            <span v-if="cfg.updatedBy"> · by {{ cfg.updatedBy.slice(0, 8) }}</span>
          </span>
        </div>
        <div v-if="cfg.note" class="mt-3 text-xs text-ink/60">
          备注: {{ cfg.note }}
        </div>
      </div>

      <!-- 编辑表单 -->
      <form @submit.prevent="save" class="rounded-lg border border-ink/10 bg-white p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium mb-2">Mode</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              v-for="m in ['off', 'shadow', 'active'] as const"
              :key="m"
              @click="editMode = m"
              class="px-4 py-3 border-0.5 text-sm font-mono text-left"
              :class="editMode === m
                ? 'border-stamp-red bg-stamp-red text-cream'
                : 'border-line hover:border-ink/40'"
            >
              <div class="font-semibold">{{ modeLabel[m] }}</div>
              <div class="text-[10px] mt-0.5 opacity-80">
                {{ m === 'off' ? '完全关闭' : m === 'shadow' ? '跑+落库,不影响决策' : '跑+写决策' }}
              </div>
            </button>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">
            Rollout %
            <span class="text-xs text-ink/40 ml-2">(按 deliverableId hash 分桶)</span>
          </label>
          <div class="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              v-model.number="editPct"
              class="flex-1"
              :disabled="editMode === 'off'"
            />
            <input
              type="number"
              min="0"
              max="100"
              v-model.number="editPct"
              class="w-20 rounded border border-ink/20 px-2 py-1 text-sm text-right tabular-nums"
              :disabled="editMode === 'off'"
            />
            <span class="text-sm">%</span>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">备注 (optional)</label>
          <input
            type="text"
            v-model="editNote"
            placeholder="例: D13 A/B 启动 / SRCC 校准后开启 / 紧急回滚"
            class="w-full rounded border border-ink/20 px-3 py-2 text-sm"
          />
        </div>

        <div class="rounded bg-ink/5 p-3 text-xs">
          预览: <span class="font-mono">{{ preview }}</span>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            @click="reset"
            :disabled="!dirty || saving"
            class="px-4 py-2 border-0.5 border-ink/30 text-sm disabled:opacity-40"
          >
            还原
          </button>
          <button
            type="submit"
            :disabled="!dirty || saving"
            class="px-5 py-2 bg-stamp-red text-cream text-sm tracking-widest uppercase disabled:opacity-40"
          >
            {{ saving ? '保存中…' : '保存配置' }}
          </button>
        </div>
      </form>

      <!-- 上线手册 -->
      <div class="rounded-lg border border-ink/10 bg-white p-4 text-xs space-y-2 text-ink/70">
        <div class="font-medium text-ink">上线节奏 (W2.5 决策 #4)</div>
        <ol class="list-decimal list-inside space-y-1 pl-2">
          <li><b>默认 off</b> — 上线时保持, 任何 AI 评分只通过 admin POST /quality-eval/run 手动触发</li>
          <li>攒够 50+ 人评,跑 <code>scripts/quality-eval-calibrate.ts</code>,SRCC ≥ 0.75</li>
          <li>切 <b>shadow 10%</b> 跑 1 周,对比 AI 与人工,无 regression</li>
          <li>→ shadow 50% (1 周) → active 50% (1 周) → active 100%</li>
          <li>每月跑一次 SRCC drift 检测 (脚本可 cron 化)</li>
        </ol>
      </div>
    </div>
  </section>
</template>