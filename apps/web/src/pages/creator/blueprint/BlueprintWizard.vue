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
 *   │ Step Form (左)  │ 3D Head (右)   │
 *   ├─────────────────┴────────────────┤
 *   │ ← 上一步  第 N/8 步  下一步 →    │
 *   └──────────────────────────────────┘
 *
 * 数据流:
 *   BlueprintContext (provide) — blueprint ref + updateLayer()
 *     ↑ inject by Step1~8 + BlueprintHead3D
 *     ↑ 单一 fetch 来源,避免 Step + Wizard 重复 GET
 */
import { computed, onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { blueprintApi, type Blueprint } from '@/api/blueprint';
import { useToast } from '@/composables/useToast';
import StepperProgress from '@/components/blueprint/StepperProgress.vue';
import BlueprintHead3D from '@/components/blueprint/BlueprintHead3D.vue';
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

// Round 3 阶段:把当前步之前的都标为已完成,允许回访
// R5b 起改成按 layers 数据真填充
const completedSteps = computed(() => {
  const list: number[] = [];
  for (let n = 1; n < stepNum.value; n += 1) list.push(n);
  return list;
});

const ActiveStepComponent = computed(() => STEP_COMPONENTS[stepNum.value - 1]);

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

      <!-- 左右分栏 (R5a) — 左 form / 右 3D -->
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

        <!-- 右:3D Head Preview (40% 宽,sticky) -->
        <aside class="lg:col-span-2">
          <div class="lg:sticky lg:top-6">
            <div class="mb-2 flex items-baseline justify-between">
              <h3 class="font-display text-sm text-ink/70">3D 预览 · 实时</h3>
              <span class="font-mono text-xs text-ink/40">L1+L2 驱动</span>
            </div>
            <div class="h-[480px] lg:h-[560px]">
              <BlueprintHead3D />
            </div>
          </div>
        </aside>
      </div>

      <div class="mt-6 flex items-center justify-between text-sm">
        <button
          type="button"
          class="rounded border border-ink/20 bg-cream px-4 py-2 disabled:opacity-30"
          :disabled="stepNum <= 1"
          @click="onStepClick(stepNum - 1)"
        >
          ← 上一步
        </button>
        <span class="text-ink/40">第 {{ stepNum }} / 8 步</span>
        <button
          type="button"
          class="rounded border border-stamp-red bg-stamp-red px-4 py-2 text-cream disabled:opacity-30"
          :disabled="stepNum >= 8"
          @click="onStepClick(stepNum + 1)"
        >
          下一步 →
        </button>
      </div>
    </main>
  </div>
</template>