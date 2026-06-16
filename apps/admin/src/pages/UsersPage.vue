<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';

const items = ref<any[]>([]);
const loading = ref(true);

const roleColor: Record<string, string> = {
  CREATOR: 'bg-gold/20 text-ink',
  BUYER: 'bg-ink/10 text-ink/60',
  ADMIN: 'bg-danger/10 text-danger',
};

const kycColor: Record<string, string> = {
  NOT_SUBMITTED: 'bg-ink/10 text-ink/50',
  PENDING: 'bg-warn/15 text-warn',
  APPROVED: 'bg-success/15 text-success',
  REJECTED: 'bg-danger/10 text-danger',
};

async function load() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/admin/users', { params: { page: 1, size: 200 } });
    items.value = data.items || data.users || [];
  } catch (e) {
    // 后端可能没实现,使用空列表
    items.value = [];
  } finally { loading.value = false; }
}

onMounted(load);
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 py-8">
    <h1 class="font-display text-2xl mb-6">用户列表</h1>
    <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>
    <div v-else-if="items.length === 0" class="text-center py-20 text-ink/40">暂无数据 (后端 /admin/users 未实现)</div>
    <div v-else class="bg-white border border-line rounded-2xl overflow-hidden">
      <table class="w-full">
        <thead class="bg-cream">
          <tr>
            <th class="table-th">用户</th>
            <th class="table-th">角色</th>
            <th class="table-th">KYC</th>
            <th class="table-th">注册时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in items" :key="u.id" class="border-t border-line">
            <td class="table-td">
              <div class="font-medium">{{ u.displayName }}</div>
              <div class="text-xs text-ink/50 font-mono">{{ u.email }}</div>
            </td>
            <td class="table-td">
              <span v-for="r in (u.roles || [u.role].filter(Boolean))" :key="r" :class="['badge mr-1', roleColor[r]]">{{ r }}</span>
            </td>
            <td class="table-td"><span :class="['badge', kycColor[u.kycStatus]]">{{ u.kycStatus }}</span></td>
            <td class="table-td text-xs text-ink/50">{{ new Date(u.createdAt).toLocaleString('zh-CN') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
