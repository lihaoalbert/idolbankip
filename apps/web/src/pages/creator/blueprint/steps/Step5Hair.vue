<script setup lang="ts">
/**
 * Step 5 — L5 毛发 (Hair)
 *
 * 8 项:发型/发色/发际线/眉形/眉色/眉密度/睫毛/鬓角
 * 数据来源:BlueprintContext (与 Step1/Step2/Step3 一致)
 */
import { computed, inject, ref, watch } from 'vue';
import {
  L5_DEFAULTS,
  L5_SELECT_FIELDS,
  L5_SLIDER_FIELDS,
  type L5Hair,
} from '@/api/blueprint';
import { useToast } from '@/composables/useToast';
import { useBlueprintDraft } from '@/composables/useBlueprintDraft';
import { useStepInferred } from '@/composables/useStepInferred';
import InferredChip from '@/components/blueprint/InferredChip.vue';
import { BlueprintKey } from '../context';

const props = defineProps<{ blueprintId: string }>();
const toast = useToast();

const ctx = inject(BlueprintKey);
if (!ctx) throw new Error('Step5Hair must be inside BlueprintWizard (BlueprintKey not provided)');
const blueprintCtx = ctx;

const form = ref<L5Hair>({ ...L5_DEFAULTS });
const saving = ref(false);
const lastSavedAt = ref<string | null>(null);

const draft = useBlueprintDraft<L5Hair>({
  blueprintId: props.blueprintId,
  step: 5,
  serverData: ref<L5Hair | null>(null),
  formData: form,
});

const draftRestored = draft.draftRestored;

// R8 修:挂载时从 localStorage 恢复草稿
// R8.2 修:同步调用,避免 server 同步先跑覆盖草稿
draft.load();

watch(
  () => blueprintCtx.blueprint.value?.layers.L5_hair,
  (serverLayer) => {
    if (!serverLayer || draftRestored.value) return;
    form.value = { ...form.value, ...(serverLayer as unknown as L5Hair) };
  },
  { immediate: true },
);

const fillPercent = computed(() => {
  let n = 0;
  for (const f of L5_SLIDER_FIELDS) {
    const v = (form.value as any)[f.key];
    if (typeof v === 'number') n += 1;
  }
  for (const f of L5_SELECT_FIELDS) {
    const v = (form.value as any)[f.key];
    if (typeof v === 'string' && v.length > 0) n += 1;
  }
  return Math.round((n / 8) * 100);
});

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 800);
}

async function persist() {
  if (saving.value) return;
  saving.value = true;
  try {
    await blueprintCtx.updateLayer(5, form.value as unknown as Record<string, unknown>);
    lastSavedAt.value = new Date().toLocaleTimeString('zh-CN');
    draft.clearDraft();
  } catch (err: any) {
    const detail = err?.response?.data?.error?.message ?? err?.message ?? '未知错误';
    toast.error('保存失败: ' + detail);
  } finally {
    saving.value = false;
  }
}

async function saveNow() {
  if (saveTimer) clearTimeout(saveTimer);
  await persist();
}

function onFieldChange() {
  scheduleSave();
}

function formatPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

// Track B Round 3 — 本层是否由 AI 从参考图反推
const isLayerInferred = useStepInferred(blueprintCtx, 'L5_hair');
</script>

<template>
  <article class="paper-grain rounded-md border border-ink/15 bg-cream p-6 shadow-paper">
    <header class="mb-4 border-b border-ink/10 pb-3">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-mono text-xs uppercase tracking-widest text-ink/40">L5 / 8</p>
          <h2 class="font-display text-2xl text-ink">毛发 (Hair)</h2>
          <p class="mt-1 text-sm text-ink/60">
            8 项 — 发型、发色、眉睫鬓角
          </p>
        </div>
        <div class="text-right">
          <div class="text-xs text-ink/50">完成度</div>
          <div class="font-display text-2xl text-stamp-red">{{ fillPercent }}%</div>
          <div class="mt-1 flex items-center gap-2 text-xs">
            <span v-if="saving" class="text-ink/50">保存中…</span>
            <span v-else-if="lastSavedAt" class="text-ink/50">已存 {{ lastSavedAt }}</span>
            <button
              type="button"
              class="rounded border border-stamp-red px-2 py-1 text-stamp-red hover:bg-stamp-red hover:text-cream"
              @click="saveNow"
            >
              立即保存
            </button>
          </div>
        </div>
      </div>
      <div
        v-if="draftRestored"
        class="mt-2 rounded border border-gold/40 bg-gold/10 p-2 text-xs text-gold"
      >
        已从本地草稿恢复(刷新前未保存的修改);点 "立即保存" 同步到服务器。
        <button
          type="button"
          class="ml-2 underline hover:text-gold"
          @click="draft.discardDraft()"
        >
          丢弃草稿,改用服务器版本
        </button>
      </div>
      <!-- Track B Round 3:本层由 AI 反推 → 提示用户核对。任一字段被编辑后,_inferred 标记会被后端清掉,banner 自动消失。 -->
      <div
        v-if="isLayerInferred"
        class="mt-2 flex items-center gap-2 rounded border border-ink/20 bg-ink/5 px-3 py-1.5 text-xs text-ink/70"
        data-testid="layer-inferred-banner"
      >
        <span class="font-display text-sm font-semibold text-ink/80">AI 反推</span>
        <span>本层 8 项由 AI 从参考图反推(角标标记);请逐项核对,首次编辑任一字段后,角标自动消失。</span>
      </div>
    </header>

    <!-- 枚举字段(6 个 select) -->
    <section class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      <div v-for="f in L5_SELECT_FIELDS" :key="f.key">
        <label class="mb-1 block text-sm font-medium text-ink">
          {{ f.label }}
          <InferredChip v-if="isLayerInferred" />
        </label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="opt in f.options"
            :key="opt.value"
            type="button"
            class="rounded border px-3 py-1.5 text-sm transition"
            :class="(form as any)[f.key] === opt.value
              ? 'border-stamp-red bg-stamp-red text-cream'
              : 'border-ink/20 bg-paper hover:border-stamp-red/50'"
            @click="(form as any)[f.key] = opt.value; onFieldChange()"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </section>

    <!-- 数值 slider 字段(2 个) -->
    <section class="space-y-4">
      <div v-for="f in L5_SLIDER_FIELDS" :key="f.key">
        <div class="mb-1 flex items-baseline justify-between">
          <label class="text-sm font-medium text-ink">
            {{ f.label }}
            <InferredChip v-if="isLayerInferred" />
          </label>
          <span class="font-mono text-sm text-stamp-red">
            {{ formatPct((form as any)[f.key] ?? 0) }}
          </span>
        </div>
        <input
          type="range"
          :min="f.min"
          :max="f.max"
          :step="f.step"
          :value="(form as any)[f.key]"
          class="w-full accent-stamp-red"
          @input="(e) => { (form as any)[f.key] = Number((e.target as HTMLInputElement).value); onFieldChange(); }"
        />
        <p v-if="f.hint" class="mt-1 text-xs text-ink/40">{{ f.hint }}</p>
      </div>
    </section>
  </article>
</template>