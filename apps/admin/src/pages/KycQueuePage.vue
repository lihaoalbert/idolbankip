<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';

const items = ref<any[]>([]);
const loading = ref(true);
const submitting = ref<string | null>(null);
const error = ref('');

async function load() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/kyc/queue');
    items.value = data.items;
  } finally { loading.value = false; }
}

async function approve(id: string) {
  if (!confirm('确认通过该 KYC 审核?')) return;
  submitting.value = id; error.value = '';
  try {
    await apiClient.post(`/kyc/${id}/approve`, { notes: '审核通过' });
    await load();
  } catch (e: any) {
    error.value = e?.response?.data?.message || '操作失败';
  } finally { submitting.value = null; }
}

async function reject(id: string) {
  const reason = prompt('拒绝原因:');
  if (!reason) return;
  submitting.value = id; error.value = '';
  try {
    await apiClient.post(`/kyc/${id}/reject`, { notes: reason });
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

onMounted(load);
</script>

<template>
  <div class="max-w-5xl mx-auto px-6 py-8">
    <h1 class="font-display text-2xl mb-6">KYC 审核队列</h1>

    <div v-if="error" class="mb-4 p-3 bg-danger/10 text-danger text-sm rounded-lg">{{ error }}</div>
    <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>

    <div v-else-if="items.length === 0" class="text-center py-20 text-ink/40">暂无待审 KYC</div>

    <div v-else class="space-y-3">
      <div v-for="k in items" :key="k.id" class="card-base">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-2">
              <span class="font-medium">{{ k.user?.displayName || k.user?.email }}</span>
              <span class="text-xs text-ink/50 font-mono">{{ k.user?.email }}</span>
              <span :class="['badge', k.status === 'PENDING' ? 'bg-warn/15 text-warn' : k.status === 'APPROVED' ? 'bg-success/15 text-success' : 'bg-danger/10 text-danger']">
                {{ k.status }}
              </span>
            </div>
            <div class="text-sm text-ink/70 space-y-1">
              <div>真实姓名: <span class="font-medium text-ink">{{ k.payload?.realName || '—' }}</span></div>
              <div>身份证号: <span class="font-mono text-xs">{{ k.payload?.idNumber || '—' }}</span></div>
              <div class="text-xs text-ink/50">提交于 {{ timeAgo(k.createdAt) }}</div>
            </div>
          </div>
          <div v-if="k.status === 'PENDING'" class="flex gap-2">
            <button @click="approve(k.id)" :disabled="submitting === k.id" class="btn-primary">通过</button>
            <button @click="reject(k.id)" :disabled="submitting === k.id" class="btn-danger">拒绝</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
