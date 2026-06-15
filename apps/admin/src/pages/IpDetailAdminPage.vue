<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient, publicOssBase } from '@/api/client';

const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id as string);

const ip = ref<any>(null);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const success = ref('');

const rejectReason = ref('');
const certNo = ref('');

const fileTypeLabel: Record<string, string> = {
  THREE_VIEW: '三视图',
  EXPRESSION_GRID: '表情矩阵',
  TRANSPARENT_RENDER: '立绘图',
  LORA_FILE: 'LoRA 模型',
  RECIPE_TXT: 'Prompt 说明书',
  BIO_TXT: '人物小传',
  VOICE_REF: '声音样本',
  PACKAGE_ZIP: '完整资产包',
  LEGAL_PROOF: '训练流程截图',
  TEST_SAMPLE: '示例输出',
};

const requiredTypes = ['THREE_VIEW', 'EXPRESSION_GRID', 'TRANSPARENT_RENDER', 'LORA_FILE', 'RECIPE_TXT', 'BIO_TXT'];

const fileByType = computed(() => {
  const m: Record<string, any> = {};
  for (const f of ip.value?.files || []) m[f.assetType] = f;
  return m;
});

const packComplete = computed(() => requiredTypes.every((t) => fileByType.value[t]?.validated));

async function load() {
  loading.value = true;
  try {
    // 后端 admin 端: /admin/ips/:id 拿完整信息
    const { data } = await apiClient.get(`/admin/ips/${id.value}`);
    ip.value = data.ip;
  } catch (e: any) {
    // fallback: 从公开接口按 id 查不到(只有 code),暂时显示错误
    error.value = e?.response?.data?.message || '加载失败';
  } finally { loading.value = false; }
}

async function approve() {
  if (!confirm('确认审核通过?系统将进入区块链存证流程,完成存证后自动转为 PUBLIC_INTENT。')) return;
  submitting.value = true;
  error.value = ''; success.value = '';
  try {
    const { data } = await apiClient.post(`/ips/${id.value}/approve`);
    ip.value = data.ip;
    success.value = '审核已提交,正在执行存证...请稍后刷新';
  } catch (e: any) {
    error.value = e?.response?.data?.message || '操作失败';
  } finally { submitting.value = false; }
}

async function reject() {
  if (!rejectReason.value.trim()) { error.value = '请填写拒绝原因'; return; }
  if (!confirm('确认拒绝?该 IP 将进入 REJECTED 状态,创作者可见。')) return;
  submitting.value = true;
  error.value = ''; success.value = '';
  try {
    const { data } = await apiClient.post(`/ips/${id.value}/reject`, { reason: rejectReason.value });
    ip.value = data.ip;
    success.value = '已拒绝';
    rejectReason.value = '';
  } catch (e: any) {
    error.value = e?.response?.data?.message || '操作失败';
  } finally { submitting.value = false; }
}

async function registerCert() {
  if (!certNo.value.trim()) { error.value = '请填写国家版权局登记号'; return; }
  if (!confirm(`确认登记号: ${certNo.value} ?该操作将 IP 转为 OFFICIAL_REGISTERED 状态。`)) return;
  submitting.value = true;
  error.value = ''; success.value = '';
  try {
    const { data } = await apiClient.post(`/ips/${id.value}/register-cert`, { certNo: certNo.value });
    ip.value = data.ip;
    success.value = '登记号已写入,IP 已转为 OFFICIAL_REGISTERED';
    certNo.value = '';
  } catch (e: any) {
    error.value = e?.response?.data?.message || '操作失败';
  } finally { submitting.value = false; }
}

function statusLabel(s: string) {
  return { PENDING_REVIEW: '待审核', REVIEWED_PROOFING: '存证中', PUBLIC_INTENT: '公示中', OFFICIAL_REGISTERED: '已登记', REJECTED: '已拒绝', ARCHIVED: '已归档' }[s] || s;
}

function thumbnailUrl(key: string) { return `${publicOssBase}/${key}`; }

onMounted(load);
</script>

<template>
  <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>

  <div v-else-if="ip" class="max-w-5xl mx-auto px-6 py-8">
    <button @click="router.back()" class="text-xs text-ink/50 hover:text-ink mb-4">← 返回</button>

    <!-- Header -->
    <div class="card-base mb-6">
      <div class="flex items-start gap-6">
        <img v-if="ip.thumbnailKey" :src="thumbnailUrl(ip.thumbnailKey)" class="w-32 h-32 rounded-xl object-cover border border-line" />
        <div class="flex-1">
          <div class="flex items-baseline gap-3">
            <h1 class="font-display text-2xl">{{ ip.displayName }}</h1>
            <span class="font-mono text-xs text-ink/40">{{ ip.code }}</span>
          </div>
          <p v-if="ip.tagline" class="text-sm text-ink/60 mt-1">{{ ip.tagline }}</p>
          <div class="flex flex-wrap items-center gap-2 mt-3 text-xs">
            <span class="badge bg-ink/10 text-ink/70">{{ ip.gender }} · {{ ip.visualAgeBucket }}</span>
            <span v-for="t in (ip.styleTags || '').split(',').filter(Boolean)" :key="t" class="badge bg-cream border border-line">{{ t }}</span>
            <span class="badge bg-warn/15 text-warn">{{ statusLabel(ip.status) }}</span>
          </div>
          <div class="mt-3 text-xs text-ink/50 space-y-1">
            <div>创作者: <span class="text-ink">{{ ip.creator?.email }}</span> · {{ ip.creator?.displayName }}</div>
            <div>意向金: ¥{{ (ip.depositPriceFen / 100).toFixed(2) }} · 正式授权起价: ¥{{ (ip.fullLicensePriceFen / 100).toFixed(2) }}</div>
            <div v-if="ip.blockchainTxId">区块链存证: <span class="font-mono">{{ ip.blockchainTxId }}</span> · 哈希 <span class="font-mono">{{ ip.blockchainHash?.slice(0, 16) }}…</span></div>
            <div v-if="ip.officialCertNo">版权登记号: <span class="font-mono">{{ ip.officialCertNo }}</span></div>
            <div v-if="ip.rejectionReason" class="text-danger">拒绝原因: {{ ip.rejectionReason }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="mb-4 p-3 bg-danger/10 text-danger text-sm rounded-lg">{{ error }}</div>
    <div v-if="success" class="mb-4 p-3 bg-success/10 text-success text-sm rounded-lg">{{ success }}</div>

    <!-- 资产包完整度 -->
    <section class="card-base mb-6">
      <h2 class="font-medium mb-4">资产包完整度</h2>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
        <div
          v-for="t in requiredTypes"
          :key="t"
          :class="['p-3 rounded-xl border text-sm', fileByType[t]?.validated ? 'border-success/30 bg-success/5' : 'border-warn/30 bg-warn/5']"
        >
          <div class="font-medium">{{ fileTypeLabel[t] }}</div>
          <div v-if="fileByType[t]?.validated" class="text-xs text-success mt-1">✓ {{ fileByType[t].originalName }}</div>
          <div v-else class="text-xs text-warn mt-1">⚠ 缺失</div>
        </div>
      </div>
    </section>

    <!-- 人物小传 -->
    <section v-if="ip.description" class="card-base mb-6">
      <h2 class="font-medium mb-2">人物小传</h2>
      <pre class="whitespace-pre-wrap text-sm text-ink/80 font-mono">{{ ip.description }}</pre>
    </section>

    <!-- 全部文件 -->
    <section class="card-base mb-6">
      <h2 class="font-medium mb-3">全部已上传文件 ({{ ip.files?.length || 0 }})</h2>
      <table class="w-full text-sm">
        <thead class="bg-cream">
          <tr>
            <th class="table-th">类型</th>
            <th class="table-th">文件名</th>
            <th class="table-th">大小</th>
            <th class="table-th">校验</th>
            <th class="table-th">SHA-256</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in ip.files" :key="f.id" class="border-t border-line">
            <td class="table-td">{{ fileTypeLabel[f.assetType] || f.assetType }}</td>
            <td class="table-td font-mono text-xs">{{ f.originalName }}</td>
            <td class="table-td text-xs">{{ (Number(f.sizeBytes) / 1024 / 1024).toFixed(2) }} MB</td>
            <td class="table-td">
              <span v-if="f.validated" class="badge bg-success/15 text-success">通过</span>
              <span v-else class="badge bg-warn/15 text-warn">待校验</span>
            </td>
            <td class="table-td text-xs font-mono text-ink/50">{{ f.checksumSha256?.slice(0, 12) }}…</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 操作面板 -->
    <section v-if="ip.status === 'PENDING_REVIEW'" class="card-base border-gold/30 bg-gold/5">
      <h2 class="font-medium mb-3">审核操作</h2>
      <div v-if="!packComplete" class="p-3 bg-warn/10 text-warn text-sm rounded-lg mb-4">
        ⚠ 资产包不完整 (缺 {{ requiredTypes.filter(t => !fileByType[t]?.validated).length }} 项),无法通过审核。
      </div>
      <div class="space-y-3">
        <button @click="approve" :disabled="submitting || !packComplete" class="btn-primary">
          ✓ 审核通过 · 进入区块链存证
        </button>
        <div class="flex gap-2">
          <input v-model="rejectReason" placeholder="拒绝原因 (必填)" class="input-base flex-1" />
          <button @click="reject" :disabled="submitting" class="btn-danger">✗ 拒绝</button>
        </div>
      </div>
    </section>

    <section v-else-if="ip.status === 'PUBLIC_INTENT'" class="card-base border-success/30 bg-success/5">
      <h2 class="font-medium mb-3">登记版权</h2>
      <p class="text-xs text-ink/60 mb-3">IP 状态为公示中,需要登记国家版权局号后转为 OFFICIAL_REGISTERED,届时所有意向金订单自动生效。</p>
      <div class="flex gap-2">
        <input v-model="certNo" placeholder="国家版权局登记号 (如:2026-F-1234567)" class="input-base flex-1 font-mono" />
        <button @click="registerCert" :disabled="submitting" class="btn-primary">登记</button>
      </div>
    </section>

    <section v-else class="card-base">
      <div class="text-sm text-ink/60">该 IP 当前状态 ({{ statusLabel(ip.status) }}) 不需要运营操作。</div>
    </section>
  </div>
</template>
