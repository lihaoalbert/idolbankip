<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';

const items = ref<any[]>([]);
const loading = ref(true);
const filter = ref<'PENDING_REVIEW' | 'REVIEWED_PROOFING' | 'PUBLIC_INTENT' | 'OFFICIAL_REGISTERED' | 'REJECTED'>('PENDING_REVIEW');
// #32 标签筛选
const filterGender = ref<string>('');
const filterAgeBucket = ref<string>('');
const filterEthnicity = ref<string>('');

const statusLabel: Record<string, string> = {
  PENDING_REVIEW: '待审核',
  REVIEWED_PROOFING: '存证中',
  PUBLIC_INTENT: '公示中',
  OFFICIAL_REGISTERED: '已登记',
  REJECTED: '已拒绝',
  ARCHIVED: '已归档',
};

const statusColor: Record<string, string> = {
  PENDING_REVIEW: 'bg-warn/15 text-warn',
  REVIEWED_PROOFING: 'bg-ink/10 text-ink/60',
  PUBLIC_INTENT: 'bg-gold/20 text-ink',
  OFFICIAL_REGISTERED: 'bg-success/15 text-success',
  REJECTED: 'bg-danger/10 text-danger',
};

// #32 enum → 中文 label
const genderLabel: Record<string, string> = { FEMALE: '女', MALE: '男', NONBINARY: '无性别' };
const ageLabel: Record<string, string> = { CHILD: '童颜', YOUNG: '青年', MIDDLE: '中年', ELDERLY: '银发' };
const ethnicityLabel: Record<string, string> = {
  EAST_ASIAN: '东亚', SOUTHEAST_ASIAN: '东南亚', SOUTH_ASIAN: '南亚',
  AFRICAN: '非洲', EUROPEAN: '欧洲', MIXED: '混合/其他',
};

const counts = ref<Record<string, number>>({});

async function load() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/admin/ips/queue', {
      params: {
        status: filter.value,
        gender: filterGender.value || undefined,
        ageBucket: filterAgeBucket.value || undefined,
        ethnicity: filterEthnicity.value || undefined,
      },
    });
    items.value = data.items;
  } finally { loading.value = false; }
}

async function loadCounts() {
  // 简化: 不拉所有状态,这里只展示当前过滤的列表
  counts.value = { [filter.value]: items.value.length };
}

function fileSummary(ip: any): string {
  if (!ip.files) return '—';
  const types = new Set(ip.files.map((f: any) => f.assetType));
  return `已上传 ${types.size}/6 类资产`;
}

function packComplete(ip: any): boolean {
  // 与前端/后端一致: 4 个核心必填;LORA/RECIPE 选填
  const required = ['THREE_VIEW', 'EXPRESSION_GRID', 'TRANSPARENT_RENDER', 'BIO_TXT'];
  const present = new Set((ip.files || []).filter((f: any) => f.validated).map((f: any) => f.assetType));
  return required.every((t) => present.has(t));
}

onMounted(() => { load().then(loadCounts); });
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-8">
    <div class="flex items-baseline justify-between mb-6">
      <h1 class="font-display text-2xl">IP 审核队列</h1>
      <div class="flex items-center gap-2 flex-wrap">
        <label class="text-xs text-ink/50">状态</label>
        <select v-model="filter" @change="load().then(loadCounts)" class="input-base !w-36 !py-1.5 text-sm">
          <option value="PENDING_REVIEW">待审核</option>
          <option value="REVIEWED_PROOFING">存证中</option>
          <option value="PUBLIC_INTENT">公示中</option>
          <option value="OFFICIAL_REGISTERED">已登记</option>
          <option value="REJECTED">已拒绝</option>
        </select>
        <!-- #32 标签筛选 -->
        <select v-model="filterGender" @change="load().then(loadCounts)" class="input-base !w-28 !py-1.5 text-sm">
          <option value="">全部性别</option>
          <option v-for="(label, v) in genderLabel" :key="v" :value="v">{{ label }}</option>
        </select>
        <select v-model="filterAgeBucket" @change="load().then(loadCounts)" class="input-base !w-28 !py-1.5 text-sm">
          <option value="">全部年龄</option>
          <option v-for="(label, v) in ageLabel" :key="v" :value="v">{{ label }}</option>
        </select>
        <select v-model="filterEthnicity" @change="load().then(loadCounts)" class="input-base !w-32 !py-1.5 text-sm">
          <option value="">全部种族</option>
          <option v-for="(label, v) in ethnicityLabel" :key="v" :value="v">{{ label }}</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>

    <div v-else-if="items.length === 0" class="text-center py-20 text-ink/40">
      该状态下暂无 IP
    </div>

    <div v-else class="bg-white border border-line rounded-2xl overflow-hidden">
      <table class="w-full">
        <thead class="bg-cream">
          <tr>
            <th class="table-th">IP</th>
            <th class="table-th">创作者</th>
            <th class="table-th">资产</th>
            <th class="table-th">状态</th>
            <th class="table-th">存证</th>
            <th class="table-th">登记号</th>
            <th class="table-th text-right pr-4">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ip in items" :key="ip.id" class="border-t border-line hover:bg-cream/30">
            <td class="table-td">
              <div class="font-medium">{{ ip.displayName }}</div>
              <div class="text-xs text-ink/50 font-mono">{{ ip.code }}</div>
            </td>
            <td class="table-td text-ink/60">{{ ip.creator?.displayName || ip.creator?.email || '—' }}</td>
            <td class="table-td text-xs">
              <span :class="packComplete(ip) ? 'text-success' : 'text-warn'">{{ fileSummary(ip) }}</span>
            </td>
            <td class="table-td">
              <span :class="['badge', statusColor[ip.status]]">{{ statusLabel[ip.status] }}</span>
            </td>
            <td class="table-td text-xs font-mono text-ink/50">{{ ip.blockchainTxId || '—' }}</td>
            <td class="table-td text-xs font-mono text-ink/50">{{ ip.officialCertNo || '—' }}</td>
            <td class="table-td text-right pr-4">
              <RouterLink :to="`/ips/${ip.id}`" class="text-gold hover:underline text-sm">查看 / 审核 →</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
