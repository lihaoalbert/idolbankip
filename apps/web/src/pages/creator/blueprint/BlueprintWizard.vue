<script setup lang="ts">
/**
 * FaceBlueprint Wizard — 主容器(Phase 1 R5a 改造)
 *
 * 路由:
 *   /creator/blueprint/new/step/:step? → 自动 POST 创建空 Blueprint + redirect
 *   /creator/blueprint/:id/step/:step? → 加载已有 Blueprint
 *
 * 排版(R5a):左右分栏
 *   ┌──────────────────────────────────┐
 *   │ Stepper (横跨全宽)                │
 *   ├─────────────────┬────────────────┤
 *   │ Step Form (左)  │ Face Summary(右)│  ← Phase C Beta 改:3D → 文字摘要
 *   ├─────────────────┴────────────────┤
 *   │ ← 上一步  第 N/8 步  下一步 →    │
 *   └──────────────────────────────────┘
 *
 * 数据流:
 *   BlueprintContext (provide) — blueprint ref + updateLayer()
 *     ↑ inject by Step1~8
 *     ↑ 单一 fetch 来源,避免 Step + Wizard 重复 GET
 */
import { computed, onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { blueprintApi, BLUEPRINT_LAYERS, type Blueprint } from '@/api/blueprint';
import { useToast } from '@/composables/useToast';
import StepperProgress from '@/components/blueprint/StepperProgress.vue';
import ContradictionBanner from '@/components/blueprint/ContradictionBanner.vue';
import { BlueprintKey } from './context';
import Step1Skeleton from './steps/Step1Skeleton.vue';
import Step2SoftTissue from './steps/Step2SoftTissue.vue';
import Step3Features from './steps/Step3Features.vue';
import Step4Skin from './steps/Step4Skin.vue';
import Step5Hair from './steps/Step5Hair.vue';
import Step6Decoration from './steps/Step6Decoration.vue';
import Step7Render from './steps/Step7Render.vue';
import Step8Evaluate from './steps/Step8Evaluate.vue';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const STEPS = [
  { num: 1, label: '骨骼' },
  { num: 2, label: '软组织' },
  { num: 3, label: '五官' },
  { num: 4, label: '皮肤' },
  { num: 5, label: '毛发' },
  { num: 6, label: '修饰' },
  { num: 7, label: '渲染' },
  { num: 8, label: '评估' },
];

const STEP_COMPONENTS = [
  Step1Skeleton,
  Step2SoftTissue,
  Step3Features,
  Step4Skin,
  Step5Hair,
  Step6Decoration,
  Step7Render,
  Step8Evaluate,
];

const blueprint = ref<Blueprint | null>(null);
const loading = ref(false);
const creating = ref(false);
const error = ref<string | null>(null);

const stepNum = computed(() => {
  const raw = Number(route.params.step ?? 1);
  return Number.isInteger(raw) && raw >= 1 && raw <= 8 ? raw : 1;
});

const blueprintId = computed(() => route.params.id as string | undefined);

// 按 layers 数据真填充判完成 — 修 Phase C 上线反馈的"step 2 永久 disabled" bug
// 原实现:completedSteps = 1..(stepNum-1),用户在 step 1 时 completedSteps=[] → step 2-8 全 disabled
// 改为:layer 非 null 即视为已填(对应 step 可回访,也可点下一步)。L8 是评估结果,
// 需 evaluate() 调用后才写入,所以它靠 stepNum 推进,不走这条规则。
const completedSteps = computed(() => {
  if (!blueprint.value?.layers) return [];
  const list: number[] = [];
  // L1~L7 按 layer 数据判定(L8 评估是结果,不是用户输入)
  for (let i = 0; i < BLUEPRINT_LAYERS.length - 1; i += 1) {
    const layerKey = BLUEPRINT_LAYERS[i];
    if (blueprint.value.layers[layerKey] !== null) list.push(i + 1);
  }
  return list;
});

const ActiveStepComponent = computed(() => STEP_COMPONENTS[stepNum.value - 1]);

// 脸谱摘要 — 把 L1~L6 关键字段压成一行可读的描述
// 用于右栏的"实时摘要面板"。L7 是 prompt 输出,在 Step7Render 里看完整 prompt。
const profileRows = computed(() => {
  const layers = (blueprint.value?.layers ?? {}) as Record<string, Record<string, unknown> | null>;
  const l1 = (layers.L1_skeleton ?? null) as Record<string, unknown> | null;
  const l2 = (layers.L2_softTissue ?? null) as Record<string, unknown> | null;
  const l3 = (layers.L3_features ?? null) as Record<string, unknown> | null;
  const l4 = (layers.L4_skin ?? null) as Record<string, unknown> | null;
  const l5 = (layers.L5_hair ?? null) as Record<string, unknown> | null;
  const l6 = (layers.L6_decoration ?? null) as Record<string, unknown> | null;
  return [
    { layer: 'L1', value: summarizeL1(l1) },
    { layer: 'L2', value: summarizeL2(l2) },
    { layer: 'L3', value: summarizeL3(l3) },
    { layer: 'L4', value: summarizeL4(l4) },
    { layer: 'L5', value: summarizeL5(l5) },
    { layer: 'L6', value: summarizeL6(l6) },
  ];
});

function v(layer: Record<string, unknown> | null, key: string, fmt?: (n: number) => string): string {
  if (!layer) return '';
  const raw = layer[key];
  if (typeof raw === 'number') return fmt ? fmt(raw) : String(raw);
  return raw == null ? '' : String(raw);
}

function summarizeL1(l: Record<string, unknown> | null): string {
  if (!l) return '';
  const parts = [v(l, 'craniumShape'), v(l, 'faceIndex', (n) => `脸型指数 ${n.toFixed(2)}`), v(l, 'jawAngle')];
  return parts.filter(Boolean).join(' · ');
}
function summarizeL2(l: Record<string, unknown> | null): string {
  if (!l) return '';
  const parts = [v(l, 'subcutaneousFat', (n) => `脂肪 ${Math.round(n * 100)}%`), v(l, 'browRidge', (n) => `眉弓 ${Math.round(n * 100)}%`)];
  return parts.filter(Boolean).join(' · ');
}
function summarizeL3(l: Record<string, unknown> | null): string {
  if (!l) return '';
  const parts = [v(l, 'eyeShape'), v(l, 'lipShape'), v(l, 'noseShape')];
  return parts.filter(Boolean).join(' · ');
}
function summarizeL4(l: Record<string, unknown> | null): string {
  if (!l) return '';
  const parts = [v(l, 'skinTone'), v(l, 'skinTexture')];
  return parts.filter(Boolean).join(' · ');
}
function summarizeL5(l: Record<string, unknown> | null): string {
  if (!l) return '';
  const parts = [v(l, 'hairStyle'), v(l, 'hairColor'), v(l, 'hairLength')];
  return parts.filter(Boolean).join(' · ');
}
function summarizeL6(l: Record<string, unknown> | null): string {
  if (!l) return '';
  const parts = [v(l, 'glasses'), v(l, 'earring'), v(l, 'makeupStyle')];
  return parts.filter(Boolean).join(' · ');
}

// ====================== BlueprintContext (provide) ======================

async function refresh() {
  if (!blueprintId.value) return;
  loading.value = true;
  try {
    blueprint.value = await blueprintApi.get(blueprintId.value);
    error.value = null;
  } catch (err: any) {
    error.value = err?.message ?? '加载失败';
  } finally {
    loading.value = false;
  }
}

async function updateLayer(step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, data: Record<string, unknown>) {
  if (!blueprint.value) throw new Error('Blueprint not loaded');
  const updated = await blueprintApi.updateLayer(blueprint.value.id, step, data);
  blueprint.value = updated;
}

provide(BlueprintKey, {
  blueprint,
  loading,
  error,
  updateLayer,
  refresh,
});

// ====================== 路由变化 ======================

async function ensureBlueprint() {
  if (blueprintId.value) return;
  if (creating.value) return;
  creating.value = true;
  try {
    const created = await blueprintApi.create({});
    router.replace({
      name: 'blueprint-step',
      params: { id: created.id, step: String(stepNum.value) },
    });
  } catch (err: any) {
    toast.error('创建 Blueprint 失败: ' + (err?.message ?? '未知错误'));
  } finally {
    creating.value = false;
  }
}

function onStepClick(n: number) {
  router.push({
    name: blueprintId.value ? 'blueprint-step' : 'blueprint-new',
    params: blueprintId.value ? { id: blueprintId.value, step: String(n) } : { step: String(n) },
  });
}

watch(
  () => route.params,
  (params) => {
    const id = params.id as string | undefined;
    if (id) {
      refresh();
    } else {
      ensureBlueprint();
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (!blueprintId.value) ensureBlueprint();
});
</script>

<template>
  <div class="min-h-screen bg-paper text-ink">
    <header class="border-b border-ink/10 bg-cream/80 px-6 py-4 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div>
          <h1 class="font-display text-xl">Face Blueprint Wizard</h1>
          <p class="text-xs text-ink/50">8 层人脸分解 · Phase 1 (Beta)</p>
        </div>
        <button
          type="button"
          class="text-sm text-ink/60 hover:text-stamp-red"
          @click="router.push('/creator')"
        >
          ← 返回创作者中心
        </button>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-6 py-6">
      <div class="mb-6 rounded-md border border-ink/10 bg-cream/60 p-4">
        <StepperProgress
          :steps="STEPS"
          :current="stepNum"
          :completed="completedSteps"
          @step-click="onStepClick"
        />
      </div>

      <!-- 左右分栏 (R5a → Phase C 改 3D → 文字摘要) — 左 form / 右 face summary -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <!-- 左:Step Form (60% 宽) -->
        <section class="lg:col-span-3">
          <div v-if="blueprint && blueprint.layers" class="mb-4">
            <ContradictionBanner :layers="blueprint.layers" />
          </div>
          <div v-if="loading || creating" class="text-center text-sm text-ink/40 py-12">
            {{ creating ? '创建 Blueprint…' : '加载中…' }}
          </div>
          <component
            v-else-if="blueprint && ActiveStepComponent"
            :is="ActiveStepComponent"
            :blueprint-id="blueprint.id"
          />
          <div
            v-else-if="!loading && !creating"
            class="text-center text-sm text-ink/40 py-12"
          >
            正在准备向导…
          </div>
        </section>

        <!-- 右:Face Profile 摘要面板 (Phase C Beta 改)
             之前的 3D 占位 mesh 看起来不像人脸,反而误导,改为文字摘要 + Phase 3 提示。
             真实脸谱依赖 Phase 3 FLAME/3DMM 接入。 -->
        <aside class="lg:col-span-2">
          <div class="lg:sticky lg:top-6 space-y-3">
            <div class="rounded-md border border-ink/10 bg-cream/60 p-4">
              <div class="mb-3 flex items-baseline justify-between">
                <h3 class="font-display text-sm text-ink/70">脸谱摘要 · 实时</h3>
                <span class="font-mono text-xs text-ink/40">L1~L6 驱动</span>
              </div>
              <dl class="space-y-2 text-sm">
                <div v-for="row in profileRows" :key="row.layer" class="flex items-baseline gap-2">
                  <dt class="w-12 shrink-0 text-xs text-ink/50">{{ row.layer }}</dt>
                  <dd class="flex-1 text-ink/80">{{ row.value || '— 默认 —' }}</dd>
                </div>
              </dl>
            </div>
            <div class="rounded-md border border-amber-300/40 bg-amber-50/60 p-3 text-xs text-amber-900">
              <strong class="font-display">ℹ️ Beta 提示</strong>
              <p class="mt-1 leading-relaxed">
                3D 脸谱依赖 <span class="font-mono">Phase 3 FLAME / 3DMM</span> 接入,
                此前显示的是占位几何体而非真实建模。本面板的<strong>文字摘要是真实参数</strong>,
                可直接复制到 L7 中文 prompt 校验。当前重点是把 L1~L6 字段填对,L8 评估会用文字摘要计算子分。
              </p>
            </div>
          </div>
        </aside>
      </div>

      <!-- 底部导航:sticky 到视口底部,长表单滚动时仍能看到下一步 (Beta 反馈 #3-2) -->
      <div class="sticky bottom-4 z-10 mt-8 rounded-md border border-ink/15 bg-cream/95 px-4 py-3 shadow-archive backdrop-blur">
        <div class="flex items-center justify-between gap-4 text-sm">
          <button
            type="button"
            class="rounded border border-ink/20 bg-cream px-4 py-2 disabled:opacity-30 hover:border-ink/40"
            :disabled="stepNum <= 1"
            @click="onStepClick(stepNum - 1)"
          >
            ← 上一步
          </button>
          <span class="font-mono text-xs text-ink/50">第 {{ stepNum }} / 8 步</span>
          <button
            type="button"
            class="rounded bg-stamp-red px-6 py-2.5 text-base font-semibold text-cream shadow-sm transition hover:bg-stamp-red/90 disabled:opacity-30"
            :disabled="stepNum >= 8"
            @click="onStepClick(stepNum + 1)"
          >
            下一步 →
          </button>
        </div>
      </div>
    </main>
  </div>
</template>