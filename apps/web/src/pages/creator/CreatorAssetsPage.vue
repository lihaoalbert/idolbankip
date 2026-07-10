<script setup lang="ts">
/**
 * 我的资产 — /creator/assets
 * W3 W2 D4
 * 创作者自有数字人模型 / Prompt 模板管理
 */
import { computed, onMounted, ref } from 'vue';
import { useToast } from '@/composables/useToast';
import { apiClient } from '@/api/client';

interface Asset {
  id: string;
  type: 'model' | 'prompt_template';
  name: string;
  ossKey: string | null;
  fileSize: number | null;
  mimeType: string | null;
  content: string | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
}

const toast = useToast();
const tab = ref<'model' | 'prompt_template'>('prompt_template');
const items = ref<Asset[]>([]);
const total = ref(0);
const loading = ref(false);
const editing = ref<Asset | null>(null);
const showForm = ref(false);

const form = ref<{
  name: string;
  content: string;
  ossKey: string;
  tags: string;
}>({
  name: '',
  content: '',
  ossKey: '',
  tags: '',
});

const isEditing = computed(() => editing.value !== null);

async function load() {
  loading.value = true;
  try {
    const { data } = await apiClient.get<{ items: Asset[]; total: number }>(
      '/creator/assets',
      { params: { type: tab.value, size: 100 } },
    );
    items.value = data.items;
    total.value = data.total;
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '加载失败');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.value = { name: '', content: '', ossKey: '', tags: '' };
  showForm.value = true;
}

function openEdit(asset: Asset) {
  editing.value = asset;
  form.value = {
    name: asset.name,
    content: asset.content ?? '',
    ossKey: asset.ossKey ?? '',
    tags: (asset.tags ?? []).join(','),
  };
  showForm.value = true;
}

async function submit() {
  if (!form.value.name.trim()) {
    toast.error('名称必填');
    return;
  }
  const tags = form.value.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  try {
    if (isEditing.value) {
      await apiClient.patch(`/creator/assets/${editing.value!.id}`, {
        name: form.value.name,
        content: form.value.content || undefined,
        tags: tags.length ? tags : undefined,
      });
      toast.success('已更新');
    } else {
      const payload: any = {
        type: tab.value,
        name: form.value.name,
        tags: tags.length ? tags : undefined,
      };
      if (tab.value === 'prompt_template') {
        payload.content = form.value.content;
      } else {
        payload.ossKey = form.value.ossKey || 'mock-oss-key';
      }
      await apiClient.post('/creator/assets', payload);
      toast.success('已新增');
    }
    showForm.value = false;
    await load();
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '保存失败');
  }
}

async function remove(asset: Asset) {
  if (!confirm(`确认删除「${asset.name}」?`)) return;
  try {
    await apiClient.delete(`/creator/assets/${asset.id}`);
    toast.success('已删除');
    await load();
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '删除失败');
  }
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

onMounted(load);
</script>

<template>
  <div class="ca-page">
    <header class="ca-header">
      <h1>我的资产</h1>
      <button class="ca-btn ca-btn-primary" @click="openCreate">
        + 新增{{ tab === 'model' ? '模型' : '模板' }}
      </button>
    </header>

    <div class="ca-tabs">
      <button
        :class="['ca-tab', { 'ca-tab-active': tab === 'prompt_template' }]"
        @click="tab = 'prompt_template'; load()"
      >
        Prompt 模板
      </button>
      <button
        :class="['ca-tab', { 'ca-tab-active': tab === 'model' }]"
        @click="tab = 'model'; load()"
      >
        数字人模型
      </button>
    </div>

    <div v-if="loading" class="ca-loading">加载中…</div>
    <div v-else-if="!items.length" class="ca-empty">
      还没有{{ tab === 'model' ? '模型' : '模板' }},点右上角新增一个
    </div>
    <ul v-else class="ca-list">
      <li v-for="a in items" :key="a.id" class="ca-item">
        <div class="ca-item-main">
          <h3>{{ a.name }}</h3>
          <p v-if="a.type === 'prompt_template' && a.content" class="ca-content">
            {{ a.content.slice(0, 200) }}{{ a.content.length > 200 ? '…' : '' }}
          </p>
          <p v-else-if="a.type === 'model'" class="ca-content">
            OSS: {{ a.ossKey }} · {{ formatSize(a.fileSize) }} · {{ a.mimeType ?? '未知类型' }}
          </p>
          <div v-if="a.tags && a.tags.length" class="ca-tags">
            <span v-for="t in a.tags" :key="t" class="ca-tag">{{ t }}</span>
          </div>
          <p class="ca-time">
            更新于 {{ new Date(a.updatedAt).toLocaleString() }}
          </p>
        </div>
        <div class="ca-item-actions">
          <button class="ca-btn ca-btn-secondary" @click="openEdit(a)">编辑</button>
          <button class="ca-btn ca-btn-danger" @click="remove(a)">删除</button>
        </div>
      </li>
    </ul>

    <div v-if="showForm" class="ca-modal-bg" @click.self="showForm = false">
      <div class="ca-modal">
        <h2>{{ isEditing ? '编辑' : '新增' }}{{ tab === 'model' ? '模型' : '模板' }}</h2>
        <label class="ca-field">
          <span>名称 *</span>
          <input v-model="form.name" placeholder="例如:咖啡厅开场镜头" />
        </label>
        <template v-if="tab === 'prompt_template'">
          <label class="ca-field">
            <span>模板内容 *</span>
            <textarea
              v-model="form.content"
              rows="8"
              placeholder="Prompt 模板正文,JSON 数组或纯文本"
            />
          </label>
        </template>
        <template v-else>
          <label class="ca-field">
            <span>OSS Key</span>
            <input v-model="form.ossKey" placeholder="creators/{id}/models/{filename}" />
          </label>
          <p class="ca-hint">注:D4 mock 阶段 OSS 直传暂未对接,先填 key 占位</p>
        </template>
        <label class="ca-field">
          <span>标签</span>
          <input v-model="form.tags" placeholder="逗号分隔,如:网红脸, 高级感" />
        </label>
        <div class="ca-modal-actions">
          <button class="ca-btn ca-btn-secondary" @click="showForm = false">取消</button>
          <button class="ca-btn ca-btn-primary" @click="submit">
            {{ isEditing ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ca-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 20px 80px;
  color: #1f2937;
}
.ca-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.ca-header h1 {
  font-size: 22px;
  margin: 0;
}
.ca-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 16px;
}
.ca-tab {
  background: none;
  border: 0;
  padding: 10px 16px;
  font-size: 14px;
  cursor: pointer;
  color: #6b7280;
  border-bottom: 2px solid transparent;
}
.ca-tab-active {
  color: #2563eb;
  border-bottom-color: #2563eb;
}
.ca-loading, .ca-empty {
  text-align: center;
  padding: 60px 0;
  color: #6b7280;
}
.ca-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ca-item {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.ca-item-main {
  flex: 1;
  min-width: 0;
}
.ca-item-main h3 {
  margin: 0 0 6px;
  font-size: 15px;
}
.ca-content {
  font-size: 13px;
  color: #4b5563;
  margin: 0 0 8px;
  white-space: pre-wrap;
  word-break: break-word;
}
.ca-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.ca-tag {
  font-size: 11px;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 2px 8px;
  border-radius: 999px;
}
.ca-time {
  font-size: 12px;
  color: #9ca3af;
  margin: 0;
}
.ca-item-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.ca-btn {
  border: 0;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}
.ca-btn-primary { background: #2563eb; color: #fff; }
.ca-btn-secondary { background: #f3f4f6; color: #1f2937; }
.ca-btn-danger { background: #fee2e2; color: #b91c1c; }
.ca-modal-bg {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.ca-modal {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  max-width: 560px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}
.ca-modal h2 {
  margin: 0 0 16px;
  font-size: 18px;
}
.ca-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #4b5563;
}
.ca-field input, .ca-field textarea {
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
}
.ca-field textarea {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 13px;
  resize: vertical;
}
.ca-hint {
  font-size: 12px;
  color: #6b7280;
  margin: -8px 0 12px;
}
.ca-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>