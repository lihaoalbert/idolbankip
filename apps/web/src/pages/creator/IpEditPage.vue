<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const ipId = computed(() => route.params.id as string);

const ip = ref<any>(null);
const files = ref<any[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');

async function fetch() {
  loading.value = true;
  try {
    const list = await apiClient.get('/ips/mine/list');
    const found = list.data.items.find((x: any) => x.id === ipId.value);
    if (!found) { error.value = '未找到 IP'; return; }
    ip.value = found;
    files.value = found.files || [];
  } finally { loading.value = false; }
}

async function requestUploadPolicy(assetType: string, file: File) {
  const { data: policy } = await apiClient.post('/upload/policy', {
    ipId: ipId.value,
    assetType,
    filename: file.name,
    size: file.size,
  });
  // 真实环境: 用 policy 直接 POST 到 OSS,再触发 callback
  // MVP 简化: 直接调 /upload/oss-callback 模拟上传成功
  await apiClient.post('/upload/oss-callback', {
    filename: file.name,
    size: file.size,
    etag: 'mock-etag-' + Date.now(),
    x: `ips/${ip.value.code}/raw/${assetType}/${Date.now()}/${file.name}`,
  });
  await fetch();
}

async function submitForReview() {
  submitting.value = true;
  error.value = '';
  try {
    await apiClient.post(`/ips/${ipId.value}/submit`);
    router.push('/creator');
  } catch (e: any) {
    error.value = e?.response?.data?.message || '提交失败';
  } finally { submitting.value = false; }
}

const requiredTypes = ['THREE_VIEW', 'EXPRESSION_GRID', 'TRANSPARENT_RENDER', 'LORA_FILE', 'RECIPE_TXT', 'BIO_TXT'];
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

onMounted(fetch);
</script>

<template>
  <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>
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
        v-for="t in [...requiredTypes, 'VOICE_REF', 'PACKAGE_ZIP']"
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
        <label class="px-4 py-2 bg-cream border border-line rounded-full text-xs hover:bg-ink hover:text-cream transition cursor-pointer">
          {{ fileByType[t] ? '替换' : '上传' }}
          <input
            type="file"
            class="hidden"
            :accept="t === 'LORA_FILE' ? '.safetensors' : t === 'BIO_TXT' || t === 'RECIPE_TXT' ? '.txt,.md' : t === 'VOICE_REF' ? '.wav,.mp3' : t === 'PACKAGE_ZIP' ? '.zip' : 'image/*'"
            @change="(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) requestUploadPolicy(t, f);
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