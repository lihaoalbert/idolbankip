<script setup lang="ts">
/**
 * #30.6.26 Admin 著作权登记队列 — 状态筛选 + 分页 + 跳转详情.
 * 镜像 IpQueuePage.vue 布局,filter 是 RegistrationStage 而非 IpStatus.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { copyrightAdminApi, type RegistrationStage } from '@/api/copyright';

const items = ref<any[]>([]);
const loading = ref(true);
const total = ref(0);
const filter = ref<RegistrationStage | ''>('SUBMITTED');
const page = ref(1);
const pageSize = 20;

const stageLabel: Record<RegistrationStage, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  ACCEPTED: '已受理',
  UNDER_REVIEW: '审查中',
  CERTIFIED: '已登记',
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

const stageLabelFor = (s: any) => (s && stageLabel[s as RegistrationStage]) || s || '—';
const stageColorFor = (s: any) => (s && stageColor[s as RegistrationStage]) || 'bg-ink/10 text-ink/60';

const levelLabel: Record<string, string> = { NATIONAL: '国家级', PROVINCIAL: '地方级' };

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
    const r = await copyrightAdminApi.queue({
      stage: filter.value || undefined,
      page: page.value,
      pageSize,
    });
    items.value = r.items;
    total.value = r.total;
  } finally {
    loading.value = false;
  }
}

watch(filter, () => { page.value = 1; load(); });
watch(page, load);
onMounted(load);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-8">
    <div class="flex items-baseline justify-between mb-6">
      <h1 class="font-display text-2xl">著作权登记队列</h1>
      <div class="flex items-center gap-2 flex-wrap">
        <label class="text-xs text-ink/50">状态</label>
        <select v-model="filter" class="input-base !w-36 !py-1.5 text-sm">
          <option value="">全部</option>
          <option v-for="(label, v) in stageLabel" :key="v" :value="v">{{ label }}</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>
    <div v-else-if="items.length === 0" class="text-center py-20 text-ink/40">
      该状态下暂无申请
    </div>

    <div v-else class="bg-white border border-line rounded-2xl overflow-hidden">
      <table class="w-full">
        <thead class="bg-cream">
          <tr>
            <th class="table-th">IP</th>
            <th class="table-th">创作者</th>
            <th class="table-th">著作权人</th>
            <th class="table-th">级别</th>
            <th class="table-th">代办费</th>
            <th class="table-th">状态</th>
            <th class="table-th">申请时间</th>
            <th class="table-th">证书号</th>
            <th class="table-th text-right pr-4">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="reg in items" :key="reg.id" class="border-t border-line hover:bg-cream/30">
            <td class="table-td">
              <div class="font-medium">{{ reg.ip.displayName }}</div>
              <div class="text-xs text-ink/50 font-mono">{{ reg.ip.code }}</div>
            </td>
            <td class="table-td text-ink/60">
              <div>{{ reg.ip.creator.displayName }}</div>
              <div class="text-[10px] text-ink/50 font-mono">{{ reg.ip.creator.email }}</div>
            </td>
            <td class="table-td text-xs">
              <div>{{ reg.ownerName }}</div>
              <div class="text-ink/50">{{ reg.ownerType === 'INDIVIDUAL' ? '个人' : '企业' }}</div>
            </td>
            <td class="table-td text-xs">{{ levelLabel[reg.registrationType] }}{{ reg.registrationRegion ? ` · ${reg.registrationRegion}` : '' }}</td>
            <td class="table-td text-xs font-mono">{{ fmtFen(reg.creatorAgentFeeFen) }}</td>
            <td class="table-td">
              <span :class="['badge', stageColorFor(reg.workflowStage)]">{{ stageLabelFor(reg.workflowStage) }}</span>
            </td>
            <td class="table-td text-xs font-mono text-ink/50">{{ fmtDate(reg.submittedAt) }}</td>
            <td class="table-td text-xs font-mono text-ink/50">{{ reg.certificateNo || reg.applicationNo || '—' }}</td>
            <td class="table-td text-right pr-4">
              <RouterLink :to="`/copyright-reg/${reg.ipId}`" class="text-gold hover:underline text-sm">查看 / 审核 →</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && total > pageSize" class="flex items-center justify-between mt-4 text-sm">
      <div class="text-ink/50">共 {{ total }} 条 · 第 {{ page }} / {{ totalPages }} 页</div>
      <div class="flex gap-2">
        <button :disabled="page <= 1" @click="page--" class="px-3 py-1 border border-line rounded disabled:opacity-30">上一页</button>
        <button :disabled="page >= totalPages" @click="page++" class="px-3 py-1 border border-line rounded disabled:opacity-30">下一页</button>
      </div>
    </div>
  </div>
</template>