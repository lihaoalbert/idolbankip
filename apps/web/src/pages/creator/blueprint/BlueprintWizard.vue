<script setup lang="ts">
/**
 * FaceBlueprint Wizard — 主容器
 *
 * 路由:
 *   /creator/blueprint/new/step/:step?   → 进入 wizard(无 id 时自动 POST 创建)
 *   /creator/blueprint/:id/step/:step?   → 已有 blueprint,加载后跳 step
 *
 * Phase A Round 3 skeleton:
 *   - 8 个 Step 组件已挂载,仅展示层标题
 *   - Stepper 进度条 + 点击回访
 *   - 真实表单输入 / 数据持久化留 Round 4~7
 *   - 草稿 localStorage 留 Round 8
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { blueprintApi, type Blueprint } from '@/api/blueprint';
import { useToast } from '@/composables/useToast';
import StepperProgress from '@/components/blueprint/StepperProgress.vue';
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

const stepNum = computed(() => {
  const raw = Number(route.params.step ?? 1);
  return Number.isInteger(raw) && raw >= 1 && raw <= 8 ? raw : 1;
});

const blueprintId = computed(() => route.params.id as string | undefined);

const completedSteps = computed(() => {
  // Round 3 skeleton:把当前步之前的都标为已完成,允许回访
  // Round 4 起改成按 layers 数据真填充
  const list: number[] = [];
  for (let n = 1; n < stepNum.value; n += 1) list.push(n);
  return list;
});

const ActiveStepComponent = computed(() => STEP_COMPONENTS[stepNum.value - 1]);

// 进入 /creator/blueprint/new/step/:step 时,自动创建一个空 blueprint 并重定向到 /:id/step/:step
async function ensureBlueprint() {
  if (blueprintId.value) return; // 已有 id,无需新建
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

async function loadBlueprint(id: string) {
  loading.value = true;
  try {
    blueprint.value = await blueprintApi.get(id);
  } catch (err: any) {
    toast.error('加载 Blueprint 失败: ' + (err?.message ?? '未知错误'));
  } finally {
    loading.value = false;
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
      loadBlueprint(id);
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
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-4">
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

    <main class="mx-auto max-w-5xl px-6 py-6">
      <div class="mb-6 rounded-md border border-ink/10 bg-cream/60 p-4">
        <StepperProgress
          :steps="STEPS"
          :current="stepNum"
          :completed="completedSteps"
          @step-click="onStepClick"
        />
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