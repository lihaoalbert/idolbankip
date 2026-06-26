<script setup lang="ts">
/**
 * Step 2 — L2 软组织 (Soft Tissue)
 *
 * 6 项: 皮下脂肪 / 咬肌 / 颊脂垫 / 眼窝深度 / 眉弓突出 / 法令纹
 * 数据来源:BlueprintContext,与 Step1 一致
 */
import { computed, inject, ref, watch } from 'vue';
import {
  L2_DEFAULTS,
  L2_SLIDER_FIELDS,
  type L2SoftTissue,
} from '@/api/blueprint';
import { useToast } from '@/composables/useToast';
import { useBlueprintDraft } from '@/composables/useBlueprintDraft';
import { useStepInferred } from '@/composables/useStepInferred';
import InferredChip from '@/components/blueprint/InferredChip.vue';
import { BlueprintKey } from '../context';

const props = defineProps<{ blueprintId: string }>();
const toast = useToast();

const ctx = inject(BlueprintKey);
if (!ctx) throw new Error('Step2SoftTissue must be inside BlueprintWizard (BlueprintKey not provided)');
const blueprintCtx = ctx;

const form = ref<L2SoftTissue>({ ...L2_DEFAULTS });
const saving = ref(false);
const lastSavedAt = ref<string | null>(null);

const draft = useBlueprintDraft<L2SoftTissue>({
  blueprintId: props.blueprintId,
  step: 2,
  serverData: ref<L2SoftTissue | null>(null),
  formData: form,
});

const draftRestored = draft.draftRestored;

// R8 修:挂载时从 localStorage 恢复草稿
// R8.2 修:同步调用,避免 server 同步先跑覆盖草稿
draft.load();

watch(
  () => blueprintCtx.blueprint.value?.layers.L2_softTissue,
  (serverLayer) => {
    if (!serverLayer || draftRestored.value) return;
    form.value = { ...form.value, ...(serverLayer as unknown as L2SoftTissue) };
  },
  { immediate: true },
);

const fillPercent = computed(() => {
  let n = 0;
  for (const f of L2_SLIDER_FIELDS) {
    const v = (form.value as any)[f.key];
    if (typeof v === 'number') n += 1;
  }
  return Math.round((n / L2_SLIDER_FIELDS.length) * 100);
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
    await blueprintCtx.updateLayer(2, form.value as unknown as Record<string, unknown>);
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
const isLayerInferred = useStepInferred(blueprintCtx, 'L2_softTissue');
</script>

<template>
  <article class="paper-grain rounded-md border border-ink/15 bg-cream p-6 shadow-paper">
    <header class="mb-4 border-b border-ink/10 pb-3">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-mono text-xs uppercase tracking-widest text-ink/40">L2 / 8</p>
          <h2 class="font-display text-2xl text-ink">软组织 (Soft Tissue)</h2>
          <p class="mt-1 text-sm text-ink/60">
            6 项 — 骨骼之上的脂肪与肌肉分布
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
        class="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
      >
        已从本地草稿恢复(刷新前未保存的修改);点 "立即保存" 同步到服务器。
        <button
          type="button"
          class="ml-2 underline hover:text-amber-600"
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
        <span>本层 6 项由 AI 从参考图反推(角标标记);请逐项核对,首次编辑任一字段后,角标自动消失。</span>
      </div>
    </header>

    <section class="space-y-4">
      <div v-for="f in L2_SLIDER_FIELDS" :key="f.key">
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