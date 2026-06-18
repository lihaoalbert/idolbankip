<script setup lang="ts">
/**
 * 版权证书提交组件 — IP.status=PUBLIC_INTENT 时显示
 *
 * 流程:
 *   1. 创作者选 file type (PDF/JPG/PNG) + 文件 + selfCertNo + selfIssuedAt
 *   2. 调 POST /upload/cert-policy 拿 OSS 直传 policy
 *   3. 用 policy + FormData 直传 OSS
 *   4. 调 POST /ips/:id/cert 写 DB (后端 verifyCertObject HEAD+magc 校验)
 *   5. 显示"已提交,等待审核"; 拒绝后显示 rejectionReason + 重新提交按钮
 */
import { computed, ref } from 'vue';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';

interface ExistingCert {
  id: string;
  certFileType?: 'PDF' | 'JPG' | 'PNG';
  certFileName?: string;
  certFileSize?: string;
  selfCertNo?: string;
  selfIssuedAt?: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  certNo?: string;
  certIssuedAt?: string;
}

const props = defineProps<{
  ipId: string;
  existingCert: ExistingCert | null;
  // #31: 检查 IP.faceCloseupFileId — 无版权图就提示创作者先去补传
  ip?: { faceCloseupFileId?: string | null; code: string };
}>();

const hasFaceCloseup = computed(() => !!props.ip?.faceCloseupFileId);

const emit = defineEmits<{ (e: 'submitted', cert: any): void }>();

const toast = useToast();

const certFileType = ref<'PDF' | 'JPG' | 'PNG'>('PDF');
const file = ref<File | null>(null);
const selfCertNo = ref('');
const selfIssuedAt = ref<string>('');
const uploading = ref(false);
const errorMsg = ref('');

const certTypeLabel: Record<string, string> = {
  PDF: 'PDF (推荐, 100KB-20MB)',
  JPG: 'JPG 扫描件 (10KB-20MB)',
  PNG: 'PNG 扫描件 (10KB-20MB)',
};

const acceptMap: Record<string, string> = {
  PDF: '.pdf,application/pdf',
  JPG: '.jpg,.jpeg,image/jpeg',
  PNG: '.png,image/png',
};

const minSize = computed(() => (certFileType.value === 'PDF' ? 1_000 : 10_000));
const maxSize = 20 * 1024 * 1024;

const canSubmit = computed(() =>
  hasFaceCloseup.value &&
  !!file.value &&
  file.value.size >= minSize.value &&
  file.value.size <= maxSize,
);

const certStatus = computed(() => props.existingCert?.status ?? null);
const isPending = computed(() => certStatus.value === 'PENDING_REVIEW');
const isApproved = computed(() => certStatus.value === 'APPROVED');
const isRejected = computed(() => certStatus.value === 'REJECTED');

function pickFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null;
  file.value = f;
  errorMsg.value = '';
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}

async function submit() {
  errorMsg.value = '';
  if (!canSubmit.value) {
    errorMsg.value = '请选择合法大小的文件';
    return;
  }
  uploading.value = true;
  try {
    // 1. 拿 cert policy
    const { data: policy } = await apiClient.post('/upload/cert-policy', {
      ipId: props.ipId,
      certFileType: certFileType.value,
      filename: file.value!.name,
      size: file.value!.size,
    });
    // 2. 直传 OSS
    const fd = new FormData();
    fd.append('key', policy.key);
    fd.append('policy', policy.policy);
    fd.append('OSSAccessKeyId', policy.accessKeyId);
    fd.append('Signature', policy.signature);
    fd.append('file', file.value!);
    const ossRes = await fetch(policy.host + '/', { method: 'POST', body: fd });
    if (!ossRes.ok) throw new Error(`OSS 上传失败 HTTP ${ossRes.status}`);
    // 3. 写 DB (后端做 HEAD + magic 校验)
    const { data: result } = await apiClient.post(`/ips/${props.ipId}/cert`, {
      certFileType: certFileType.value,
      certFileKey: policy.key,
      certFileName: file.value!.name,
      certFileSize: file.value!.size,
      selfCertNo: selfCertNo.value.trim() || undefined,
      selfIssuedAt: selfIssuedAt.value || undefined,
    });
    toast.success('证书已提交, 等待审核');
    file.value = null;
    selfCertNo.value = '';
    selfIssuedAt.value = '';
    emit('submitted', result.cert);
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '提交失败';
    errorMsg.value = Array.isArray(msg) ? msg.join('; ') : msg;
    toast.error(errorMsg.value);
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <!-- 已通过 — 只读展示 -->
  <div v-if="isApproved" class="p-4 bg-success/10 border border-success/30 rounded-xl space-y-1">
    <div class="text-sm font-medium text-success">✓ 证书已通过审核</div>
    <div class="text-xs text-ink/70 space-y-0.5">
      <div v-if="existingCert?.certNo">证书编号: <span class="font-mono">{{ existingCert.certNo }}</span></div>
      <div v-if="existingCert?.certIssuedAt">登记日期: {{ new Date(existingCert.certIssuedAt).toLocaleDateString() }}</div>
    </div>
  </div>

  <!-- 审核中 — 不允许重新提交 -->
  <div v-else-if="isPending" class="p-4 bg-gold/10 border border-gold/30 rounded-xl space-y-1">
    <div class="text-sm font-medium">⏳ 证书审核中</div>
    <div class="text-xs text-ink/70">
      已提交 <span v-if="existingCert?.certFileName">「{{ existingCert.certFileName }}」</span>, 平台正在审核, 通常 1-3 个工作日。
    </div>
  </div>

  <!-- 拒绝 / 无 cert — 提交表单 -->
  <div v-else class="space-y-4">
    <div v-if="isRejected" class="p-3 bg-danger/10 border border-danger/30 rounded-xl text-sm space-y-1">
      <div class="font-medium text-danger">✕ 上次提交被拒</div>
      <div v-if="existingCert?.rejectionReason" class="text-xs text-ink/70">原因: {{ existingCert.rejectionReason }}</div>
      <div class="text-xs text-ink/60">请补充资料后重新提交</div>
    </div>

    <!-- #31: 无面部特写时拦截,强制先回步骤② 补传 -->
    <div v-if="!hasFaceCloseup" class="p-3 bg-danger/10 border border-danger/30 rounded-xl text-sm space-y-1">
      <div class="font-medium text-danger">⚠️ 需先上传【面部特写】</div>
      <div class="text-xs text-ink/70">登记版权需以"版权图"为证据。请回 <strong>步骤 ② 资产包</strong> 上传至少 1 张面部特写并指定为版权图 (⭐)。</div>
    </div>

    <div>
      <label class="text-xs text-ink/60 block mb-1">证书文件 <span class="text-danger">*</span></label>
      <div class="grid grid-cols-3 gap-2 mb-2">
        <button
          v-for="t in (['PDF', 'JPG', 'PNG'] as const)"
          :key="t"
          type="button"
          @click="certFileType = t"
          :class="certFileType === t ? 'bg-ink text-cream' : 'bg-cream text-ink/60 border border-line hover:bg-line/40'"
          class="px-3 py-1.5 text-xs rounded-full"
        >{{ t }}</button>
      </div>
      <div class="text-[10px] text-ink/40 mb-2">{{ certTypeLabel[certFileType] }}</div>
      <label class="block w-full px-3 py-2.5 border border-line rounded-lg bg-cream text-sm cursor-pointer hover:border-gold">
        <span v-if="file" class="font-mono text-xs">{{ file.name }} · {{ fmtSize(file.size) }}</span>
        <span v-else class="text-ink/50 text-xs">点击选择文件 (max 20MB)</span>
        <input
          type="file"
          class="hidden"
          :accept="acceptMap[certFileType]"
          @change="pickFile"
        />
      </label>
      <div v-if="file && (file.size < minSize || file.size > maxSize)" class="text-xs text-danger mt-1">
        大小需在 {{ fmtSize(minSize) }} - {{ fmtSize(maxSize) }} 之间
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="text-xs text-ink/60 block mb-1">证书编号 <span class="text-ink/40 text-[10px]">(选填)</span></label>
        <input v-model="selfCertNo" class="w-full px-3 py-2 border border-line rounded-lg bg-cream text-sm font-mono" placeholder="如: 国作登字-2026-X-XXXXXXX" />
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-1">签发日期 <span class="text-ink/40 text-[10px]">(选填)</span></label>
        <input v-model="selfIssuedAt" type="date" class="w-full px-3 py-2 border border-line rounded-lg bg-cream text-sm" />
      </div>
    </div>

    <div v-if="errorMsg" class="p-3 bg-danger/10 text-danger text-xs rounded-lg">{{ errorMsg }}</div>

    <button
      type="button"
      @click="submit"
      :disabled="uploading || !canSubmit"
      class="w-full px-6 py-2.5 bg-ink text-cream rounded-full text-sm font-medium hover:bg-gold transition disabled:opacity-50"
    >
      {{ uploading ? '提交中…' : (isRejected ? '重新提交证书' : '提交版权证书') }}
    </button>
  </div>
</template>
