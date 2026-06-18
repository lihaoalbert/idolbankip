<script setup lang="ts">
/**
 * 版权证书审核队列
 * - GET /admin/cert/queue → PENDING_REVIEW 列表
 * - 通过 → cert.status=APPROVED, ip.status=OFFICIAL_REGISTERED
 * - 拒绝 → cert.status=REJECTED, ip.status=PENDING_REVIEW, 创作者可重提
 * - 预览 → GET /admin/cert/{id}/file (后端 SDK get 直读 Buffer, inline 渲染)
 *   - JPG/PNG: inline <img>
 *   - PDF: <a target="_blank"> (浏览器原生 PDF viewer)
 *   - 用 blob URL 绕开 Bearer auth 不能直接放 src/href 的问题
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';

const items = ref<any[]>([]);
const loading = ref(true);
const submitting = ref<string | null>(null);
const error = ref('');
const rejectingId = ref<string | null>(null);
const rejectReason = ref('');
const previewBlobs = ref<Record<string, string>>({}); // certId → blob URL
const previewLoading = ref<Record<string, boolean>>({}); // certId → 是否加载中

async function load() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/admin/cert/queue');
    items.value = data.items || [];
    // 清掉旧 blob
    for (const url of Object.values(previewBlobs.value)) URL.revokeObjectURL(url);
    previewBlobs.value = {};
    // 并行预加载所有 cert 预览 (后端按 certFileType 返回正确 Content-Type)
    await Promise.all(
      items.value.map(async (c) => {
        previewLoading.value[c.id] = true;
        try {
          const res = await apiClient.get(`/admin/cert/${c.id}/file`, { responseType: 'blob' });
          previewBlobs.value[c.id] = URL.createObjectURL(res.data);
        } catch {
          // 预览加载失败不影响主流程 (例如 certFileKey 失效)
        } finally {
          previewLoading.value[c.id] = false;
        }
      }),
    );
  } catch (e: any) {
    error.value = e?.response?.data?.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

async function approve(id: string) {
  if (!confirm('确认通过该证书审核? IP 将变为 OFFICIAL_REGISTERED')) return;
  submitting.value = id; error.value = '';
  try {
    await apiClient.post(`/admin/cert/${id}/approve`);
    await load();
  } catch (e: any) {
    error.value = e?.response?.data?.message || '操作失败';
  } finally { submitting.value = null; }
}

function startReject(id: string) {
  rejectingId.value = id;
  rejectReason.value = '';
}

function cancelReject() {
  rejectingId.value = null;
  rejectReason.value = '';
}

async function confirmReject() {
  if (!rejectingId.value) return;
  if (!rejectReason.value.trim() || rejectReason.value.trim().length < 5) {
    error.value = '拒绝原因至少 5 字';
    return;
  }
  const id = rejectingId.value;
  submitting.value = id; error.value = '';
  try {
    await apiClient.post(`/admin/cert/${id}/reject`, { reason: rejectReason.value.trim() });
    rejectingId.value = null;
    rejectReason.value = '';
    await load();
  } catch (e: any) {
    error.value = e?.response?.data?.message || '操作失败';
  } finally { submitting.value = null; }
}

function timeAgo(s: string): string {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

function fmtSize(b?: string): string {
  if (!b) return '—';
  const n = Number(b);
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

onBeforeUnmount(() => {
  for (const url of Object.values(previewBlobs.value)) URL.revokeObjectURL(url);
});

onMounted(load);
</script>

<template>
  <div class="max-w-5xl mx-auto px-6 py-8">
    <div class="flex items-baseline justify-between mb-6">
      <h1 class="font-display text-2xl">版权证书审核队列</h1>
      <button @click="load" class="text-xs text-ink/60 hover:text-ink">刷新</button>
    </div>

    <div v-if="error" class="mb-4 p-3 bg-danger/10 text-danger text-sm rounded-lg">{{ error }}</div>
    <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>

    <div v-else-if="items.length === 0" class="text-center py-20 text-ink/40">
      暂无待审核证书<br>
      <span class="text-xs">创作者在 IP 状态为 PUBLIC_INTENT 时可提交证书</span>
    </div>

    <div v-else class="space-y-3">
      <div v-for="c in items" :key="c.id" class="card-base">
        <!-- 拒绝表单 (内联) -->
        <div v-if="rejectingId === c.id" class="space-y-3">
          <div class="text-sm font-medium">拒绝原因 <span class="text-danger">*</span> <span class="text-ink/40 text-xs">(≥5 字)</span></div>
          <textarea
            v-model="rejectReason"
            rows="3"
            class="w-full px-3 py-2 border border-line rounded-lg bg-cream text-sm"
            placeholder="如: 证书不清晰 / 缺少签发机构盖章 / 与 IP 形象不符"
          />
          <div class="flex justify-end gap-2">
            <button @click="cancelReject" class="px-4 py-2 text-sm text-ink/60 hover:text-ink">取消</button>
            <button
              @click="confirmReject"
              :disabled="submitting === c.id || rejectReason.trim().length < 5"
              class="px-4 py-2 bg-danger text-white rounded-full text-sm hover:bg-danger/90 disabled:opacity-50"
            >
              {{ submitting === c.id ? '提交中…' : '确认拒绝' }}
            </button>
          </div>
        </div>

        <!-- 默认展示 -->
        <div v-else class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0 space-y-3">
            <!-- 头部: IP + 状态 -->
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium">{{ c.ip?.displayName || '—' }}</span>
              <span class="text-xs text-ink/50 font-mono">{{ c.ip?.code }}</span>
              <span class="badge bg-warn/15 text-warn">PENDING_REVIEW</span>
            </div>

            <!-- 预览区 (JPG/PNG inline, PDF link) -->
            <div class="p-3 bg-cream/40 border border-line rounded-xl">
              <div v-if="previewLoading[c.id] && !previewBlobs[c.id]" class="text-xs text-ink/40 py-6 text-center">
                加载预览中...
              </div>
              <img
                v-else-if="previewBlobs[c.id] && (c.certFileType === 'JPG' || c.certFileType === 'PNG')"
                :src="previewBlobs[c.id]"
                :alt="c.certFileName"
                class="max-h-72 max-w-full rounded border border-line/60 bg-white"
              />
              <div v-else-if="previewBlobs[c.id] && c.certFileType === 'PDF'" class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2 text-sm text-ink/70">
                  <span class="text-2xl">📄</span>
                  <span>PDF 证书已就绪, 点击在新窗口打开</span>
                </div>
                <a
                  :href="previewBlobs[c.id]"
                  target="_blank"
                  rel="noopener"
                  class="inline-flex items-center gap-1.5 px-4 py-2 bg-ink text-cream rounded-full text-xs font-medium hover:bg-gold transition shrink-0"
                >
                  在新窗口查看 PDF →
                </a>
              </div>
              <div v-else class="text-xs text-ink/40 py-3 text-center">预览加载失败, 仅凭文件名/大小审核</div>
            </div>

            <!-- 元信息 -->
            <div class="text-sm text-ink/70 space-y-1">
              <div>创作者: <span class="text-ink">{{ c.ip?.creator?.displayName || c.ip?.creator?.email || '—' }}</span></div>
              <div class="flex items-center gap-3 flex-wrap">
                <span>文件: <span class="font-mono text-xs">{{ c.certFileName || '—' }}</span> · {{ fmtSize(c.certFileSize) }} · <span class="badge bg-ink/5 text-ink/70">{{ c.certFileType }}</span></span>
              </div>
              <div v-if="c.selfCertNo">证书编号: <span class="font-mono text-xs">{{ c.selfCertNo }}</span></div>
              <div v-if="c.selfIssuedAt">签发日期: {{ new Date(c.selfIssuedAt).toLocaleDateString() }}</div>
              <div class="text-xs text-ink/50 pt-1">提交于 {{ timeAgo(c.createdAt) }}</div>
            </div>
          </div>
          <div class="flex flex-col gap-2 shrink-0">
            <button @click="approve(c.id)" :disabled="submitting === c.id" class="btn-primary">通过</button>
            <button @click="startReject(c.id)" :disabled="submitting === c.id" class="btn-danger">拒绝</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>