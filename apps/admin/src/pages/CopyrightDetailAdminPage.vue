<script setup lang="ts">
/**
 * #30.6.26 Admin 著作权登记详情 + 状态推进面板.
 * 镜像 IpDetailAdminPage.vue:451-488 的状态条件操作面板模板.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { copyrightAdminApi, type RegistrationStage } from '@/api/copyright';

const route = useRoute();
const ipId = route.params.ipId as string;

const reg = ref<any>(null);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const success = ref('');

const acceptAppNo = ref('');
const certNo = ref('');
const rejectReason = ref('');

const stageLabel: Record<RegistrationStage, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交,待受理',
  ACCEPTED: '已受理,待审查',
  UNDER_REVIEW: '审查中',
  CERTIFIED: '✓ 已登记',
  REJECTED: '已驳回',
  WITHDRAWN: '已撤回',
};

const stageColor: Record<RegistrationStage, string> = {
  DRAFT: 'bg-ink/10 text-ink/60',
  SUBMITTED: 'bg-warn/15 text-warn',
  ACCEPTED: 'bg-info/15 text-info',
  UNDER_REVIEW: 'bg-info/15 text-info',
  CERTIFIED: 'bg-success/15 text-success',
  REJECTED: 'bg-danger/10 text-danger',
  WITHDRAWN: 'bg-ink/10 text-ink/40',
};

const levelLabel: Record<string, string> = { NATIONAL: '国家级', PROVINCIAL: '地方级' };
const ownerLabel: Record<string, string> = { INDIVIDUAL: '个人', COMPANY: '企业' };

function fmtFen(fen: number | null) {
  if (fen == null) return '—';
  return `¥${(fen / 100).toFixed(2)}`;
}
function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('zh-CN', { hour12: false });
}

async function load() {
  loading.value = true;
  try {
    reg.value = await copyrightAdminApi.detail(ipId);
  } catch (e: any) {
    error.value = e?.response?.data?.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

const stage = computed(() => reg.value?.workflowStage as RegistrationStage | undefined);

const stageLabelFor = (s: any) => (s && stageLabel[s as RegistrationStage]) || s || '—';
const stageColorFor = (s: any) => (s && stageColor[s as RegistrationStage]) || 'bg-ink/10 text-ink/60';

// 每个阶段允许的操作
const canAccept = computed(() => stage.value === 'SUBMITTED');
const canCertify = computed(() => stage.value === 'ACCEPTED' || stage.value === 'UNDER_REVIEW');
const canUnderReview = computed(() => stage.value === 'ACCEPTED');
const canReject = computed(() => stage.value === 'ACCEPTED' || stage.value === 'UNDER_REVIEW' || stage.value === 'SUBMITTED');

async function doAccept() {
  if (!acceptAppNo.value.trim() || acceptAppNo.value.length < 5) {
    error.value = '受理号至少 5 字';
    return;
  }
  if (!confirm(`确认受理?受理号: ${acceptAppNo.value}`)) return;
  submitting.value = true;
  try {
    await copyrightAdminApi.accept(ipId, acceptAppNo.value.trim());
    success.value = '已受理,等待审查';
    error.value = '';
    await load();
  } catch (e: any) {
    error.value = e?.response?.data?.message || '受理失败';
  } finally {
    submitting.value = false;
  }
}

async function doUnderReview() {
  if (!confirm('标记为审查中?')) return;
  submitting.value = true;
  try {
    await copyrightAdminApi.underReview(ipId);
    success.value = '已标记审查中';
    await load();
  } catch (e: any) {
    error.value = e?.response?.data?.message || '操作失败';
  } finally {
    submitting.value = false;
  }
}

async function doCertify() {
  if (!certNo.value.trim() || certNo.value.length < 5) {
    error.value = '证书号至少 5 字';
    return;
  }
  if (!confirm(`确认登记成功?证书号: ${certNo.value}\n\n此操作会同步写 IP.officialCertNo,创作者立即可见。`)) return;
  submitting.value = true;
  try {
    await copyrightAdminApi.certify(ipId, certNo.value.trim());
    success.value = '🎉 登记成功,创作者已收到通知';
    error.value = '';
    await load();
  } catch (e: any) {
    error.value = e?.response?.data?.message || '登记失败';
  } finally {
    submitting.value = false;
  }
}

async function doReject() {
  if (rejectReason.value.trim().length < 5) {
    error.value = '拒绝原因至少 5 字';
    return;
  }
  if (!confirm(`确认驳回?原因: ${rejectReason.value}`)) return;
  submitting.value = true;
  try {
    await copyrightAdminApi.reject(ipId, rejectReason.value.trim());
    success.value = '已驳回,创作者会收到通知';
    error.value = '';
    await load();
  } catch (e: any) {
    error.value = e?.response?.data?.message || '驳回失败';
  } finally {
    submitting.value = false;
  }
}

async function downloadPdf() {
  try {
    const r = await copyrightAdminApi.pdfUrl(ipId);
    window.open(r.url, '_blank');
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'PDF 下载失败';
  }
}

onMounted(load);
</script>

<template>
  <div class="max-w-5xl mx-auto px-6 py-8 space-y-6">
    <div class="flex items-baseline justify-between">
      <h1 class="font-display text-2xl">著作权登记详情</h1>
      <RouterLink to="/copyright-reg/queue" class="text-sm text-ink/50 hover:text-ink">← 返回队列</RouterLink>
    </div>

    <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>

    <div v-else-if="error && !reg" class="text-center py-20 text-danger">{{ error }}</div>

    <template v-else-if="reg">
      <!-- IP + 状态总览 -->
      <section class="card-base">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div class="min-w-0">
            <div class="text-sm text-ink/50">IP</div>
            <div class="font-display text-lg">{{ reg.ip.displayName }}</div>
            <div class="text-xs font-mono text-ink/50">{{ reg.ip.code }}</div>
          </div>
          <div class="flex flex-col items-end gap-2">
            <span :class="['badge', stageColorFor(reg.workflowStage)]">{{ stageLabelFor(reg.workflowStage) }}</span>
            <span class="text-xs text-ink/50">代办费 {{ fmtFen(reg.creatorAgentFeeFen) }}</span>
          </div>
        </div>
      </section>

      <!-- 申请信息 -->
      <section class="card-base">
        <h2 class="font-medium mb-4">申请信息</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><div class="text-xs text-ink/50">著作权人</div><div>{{ reg.ownerName }} <span class="text-ink/50">({{ ownerLabel[reg.ownerType] }})</span></div></div>
          <div><div class="text-xs text-ink/50">身份证号</div><div class="font-mono">{{ reg.ownerIdNumber || '—' }}</div></div>
          <div><div class="text-xs text-ink/50">级别</div><div>{{ levelLabel[reg.registrationType] }}{{ reg.registrationRegion ? ` · ${reg.registrationRegion}` : '' }}</div></div>
          <div><div class="text-xs text-ink/50">申请时间</div><div>{{ fmtDate(reg.submittedAt) }}</div></div>
          <div><div class="text-xs text-ink/50">受理时间</div><div>{{ fmtDate(reg.acceptedAt) }}</div></div>
          <div><div class="text-xs text-ink/50">受理号</div><div class="font-mono">{{ reg.applicationNo || '—' }}</div></div>
          <div><div class="text-xs text-ink/50">审查时间</div><div>{{ fmtDate(reg.reviewedAt) }}</div></div>
          <div><div class="text-xs text-ink/50">登记时间</div><div>{{ fmtDate(reg.certifiedAt) }}</div></div>
          <div><div class="text-xs text-ink/50">证书号</div><div class="font-mono">{{ reg.certificateNo || '—' }}</div></div>
        </div>
        <div v-if="reg.rejectionReason" class="mt-4 p-3 bg-danger/10 text-danger text-sm rounded-lg">
          <strong>驳回原因:</strong>{{ reg.rejectionReason }}
        </div>
      </section>

      <!-- 创作者信息 -->
      <section class="card-base">
        <h2 class="font-medium mb-3">创作者</h2>
        <div class="text-sm space-y-1">
          <div>{{ reg.ip.creator.displayName }} <span class="text-ink/50">· {{ reg.ip.creator.email }}</span></div>
          <div v-if="reg.ip.creator.phone" class="text-xs text-ink/50">📱 {{ reg.ip.creator.phone }}</div>
        </div>
      </section>

      <!-- 素材清单 -->
      <section v-if="reg.ip.files?.length" class="card-base">
        <h2 class="font-medium mb-3">登记素材 ({{ reg.ip.files.length }} 项)</h2>
        <ul class="text-sm space-y-1">
          <li v-for="f in reg.ip.files" :key="f.id" class="flex items-center justify-between gap-3">
            <div class="min-w-0 truncate">
              <span class="text-ink/50 text-xs mr-2">{{ f.assetType }}</span>
              {{ f.originalName }}
            </div>
            <span class="text-xs text-ink/50 font-mono shrink-0">{{ (Number(f.sizeBytes) / 1024 / 1024).toFixed(2) }} MB</span>
          </li>
        </ul>
      </section>

      <!-- 反馈 banner -->
      <div v-if="success" class="card-base border-success/30 bg-success/10 text-success">{{ success }}</div>
      <div v-if="error" class="card-base border-danger/30 bg-danger/10 text-danger">{{ error }}</div>

      <!-- 操作面板 -->
      <section v-if="canAccept || canCertify || canReject" class="card-base border-gold/30 bg-gold/5">
        <h2 class="font-medium mb-3">代办操作</h2>
        <div class="space-y-4">

          <!-- SUBMITTED → ACCEPTED -->
          <div v-if="canAccept" class="space-y-2">
            <div class="text-xs text-ink/60">📋 平台递交给版权局后,填受理号确认受理</div>
            <div class="flex gap-2">
              <input v-model="acceptAppNo" placeholder="受理号 (≥5 字,例:国作受字-2026-001)" class="input-base flex-1 font-mono" />
              <button @click="doAccept" :disabled="submitting" class="btn-primary">✓ 受理</button>
            </div>
          </div>

          <!-- ACCEPTED → UNDER_REVIEW (可选) -->
          <div v-if="canUnderReview" class="space-y-2 pt-2 border-t border-gold/20">
            <div class="text-xs text-ink/60">🔍 标记为审查中(过渡态,可跳过直接 CERTIFIED)</div>
            <button @click="doUnderReview" :disabled="submitting" class="btn-secondary">🔍 标记审查中</button>
          </div>

          <!-- ACCEPTED/UNDER_REVIEW → CERTIFIED -->
          <div v-if="canCertify" class="space-y-2 pt-2 border-t border-gold/20">
            <div class="text-xs text-ink/60">🎉 版权局下证后,填证书号确认登记成功(同步写 IP.officialCertNo)</div>
            <div class="flex gap-2">
              <input v-model="certNo" placeholder="证书号 (≥5 字,例:国作登字-2026-F-001)" class="input-base flex-1 font-mono" />
              <button @click="doCertify" :disabled="submitting" class="btn-primary">🎉 登记成功</button>
            </div>
          </div>

          <!-- 任意非终态 → REJECTED -->
          <div v-if="canReject" class="space-y-2 pt-2 border-t border-gold/20">
            <div class="text-xs text-ink/60">✗ 驳回申请 (创作者可见原因,可重提)</div>
            <div class="flex gap-2">
              <input v-model="rejectReason" placeholder="驳回原因 (≥5 字)" class="input-base flex-1" />
              <button @click="doReject" :disabled="submitting" class="btn-danger">✗ 驳回</button>
            </div>
          </div>
        </div>
      </section>

      <section v-else class="card-base">
        <div class="text-sm text-ink/60">该申请当前阶段 ({{ stageLabelFor(reg.workflowStage) }}) 已为终态,无需运营操作。</div>
      </section>

      <!-- 辅助 -->
      <section class="card-base">
        <h2 class="font-medium mb-3">辅助操作</h2>
        <button @click="downloadPdf" class="btn-secondary">📄 下载 / 重新生成 PDF 申请包</button>
      </section>
    </template>
  </div>
</template>