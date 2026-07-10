<script setup lang="ts">
/**
 * BuyerWorkbenchPage — 买家工作台
 * W4 D4
 * 跨 workspace 列出该买家所有待处理 deliverable,支持 inline 审批。
 * 默认排除 published (历史已发),按 status 过滤。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';

interface DeliverableItem {
  id: string;
  briefId: string;
  workspaceId: string;
  type: string;
  platform: string;
  url: string;
  thumbnailUrl: string | null;
  spec: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  approvedAt: string | null;
  rejectedReason: string | null;
  publishedAt: string | null;
  publishedUrl: string | null;
  createdAt: string;
  brief: { id: string; title: string };
  workspace: { id: string; creatorId: string };
}

const router = useRouter();
const toast = useToast();

const items = ref<DeliverableItem[]>([]);
const total = ref(0);
const loading = ref(true);
const acting = ref(false);
const filterStatus = ref<string>(''); // 空 = 默认排除 published

const STATUS_LABEL: Record<string, string> = {
  pending: '待审',
  approved: '已通过',
  rejected: '已打回',
  published: '已发布',
};
const PLATFORM_LABEL: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat: '视频号',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

async function fetchWorkbench() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (filterStatus.value) params.status = filterStatus.value;
    const { data } = await apiClient.get<{ items: DeliverableItem[]; total: number }>(
      '/buyer/workbench',
      { params },
    );
    items.value = data.items;
    total.value = data.total;
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '加载工作台失败');
  } finally {
    loading.value = false;
  }
}

async function review(item: DeliverableItem, decision: 'approved' | 'rejected') {
  if (decision === 'rejected' && !confirm('确认打回此交付?创作者可重新发布')) return;
  if (decision === 'approved' && !confirm('确认通过此交付?创作者可一键发布')) return;
  acting.value = true;
  try {
    await apiClient.post(`/buyer/deliverables/${item.id}/review`, { decision });
    toast.success(decision === 'approved' ? '已通过' : '已打回');
    await fetchWorkbench();
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '操作失败');
  } finally {
    acting.value = false;
  }
}

function gotoBrief(briefId: string) {
  router.push({ name: 'buyer-brief-detail', params: { id: briefId } });
}

const statusCounts = computed(() => {
  const c: Record<string, number> = { pending: 0, approved: 0, rejected: 0, published: 0 };
  for (const it of items.value) c[it.status] = (c[it.status] ?? 0) + 1;
  return c;
});

onMounted(fetchWorkbench);
</script>

<template>
  <div class="wb-page">
    <header class="wb-header">
      <h1>买家工作台</h1>
      <p class="wb-hint">跨 workspace 集中处理创作者交付,默认仅显示待审/已通过/已打回</p>
    </header>

    <div class="wb-toolbar">
      <button
        v-for="s in ['', 'pending', 'approved', 'rejected', 'published']"
        :key="s || 'active'"
        :class="['wb-filter', { 'wb-filter-active': filterStatus === s }]"
        @click="filterStatus = s; fetchWorkbench()"
      >
        {{ s === '' ? `待处理 (${statusCounts.pending + statusCounts.approved})` : STATUS_LABEL[s] }}
      </button>
      <span class="wb-total">共 {{ total }} 条</span>
    </div>

    <div v-if="loading" class="wb-loading">加载中…</div>
    <div v-else-if="!items.length" class="wb-empty">暂无交付</div>
    <div v-else class="wb-list">
      <div v-for="d in items" :key="d.id" class="wb-item">
        <div class="wb-item-row1">
          <span :class="['wb-status', `wb-status-${d.status}`]">
            {{ STATUS_LABEL[d.status] ?? d.status }}
          </span>
          <strong class="wb-platform">{{ PLATFORM_LABEL[d.platform] ?? d.platform }}</strong>
          <span class="wb-type">{{ d.type }}</span>
          <span class="wb-time">{{ new Date(d.createdAt).toLocaleString() }}</span>
        </div>

        <div class="wb-item-brief" @click="gotoBrief(d.briefId)">
          📋 {{ d.brief.title }}
        </div>

        <div v-if="d.thumbnailUrl" class="wb-item-thumb">
          <img :src="d.thumbnailUrl" :alt="d.brief.title" />
        </div>

        <div class="wb-item-spec">
          <span v-if="d.spec.duration">时长 {{ d.spec.duration }}s</span>
          <span v-if="d.spec.ratio">比例 {{ d.spec.ratio }}</span>
          <span v-if="d.spec.fileSize">{{ Math.round((d.spec.fileSize as number) / 1024 / 1024) }}MB</span>
          <a v-if="d.publishedUrl" :href="d.publishedUrl" target="_blank" rel="noopener" class="wb-pub-link">
            🔗 平台链接
          </a>
          <a v-else-if="d.url" :href="d.url" target="_blank" rel="noopener" class="wb-src-link">
            📁 源文件
          </a>
        </div>

        <div v-if="d.rejectedReason" class="wb-item-reject">
          打回原因: {{ d.rejectedReason }}
        </div>

        <div v-if="d.status === 'pending'" class="wb-item-actions">
          <button class="wb-btn wb-btn-primary" :disabled="acting" @click="review(d, 'approved')">
            通过
          </button>
          <button class="wb-btn wb-btn-danger" :disabled="acting" @click="review(d, 'rejected')">
            打回
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wb-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 20px 80px;
  color: #1f2937;
}
.wb-header h1 {
  font-size: 22px;
  margin: 0 0 4px;
}
.wb-hint {
  color: #6b7280;
  font-size: 13px;
  margin: 0;
}
.wb-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 16px 0;
  padding: 8px 12px;
  background: #f9fafb;
  border-radius: 8px;
  font-size: 13px;
}
.wb-filter {
  background: transparent;
  border: 0;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  color: #4b5563;
  font-size: 13px;
}
.wb-filter:hover { background: #f3f4f6; }
.wb-filter-active {
  background: #2563eb;
  color: #fff;
}
.wb-total {
  margin-left: auto;
  color: #6b7280;
  font-size: 12px;
}
.wb-loading, .wb-empty {
  text-align: center;
  padding: 60px 0;
  color: #9ca3af;
  font-size: 13px;
}
.wb-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.wb-item {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px;
}
.wb-item-row1 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 13px;
}
.wb-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}
.wb-status-pending { background: #fef3c7; color: #92400e; }
.wb-status-approved { background: #d1fae5; color: #047857; }
.wb-status-rejected { background: #fee2e2; color: #b91c1c; }
.wb-status-published { background: #dbeafe; color: #1d4ed8; }
.wb-platform { font-size: 14px; color: #1f2937; }
.wb-type {
  font-size: 11px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 4px;
}
.wb-time {
  margin-left: auto;
  font-size: 12px;
  color: #9ca3af;
}
.wb-item-brief {
  font-size: 13px;
  color: #4b5563;
  cursor: pointer;
  margin-bottom: 8px;
}
.wb-item-brief:hover { color: #2563eb; }
.wb-item-thumb {
  margin-bottom: 8px;
}
.wb-item-thumb img {
  max-width: 200px;
  max-height: 120px;
  border-radius: 6px;
}
.wb-item-spec {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}
.wb-pub-link, .wb-src-link {
  color: #2563eb;
  text-decoration: none;
}
.wb-pub-link:hover, .wb-src-link:hover { text-decoration: underline; }
.wb-item-reject {
  background: #fef2f2;
  color: #b91c1c;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 8px;
}
.wb-item-actions {
  display: flex;
  gap: 8px;
}
.wb-btn {
  border: 0;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}
.wb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.wb-btn-primary { background: #2563eb; color: #fff; }
.wb-btn-danger { background: #fee2e2; color: #b91c1c; }
</style>