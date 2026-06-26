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
 * Track B (2026-06-26):顶栏加"上传参考图"按钮 → 调 POST /blueprint/from-image
 *   → 一次性创建 + 反推 L1-L6 46 字段 → 跳 step 1 让用户微调
 *
 * 数据流:
 *   BlueprintContext (provide) — blueprint ref + updateLayer()
 *     ↑ inject by Step1~8
 *     ↑ 单一 fetch 来源,避免 Step + Wizard 重复 GET
 */
import { computed, onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { blueprintApi, BLUEPRINT_LAYERS, PRESETS, type Blueprint } from '@/api/blueprint';
import { useToast } from '@/composables/useToast';
import StepperProgress from '@/components/blueprint/StepperProgress.vue';
import ContradictionBanner from '@/components/blueprint/ContradictionBanner.vue';
import SchematicFace from '@/components/blueprint/SchematicFace.vue';
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

const applyingPreset = ref(false);

// Blueprint 2.0 Track A(Q4):5 个快速预设一键覆盖 L1~L6
// 串行 PATCH 避免并发写覆盖;结束后 refresh 一次拉最新,Step1~6 form ref 同步
async function applyPreset(presetId: string) {
  if (!blueprint.value) return;
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return;
  if (applyingPreset.value) return;
  if (!confirm(`确认应用「${preset.label}」预设?\n将覆盖当前 L1~L6 全部字段(46 个)。`)) return;
  applyingPreset.value = true;
  try {
    // 按 L1~L6 顺序串行 PATCH,确保 server 状态一致
    const orderedKeys = ['L1_skeleton', 'L2_softTissue', 'L3_features', 'L4_skin', 'L5_hair', 'L6_decoration'] as const;
    for (let i = 0; i < orderedKeys.length; i += 1) {
      const key = orderedKeys[i];
      const layerData = preset.layers[key] as unknown as Record<string, unknown>;
      await blueprintApi.updateLayer(blueprint.value.id, (i + 1) as 1 | 2 | 3 | 4 | 5 | 6, layerData);
    }
    await refresh();
    toast.success(`已应用「${preset.label}」预设,可以从第 1 步微调`);
  } catch (err: any) {
    toast.error('应用预设失败: ' + (err?.message ?? '未知错误'));
  } finally {
    applyingPreset.value = false;
  }
}

// ====================== Track B: 上传参考图 ======================
// Track B(2026-06-26):创作者在 Wizard 顶栏点"上传参考图" → 选图 →
//   客户端 Canvas 缩放到 ≤1024px → 转 base64 → POST /blueprint/from-image
//   → 后端调 MiniMax M3 反推 L1-L6 → 写库 → 返回新 Blueprint → 跳 step 1
//
// 设计选择:每次上传都创建新 Blueprint(不覆盖当前) — 创作者"换张图重试"成本最低
//   但要先 confirm 提示会丢当前内容
//
// 反推完成会把每层标 _inferred:true(后端),Round 3 Step1~6 form 上加 chip 标注

const fileInput = ref<HTMLInputElement | null>(null);
const uploadingImage = ref(false);

const MAX_IMAGE_DIM = 1024; // Canvas resize 上限,平衡精度和 base64 体积
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function pickReferenceImage() {
  fileInput.value?.click();
}

async function onReferenceImageSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  // 重置 input.value,允许同一张图再次选择
  if (fileInput.value) fileInput.value.value = '';
  if (!file) return;
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    toast.error(`不支持的图片格式: ${file.type || '未知'},请用 jpg/png/webp`);
    return;
  }
  // 客户端先预检大小(后端 5MB 是硬限),给友好提示
  if (file.size > 5 * 1024 * 1024) {
    toast.error(`图片过大: ${(file.size / 1024 / 1024).toFixed(1)}MB,上限 5MB`);
    return;
  }
  // 二次确认:上传会创建新 Blueprint,当前编辑内容(若已有)会丢
  if (blueprint.value && blueprintId.value) {
    if (!confirm('上传参考图会创建新的 Blueprint 并从图反推 L1-L6 46 字段,当前编辑内容会丢失,继续?')) {
      return;
    }
  }
  uploadingImage.value = true;
  try {
    const dataUri = await fileToResizedBase64(file, MAX_IMAGE_DIM);
    // API 接受 data:image/jpeg;base64,...(也接受纯 base64,后端兼容)
    const created = await blueprintApi.fromImage(dataUri, blueprint.value?.title ?? undefined);
    // 跳到新 blueprint 的 step 1,刷新整个 context
    router.replace({ name: 'blueprint-step', params: { id: created.id, step: '1' } });
    toast.success(
      `已反推 ${created.inferredFields ?? 6} 层,约 46 字段。请在第 1 步微调(AI 推断字段会有角标)。`,
      6000,
    );
  } catch (err: any) {
    const detail = err?.response?.data?.error?.message ?? err?.message ?? '未知错误';
    toast.error('反推失败: ' + detail);
  } finally {
    uploadingImage.value = false;
  }
}

/**
 * 客户端把图片缩放到 ≤MAX_IMAGE_DIM,转 base64 data URI。
 * 长边限制:1024px 够 Vision API 看清结构,base64 体积也控制在 ~1MB 以内。
 * 保留 data URI header(后端用它推断 mime type)。
 */
async function fileToResizedBase64(file: File, maxDim: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('图片解码失败'));
      i.src = url;
    });
    const { width, height } = img;
    if (width <= 0 || height <= 0) throw new Error('图片尺寸无效');
    // 等比缩放:长边 → maxDim
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2d context 不可用');
    ctx.drawImage(img, 0, 0, targetW, targetH);
    // 输出 jpeg(对照片压缩率高)、webp 保留、png 不压缩
    const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const quality = outType === 'image/jpeg' ? 0.9 : undefined;
    return canvas.toDataURL(outType, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
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
        <div class="flex items-center gap-3">
          <!-- Track B:上传参考图按钮 — 调 MiniMax M3 反推 L1-L6 46 字段 -->
          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="hidden"
            data-testid="reference-image-input"
            @change="onReferenceImageSelected"
          />
          <button
            type="button"
            class="rounded border border-stamp-red/40 bg-stamp-red/5 px-3 py-1.5 text-sm text-stamp-red transition hover:bg-stamp-red hover:text-cream disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="uploadingImage"
            data-testid="reference-image-button"
            @click="pickReferenceImage"
          >
            {{ uploadingImage ? '反推中…' : '上传参考图' }}
          </button>
          <button
            type="button"
            class="text-sm text-ink/60 hover:text-stamp-red"
            @click="router.push('/creator')"
          >
            ← 返回创作者中心
          </button>
        </div>
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

      <!-- Blueprint 2.0 Track A 预设:只在 L1~L6 步骤显示,Q4 拍板 5 个 -->
      <div v-if="stepNum <= 6" class="mb-6 rounded-md border border-ink/10 bg-paper/60 p-4">
        <div class="mb-3 flex items-baseline justify-between">
          <h3 class="font-display text-sm text-ink/70">快速起手 · 5 个预设</h3>
          <span class="font-mono text-xs text-ink/40">点击一键覆盖 L1~L6(46 字段)</span>
        </div>
        <div class="grid grid-cols-2 gap-2 md:grid-cols-5">
          <button
            v-for="p in PRESETS"
            :key="p.id"
            type="button"
            :disabled="applyingPreset || !blueprint"
            class="rounded border border-ink/20 bg-cream px-3 py-2 text-left text-xs transition hover:border-stamp-red hover:bg-stamp-red hover:text-cream disabled:opacity-40 disabled:cursor-not-allowed"
            @click="applyPreset(p.id)"
          >
            <div class="font-display text-sm font-semibold">{{ p.label }}</div>
            <div class="mt-0.5 text-[11px] opacity-70">{{ p.description }}</div>
          </button>
        </div>
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

        <!-- 右:SchematicFace 实时渲染 (Blueprint 2.0 Track A)
             把 L1~L6 46 字段实时渲染成 600×800 工程图风格人脸,
             作为 ControlNet canny/depth 输入控制生图结构。
             与左栏表单双向绑定:任何字段变化立刻反映。 -->
        <aside class="lg:col-span-2">
          <div class="lg:sticky lg:top-6 space-y-3">
            <div class="rounded-md border border-ink/10 bg-cream/60 p-4">
              <div class="mb-3 flex items-baseline justify-between">
                <h3 class="font-display text-sm text-ink/70">实时脸谱 · 示意图</h3>
                <span class="font-mono text-xs text-ink/40">L1~L6 驱动</span>
              </div>
              <div v-if="blueprint && blueprint.layers" class="flex justify-center">
                <SchematicFace :layers="blueprint.layers" :resolution="360" />
              </div>
              <div v-else class="text-center text-xs text-ink/40 py-8">加载中…</div>
            </div>
            <div class="rounded-md border border-stamp-red/30 bg-cream/60 p-3 text-xs text-ink/70">
              <strong class="font-display text-stamp-red">Blueprint 2.0 · Track A</strong>
              <p class="mt-1 leading-relaxed">
                示意图是纯 Canvas 矢量渲染,实时反映 L1~L6 全部 46 个字段。
                后续接 ControlNet canny/depth 后,这张图会作为生图结构控制输入,大幅提升精准度。
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