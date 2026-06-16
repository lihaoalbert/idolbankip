<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';
import { useRoute, useRouter } from 'vue-router';
import Skeleton from '@/components/Skeleton.vue';
import { useToast } from '@/composables/useToast';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const ipId = computed(() => route.params.id as string);

const ip = ref<any>(null);
const files = ref<any[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const uploadingType = ref<string | null>(null);

async function loadIp() {
  loading.value = true;
  error.value = '';
  try {
    const list = await apiClient.get('/ips/mine/list');
    const found = list.data.items.find((x: any) => x.id === ipId.value);
    if (!found) { error.value = '未找到 IP'; return; }
    ip.value = found;
    files.value = found.files || [];
  } finally { loading.value = false; }
}

async function requestUploadPolicy(assetType: string, file: File) {
  uploadingType.value = assetType;
  error.value = '';
  try {
    // 1) 从后端拿 OSS 直传策略 (HMAC-SHA1, 600s 过期)
    const { data: policy } = await apiClient.post('/upload/policy', {
      ipId: ipId.value,
      assetType,
      filename: file.name,
      size: file.size,
    });
    // 2) 用策略直接 POST 到 OSS (浏览器 → ibi-private 桶,不经后端)
    const fd = new FormData();
    fd.append('key', policy.key);
    fd.append('policy', policy.policy);
    fd.append('OSSAccessKeyId', policy.accessKeyId);
    fd.append('Signature', policy.signature);
    fd.append('file', file);
    const ossRes = await fetch(policy.host + '/', { method: 'POST', body: fd });
    if (!ossRes.ok) {
      throw new Error(`OSS 上传失败 HTTP ${ossRes.status}`);
    }
    // 3) 从 OSS 响应头拿 ETag (服务端当 checksum 用)
    const etag = (ossRes.headers.get('ETag') || '').replace(/"/g, '');
    // 4) 调 callback 写 DB
    await apiClient.post('/upload/oss-callback', {
      filename: file.name,
      size: file.size,
      etag,
      x: policy.key,
    });
    toast.success(`${fileTypeLabel[assetType]} 上传成功`);
    await loadIp();
  } catch (e: any) {
    error.value = e?.response?.data?.message || e?.message || '上传失败';
    toast.error(error.value);
    throw e;
  } finally {
    uploadingType.value = null;
  }
}

async function submitForReview() {
  submitting.value = true;
  error.value = '';
  try {
    await apiClient.post(`/ips/${ipId.value}/submit`);
    toast.success('已提交审核');
    router.push('/creator');
  } catch (e: any) {
    error.value = e?.response?.data?.message || '提交失败';
    toast.error(error.value);
  } finally { submitting.value = false; }
}

// 4 个必填 (核心素材);LORA/RECIPE/VOICE/PACKAGE 改选填
const requiredTypes = ['THREE_VIEW', 'EXPRESSION_GRID', 'TRANSPARENT_RENDER', 'BIO_TXT'];
const allAssetTypes = [...requiredTypes, 'LORA_FILE', 'RECIPE_TXT', 'VOICE_REF', 'PACKAGE_ZIP'];
const fileTypeLabel: Record<string, string> = {
  THREE_VIEW: '三视图 (jpg/png, ≥2048×2048)',
  EXPRESSION_GRID: '表情矩阵 (5 种表情)',
  TRANSPARENT_RENDER: '立绘图 (PNG 带 alpha)',
  LORA_FILE: 'LoRA 模型 (.safetensors, ≤300MB)',
  RECIPE_TXT: 'Prompt 说明书 (触发词/参数)',
  BIO_TXT: '人物小传 (.txt)',
  VOICE_REF: '声音样本 (.wav, 可选)',
  PACKAGE_ZIP: '完整资产包 (.zip, 可选)',
};

const fileByType = computed(() => {
  const m: Record<string, any> = {};
  for (const f of files.value) m[f.assetType] = f;
  return m;
});

const completion = computed(() => {
  const present = new Set(files.value.filter(f => f.validated).map(f => f.assetType));
  return Math.round((requiredTypes.filter(t => present.has(t)).length / requiredTypes.length) * 100);
});

const canSubmit = computed(() => completion.value === 100 && ip.value?.status === 'PENDING_REVIEW');

onMounted(loadIp);
</script>

<template>
  <div v-if="loading" class="max-w-3xl mx-auto px-6 py-10 space-y-4">
    <Skeleton shape="line" width="40%" height-class="h-6" />
    <Skeleton shape="line" width="60%" height-class="h-3" />
    <div class="space-y-3 mt-8">
      <div v-for="i in 6" :key="i" class="p-4 bg-white border border-line rounded-xl flex items-center justify-between">
        <div class="space-y-2 flex-1">
          <Skeleton shape="line" width="30%" height-class="h-4" />
          <Skeleton shape="line" width="20%" height-class="h-2" />
        </div>
        <Skeleton shape="line" width="15%" height-class="h-8" />
      </div>
    </div>
  </div>
  <div v-else-if="ip" class="max-w-3xl mx-auto px-6 py-10">
    <RouterLink to="/creator" class="text-xs text-ink/50 hover:text-ink mb-4 inline-block">← 返回</RouterLink>

    <div class="flex items-baseline justify-between mb-2">
      <h1 class="font-display text-3xl">{{ ip.displayName }}</h1>
      <span class="font-mono text-xs text-ink/40">{{ ip.code }}</span>
    </div>
    <div class="flex items-center gap-3 mb-2">
      <span class="text-xs px-2 py-0.5 bg-cream border border-line rounded-full">状态: {{ ip.status }}</span>
      <span class="text-xs text-ink/60">完整度 {{ completion }}%</span>
    </div>
    <div class="h-1 bg-cream rounded-full overflow-hidden mb-8">
      <div class="h-full bg-gold transition-all" :style="{ width: completion + '%' }" />
    </div>

    <div v-if="error" class="mb-4 p-3 bg-danger/10 text-danger text-sm rounded-lg">{{ error }}</div>

    <h2 class="font-display text-lg mb-4">资产包上传</h2>
    <div class="space-y-3">
      <div
        v-for="t in allAssetTypes"
        :key="t"
        class="p-4 bg-white border border-line rounded-xl flex items-center justify-between"
      >
        <div class="flex-1">
          <div class="text-sm font-medium">{{ fileTypeLabel[t] }}</div>
          <div v-if="fileByType[t]" class="text-xs text-success mt-1">
            ✓ {{ fileByType[t].originalName }} 已上传
          </div>
          <div v-else-if="requiredTypes.includes(t)" class="text-xs text-danger mt-1">必填,尚未上传</div>
          <div v-else class="text-xs text-ink/40 mt-1">选填</div>
        </div>
        <label
          :class="[
            'px-4 py-2 border rounded-full text-xs transition cursor-pointer',
            uploadingType === t
              ? 'bg-line text-ink/40 border-line cursor-wait'
              : 'bg-cream border-line hover:bg-ink hover:text-cream',
          ]"
        >
          {{ uploadingType === t ? '上传中…' : (fileByType[t] ? '替换' : '上传') }}
          <input
            type="file"
            class="hidden"
            :disabled="!!uploadingType"
            :accept="t === 'LORA_FILE' ? '.safetensors' : t === 'BIO_TXT' || t === 'RECIPE_TXT' ? '.txt,.md' : t === 'VOICE_REF' ? '.wav,.mp3' : t === 'PACKAGE_ZIP' ? '.zip' : 'image/*'"
            @change="(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) requestUploadPolicy(t, f);
              (e.target as HTMLInputElement).value = '';
            }"
          />
        </label>
      </div>
    </div>

    <div class="mt-8 p-4 bg-cream/60 rounded-2xl text-sm text-ink/70 leading-relaxed">
      <strong class="text-ink">合规承诺</strong>：上传素材即视为您确认拥有该 AI 形象的完整知识产权,
      并同意承担《作品原创性及自主承担侵权责任承诺书》的法律责任。平台保留因肖像权、版权争议而下架 IP 的权利。
    </div>

    <div class="mt-8 text-center">
      <button
        v-if="canSubmit"
        @click="submitForReview"
        :disabled="submitting"
        class="px-8 py-3 bg-ink text-cream rounded-full font-medium hover:bg-gold transition disabled:opacity-50"
      >
        {{ submitting ? '提交中...' : '提交审核' }}
      </button>
      <p v-else class="text-sm text-ink/50">资产包完整度达到 100% 后可提交审核</p>
    </div>
  </div>
</template>