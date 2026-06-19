<script setup lang="ts">
/**
 * #30.6.15 通用图片缩略图 — 内部调用 /upload/files/:id/preview-url 拿签名 URL,
 * 然后用 <img src="..."> 显示 (浏览器不带 Bearer, 签名 URL 是 OSS 自带授权)
 *
 * 用法:
 *   <ImageThumb :file-id="ff.id" :file-name="ff.originalName" class="w-12 h-12" />
 *
 * 设计: 多实例共用一个 URL cache (module-level Map), 同一 fileId 只 fetch 一次
 */
import { onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';

const urlCache = new Map<string, string>();

const props = defineProps<{
  fileId: string;
  fileName?: string;
}>();

const src = ref<string>('');
const loading = ref(true);
const failed = ref(false);

async function load() {
  if (urlCache.has(props.fileId)) {
    src.value = urlCache.get(props.fileId)!;
    loading.value = false;
    return;
  }
  loading.value = true;
  failed.value = false;
  try {
    const { data } = await apiClient.get(`/upload/files/${props.fileId}/preview-url`);
    urlCache.set(props.fileId, data.url);
    src.value = data.url;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="relative inline-block w-full h-full">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="fileName || fileId"
      class="w-full h-full object-cover"
      referrerpolicy="no-referrer"
    />
    <div
      v-else-if="loading"
      class="absolute inset-0 flex items-center justify-center bg-cream text-ink/40 text-[10px]"
    >⏳</div>
    <div
      v-else
      class="absolute inset-0 flex items-center justify-center bg-cream text-danger text-[10px]"
      title="图片加载失败"
    >⚠</div>
  </div>
</template>