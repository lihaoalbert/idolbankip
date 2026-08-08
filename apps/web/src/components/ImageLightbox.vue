<script setup lang="ts">
/**
 * #30.6.15 图片预览灯箱 — 点缩略图放大看图 + AI 生成图可下载/重生成
 *
 * 用法:
 *   <ImageLightbox
 *     v-model:visible="lightboxVisible"
 *     :file="currentFile"
 *     :ip-id="ipId"
 *     @regenerate="onRegenerate"
 *   />
 *
 * Props:
 *   - visible: boolean (v-model)
 *   - file: { id, originalName, mimeType, sizeBytes, assetType, isAiGenerated, aiPrompt }
 *   - ipId: string — 重生成时调 /ai/generate-image 需要
 *
 * 事件:
 *   - regenerate (assetType: string) — lightbox 关闭后由父组件触发新一轮生成
 *
 * 重要: 依赖 useToast / apiClient — 来自父组件全局可用
 */
import { computed, ref, watch } from 'vue';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';

interface IpFile {
  id: string;
  assetType: string;
  originalName: string;
  mimeType?: string;
  sizeBytes?: string | number;
  isAiGenerated?: boolean;
  aiPrompt?: string | null;
}

const props = defineProps<{
  visible: boolean;
  file: IpFile | null;
  ipId: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'regenerate', assetType: string): void;
}>();

const toast = useToast();

// 内联显示 — 走 /api/v1/upload/files/:id/preview-url 拿签名 URL, <img> 标签不发 Bearer,
// 用 OSS 签名 URL 才能让浏览器直接拿到图
const previewSrc = ref<string>('');
const previewLoading = ref(false);

async function loadPreviewUrl() {
  if (!props.file) { previewSrc.value = ''; return; }
  previewLoading.value = true;
  try {
    const { data } = await apiClient.get(`/upload/files/${props.file.id}/preview-url`);
    previewSrc.value = data.url;
  } catch (e: any) {
    toast.error('预览图加载失败');
    previewSrc.value = '';
  } finally {
    previewLoading.value = false;
  }
}

watch(() => [props.visible, props.file?.id], ([v]) => {
  if (v && props.file) loadPreviewUrl();
  else previewSrc.value = '';
});

const showAiPrompt = computed(() => !!props.file?.isAiGenerated && !!props.file?.aiPrompt);

function close() {
  emit('update:visible', false);
}

function onBackdropClick(e: MouseEvent) {
  // 只有点击遮罩本身才关闭, 阻止冒泡到内容
  if (e.target === e.currentTarget) close();
}

function fmtSize(b?: string | number): string {
  if (!b) return '';
  const n = typeof b === 'string' ? parseInt(b, 10) : b;
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

const downloading = computed(() => false); // 简化: 暂不追踪, 直接 a.click

async function download() {
  if (!props.file) return;
  try {
    const { data } = await apiClient.get(`/upload/files/${props.file.id}/download-url`);
    // 直接走签名 URL 触发浏览器下载
    const a = document.createElement('a');
    a.href = data.url;
    a.download = data.filename || props.file.originalName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('已开始下载');
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '下载链接获取失败');
  }
}

function regenerate() {
  if (!props.file) return;
  const type = props.file.assetType;
  close();
  // 父组件处理实际生成逻辑 (跟 aiRecognize 一样的 confirm 流程)
  emit('regenerate', type);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) close();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible && file"
        class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
        @click="onBackdropClick"
        @keydown="onKeydown"
        tabindex="-1"
      >
        <div
          class="relative bg-surface rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
          @click.stop
        >
          <!-- 顶部工具栏 -->
          <div class="flex items-center justify-between gap-3 px-5 py-3 border-b border-line shrink-0">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium truncate">{{ file.originalName }}</div>
              <div class="text-[11px] text-ink/50 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{{ file.mimeType || 'image' }}</span>
                <span v-if="file.sizeBytes" class="font-mono">{{ fmtSize(file.sizeBytes) }}</span>
                <span v-if="file.isAiGenerated" class="px-1.5 py-0.5 bg-gold/20 text-gold rounded text-[10px] font-medium">✨ AI 生成</span>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button
                type="button"
                class="px-3 py-1.5 text-xs border border-line rounded-full hover:bg-cream transition flex items-center gap-1.5"
                @click="download"
                title="下载原图 (供二次修改)"
              >
                <span>⬇</span><span>下载</span>
              </button>
              <button
                v-if="file.isAiGenerated"
                type="button"
                class="px-3 py-1.5 text-xs border border-gold text-gold rounded-full hover:bg-gold hover:text-ink transition flex items-center gap-1.5"
                @click="regenerate"
                title="用同一个 prompt 再生成一张"
              >
                <span>🔄</span><span>重新生成</span>
              </button>
              <button
                type="button"
                class="px-2.5 py-1.5 text-ink/50 hover:text-ink text-lg"
                @click="close"
                title="关闭 (Esc)"
              >×</button>
            </div>
          </div>

          <!-- 图本体 — 暗背景 + contain 缩放 -->
          <div class="flex-1 overflow-auto bg-ink/95 flex items-center justify-center min-h-[200px]">
            <img
              v-if="previewSrc"
              :src="previewSrc"
              :alt="file.originalName"
              class="max-w-full max-h-[70vh] object-contain"
              referrerpolicy="no-referrer"
            />
            <div v-else-if="previewLoading" class="text-cream/60 text-sm">加载中…</div>
            <div v-else class="text-cream/40 text-sm">无法加载预览</div>
          </div>

          <!-- AI prompt 展开 (仅 AI 生成图) -->
          <details v-if="showAiPrompt" class="px-5 py-3 border-t border-line shrink-0 text-xs">
            <summary class="cursor-pointer text-ink/70 hover:text-ink select-none">
              🪄 查看 AI 提示词 (捏者可复制到 Midjourney/ComfyUI 等工具二次微调)
            </summary>
            <pre class="mt-2 p-3 bg-cream/60 rounded-lg whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ink/80 max-h-40 overflow-auto">{{ file.aiPrompt }}</pre>
          </details>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>