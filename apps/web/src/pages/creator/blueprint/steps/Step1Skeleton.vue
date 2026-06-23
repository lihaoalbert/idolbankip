<script setup lang="ts">
/**
 * Step 1 — L1 骨骼 (Skeleton / Anthropometry)
 *
 * 8 项 anthropometry 字段:
 *   - 颅型 (enum) | 脸型指数 (slider)
 *   - 颧骨宽 / 颧骨突出度 (sliders)
 *   - 下颌宽 (slider) | 下颌角 (enum)
 *   - 三庭上比例 / 三庭中比例 (sliders)
 *
 * 数据来源:BlueprintContext (BlueprintWizard provide,本组件 inject)
 * 改 form → context.updateLayer(1, data) → 后端 PATCH + context ref 自动更新
 *   → BlueprintHead3D watch context.blueprint → mesh 实时 rebuild
 */
import { computed, inject, ref, watch } from 'vue';
import {
  L1_DEFAULTS,
  L1_SELECT_FIELDS,
  L1_SLIDER_FIELDS,
  type L1Skeleton,
} from '@/api/blueprint';
import { useToast } from '@/composables/useToast';
import { useBlueprintDraft } from '@/composables/useBlueprintDraft';
import { BlueprintKey } from '../context';

const props = defineProps<{ blueprintId: string }>();
const toast = useToast();

const ctx = inject(BlueprintKey);
if (!ctx) throw new Error('Step1Skeleton must be inside BlueprintWizard (BlueprintKey not provided)');
// 保存到非空局部变量,watch 闭包内可安全访问
const blueprintCtx = ctx;

const form = ref<L1Skeleton>({ ...L1_DEFAULTS });
const saving = ref(false);
const lastSavedAt = ref<string | null>(null);

const draft = useBlueprintDraft<L1Skeleton>({
  blueprintId: props.blueprintId,
  step: 1,
  serverData: ref<L1Skeleton | null>(null), // 改用 context 后,server data 从 ctx.blueprint 来
  formData: form,
});

const draftRestored = draft.draftRestored;

// 当 context.blueprint 变化(server 推回来),把 server 数据同步到 form(仅当没有草稿时)
// 草稿恢复逻辑:如果 draftRestored=true,优先用草稿;否则用 server
watch(
  () => blueprintCtx.blueprint.value?.layers.L1_skeleton,
  (serverLayer) => {
    if (!serverLayer || draftRestored.value) return;
    form.value = { ...form.value, ...(serverLayer as unknown as L1Skeleton) };
  },
  { immediate: true },
);

// 整体完成度:8 字段 = 100%
const fillPercent = computed(() => {
  let n = 0;
  for (const f of L1_SLIDER_FIELDS) {
    const v = (form.value as any)[f.key];
    if (typeof v === 'number') n += 1;
  }
  for (const f of L1_SELECT_FIELDS) {
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
    await blueprintCtx.updateLayer(1, form.value as unknown as Record<string, unknown>);
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
</script>

<template>
  <article class="paper-grain rounded-md border border-ink/15 bg-cream p-6 shadow-paper">
    <header class="mb-4 border-b border-ink/10 pb-3">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-mono text-xs uppercase tracking-widest text-ink/40">L1 / 8</p>
          <h2 class="font-display text-2xl text-ink">骨骼 (Skeleton)</h2>
          <p class="mt-1 text-sm text-ink/60">
            8 项 anthropometry — 决定脸型的整体骨架
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
    </header>

    <!-- 枚举字段(颅型 / 下颌角) -->
    <section class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      <div v-for="f in L1_SELECT_FIELDS" :key="f.key">
        <label class="mb-1 block text-sm font-medium text-ink">{{ f.label }}</label>
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

    <!-- 数值 slider 字段 -->
    <section class="space-y-4">
      <div v-for="f in L1_SLIDER_FIELDS" :key="f.key">
        <div class="mb-1 flex items-baseline justify-between">
          <label class="text-sm font-medium text-ink">{{ f.label }}</label>
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