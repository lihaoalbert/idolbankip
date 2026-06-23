<script setup lang="ts">
/**
 * Step 7 — L7 渲染 Prompt (Render)
 *
 * 自动从 L1~L6 拼中英 prompt + 4 平台变体 (MJ/SD/即梦/doubao)
 * 创作者可直接复制喂图生成平台
 *
 * 数据流:
 *   1. 监听 blueprintCtx.blueprint.layers(L1~L6)
 *   2. 前端 buildPrompts 实时算 promptZh/promptEn + variants(预览)
 *   3. 用户选 platforms → PATCH /step/7 同步到后端
 *   4. 后端 buildPrompts 重新计算并写回 L7_render(权威)
 */
import { computed, inject, ref, watch } from 'vue';
import {
  L7_DEFAULTS,
  type L7Render,
  type Platform,
} from '@/api/blueprint';
import { buildPrompts, SUPPORTED_PLATFORMS } from '@/api/prompt-builder';
import { useToast } from '@/composables/useToast';
import { BlueprintKey } from '../context';

const props = defineProps<{ blueprintId: string }>();
const toast = useToast();

const ctx = inject(BlueprintKey);
if (!ctx) throw new Error('Step7Render must be inside BlueprintWizard (BlueprintKey not provided)');
const blueprintCtx = ctx;

const form = ref<{ platforms: Platform[] }>({
  platforms: L7_DEFAULTS.platforms as Platform[],
});
const saving = ref(false);
const lastSavedAt = ref<string | null>(null);
const copiedKey = ref<string | null>(null);

const L7_DEFAULTS_OBJ = L7_DEFAULTS as { platforms: Platform[]; promptZh?: string; promptEn?: string; variants?: string[] };

const serverL7 = computed<L7Render | null>(() => {
  return (blueprintCtx.blueprint.value?.layers.L7_render as unknown as L7Render) ?? null;
});

// 监听 server → 同步 platforms
watch(
  () => serverL7.value?.platforms,
  (platforms) => {
    if (platforms && platforms.length > 0) {
      form.value.platforms = platforms as Platform[];
    }
  },
  { immediate: true },
);

// 实时预览 — 监听 L1~L6 变化,本地 buildPrompts
const localPreview = computed(() => {
  const bp = blueprintCtx.blueprint.value;
  if (!bp) return { promptZh: '', promptEn: '', variants: [] };
  return buildPrompts(bp.layers as any, form.value.platforms);
});

// 服务端保存的 prompt(权威) — 若有就用,没有用本地预览
const promptZh = computed(() => serverL7.value?.promptZh || localPreview.value.promptZh);
const promptEn = computed(() => serverL7.value?.promptEn || localPreview.value.promptEn);
const variants = computed(() => {
  // 服务端 variants 优先(可能含"mj:..."、"sd:..." 等格式)
  if (serverL7.value?.variants && serverL7.value.variants.length > 0) {
    return serverL7.value.variants.map((v) => {
      const [platform, ...rest] = v.split(':');
      return { platform, prompt: rest.join(':') };
    });
  }
  return localPreview.value.variants;
});

function togglePlatform(p: Platform) {
  const i = form.value.platforms.indexOf(p);
  if (i >= 0) {
    form.value.platforms = form.value.platforms.filter((x) => x !== p);
  } else {
    form.value.platforms = [...form.value.platforms, p];
  }
  scheduleSave();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 800);
}

async function persist() {
  if (saving.value) return;
  saving.value = true;
  try {
    await blueprintCtx.updateLayer(7, { platforms: form.value.platforms } as unknown as Record<string, unknown>);
    lastSavedAt.value = new Date().toLocaleTimeString('zh-CN');
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

async function copyText(key: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
    toast.success('已复制到剪贴板');
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = null;
    }, 2000);
  } catch (err: any) {
    toast.error('复制失败: ' + (err?.message ?? '请手动复制'));
  }
}

const PLATFORM_LABELS: Record<Platform, string> = {
  mj: 'Midjourney',
  sd: 'Stable Diffusion',
  jimeng: '即梦',
  doubao: '豆包',
};
</script>

<template>
  <article class="paper-grain rounded-md border border-ink/15 bg-cream p-6 shadow-paper">
    <header class="mb-4 border-b border-ink/10 pb-3">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-mono text-xs uppercase tracking-widest text-ink/40">L7 / 计算层</p>
          <h2 class="font-display text-2xl text-ink">渲染 Prompt (Render)</h2>
          <p class="mt-1 text-sm text-ink/60">
            自动从 L1~L6 拼中英 prompt,直接喂 MJ / SD / 即梦 / 豆包
          </p>
        </div>
        <div class="text-right">
          <div class="text-xs text-ink/50">状态</div>
          <div class="mt-1 flex items-center gap-2 text-xs">
            <span v-if="saving" class="text-ink/50">保存中…</span>
            <span v-else-if="lastSavedAt" class="text-ink/50">已存 {{ lastSavedAt }}</span>
            <button
              type="button"
              class="rounded border border-stamp-red px-2 py-1 text-stamp-red hover:bg-stamp-red hover:text-cream"
              @click="saveNow"
            >
              重新生成
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- 平台选择 -->
    <section class="mb-6">
      <label class="mb-2 block text-sm font-medium text-ink">目标平台</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="p in SUPPORTED_PLATFORMS"
          :key="p"
          type="button"
          class="rounded border px-3 py-1.5 text-sm transition"
          :class="form.platforms.includes(p)
            ? 'border-stamp-red bg-stamp-red text-cream'
            : 'border-ink/20 bg-paper hover:border-stamp-red/50'"
          @click="togglePlatform(p)"
        >
          {{ PLATFORM_LABELS[p] }}
        </button>
      </div>
      <p class="mt-1 text-xs text-ink/40">
        选中的平台会出现在下方"平台变体"中 — 取消勾选则不输出该平台。
      </p>
    </section>

    <!-- 中文 prompt -->
    <section class="mb-4">
      <div class="mb-1 flex items-center justify-between">
        <label class="text-sm font-medium text-ink">中文 Prompt (给即梦/豆包)</label>
        <button
          type="button"
          class="rounded border border-ink/20 px-2 py-0.5 text-xs hover:border-stamp-red hover:text-stamp-red"
          :class="copiedKey === 'zh' ? 'border-stamp-red text-stamp-red' : ''"
          @click="copyText('zh', promptZh)"
        >
          {{ copiedKey === 'zh' ? '✓ 已复制' : '复制' }}
        </button>
      </div>
      <textarea
        readonly
        :value="promptZh"
        rows="3"
        class="w-full rounded border border-ink/20 bg-paper p-2 font-mono text-xs"
      />
    </section>

    <!-- 英文 prompt -->
    <section class="mb-6">
      <div class="mb-1 flex items-center justify-between">
        <label class="text-sm font-medium text-ink">英文 Prompt (给 MJ/SD)</label>
        <button
          type="button"
          class="rounded border border-ink/20 px-2 py-0.5 text-xs hover:border-stamp-red hover:text-stamp-red"
          :class="copiedKey === 'en' ? 'border-stamp-red text-stamp-red' : ''"
          @click="copyText('en', promptEn)"
        >
          {{ copiedKey === 'en' ? '✓ 已复制' : '复制' }}
        </button>
      </div>
      <textarea
        readonly
        :value="promptEn"
        rows="3"
        class="w-full rounded border border-ink/20 bg-paper p-2 font-mono text-xs"
      />
    </section>

    <!-- 平台变体 -->
    <section v-if="variants.length > 0">
      <h3 class="mb-2 text-sm font-medium text-ink">平台变体</h3>
      <div class="space-y-3">
        <div v-for="v in variants" :key="v.platform" class="rounded border border-ink/15 bg-paper/50 p-3">
          <div class="mb-1 flex items-center justify-between">
            <span class="font-mono text-xs font-medium text-stamp-red">
              {{ PLATFORM_LABELS[v.platform as Platform] || v.platform }}
            </span>
            <button
              type="button"
              class="rounded border border-ink/20 px-2 py-0.5 text-xs hover:border-stamp-red hover:text-stamp-red"
              :class="copiedKey === v.platform ? 'border-stamp-red text-stamp-red' : ''"
              @click="copyText(v.platform, v.prompt)"
            >
              {{ copiedKey === v.platform ? '✓ 已复制' : '复制' }}
            </button>
          </div>
          <pre class="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-ink/80">{{ v.prompt }}</pre>
        </div>
      </div>
    </section>

    <p v-else class="rounded border border-dashed border-ink/15 bg-paper/50 p-6 text-center text-xs text-ink/40">
      请先在前面 6 步填写参数,这里会自动出 prompt。
    </p>
  </article>
</template>