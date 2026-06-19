<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import Skeleton from '@/components/Skeleton.vue';
import EmptyState from '@/components/EmptyState.vue';

const auth = useAuthStore();
const toast = useToast();
const items = ref<any[]>([]);
const loading = ref(true);
const kycStatus = ref<string | null>(null);

// 5 个必填素材 (含 #31 面部特写),创作者中心展示
const requiredTypes = [
  { type: 'FACE_CLOSEUP', icon: '⭐', label: '面部' },
  { type: 'THREE_VIEW', icon: '◰', label: '三视图' },
  { type: 'EXPRESSION_GRID', icon: '☺', label: '表情' },
  { type: 'TRANSPARENT_RENDER', icon: '◇', label: '立绘' },
  { type: 'BIO_TXT', icon: '✎', label: '小传' },
] as const;

// 状态筛选 — #23
const statusFilter = ref<'ALL' | 'PENDING_REVIEW' | 'PUBLIC_INTENT' | 'OFFICIAL_REGISTERED' | 'REJECTED' | 'ARCHIVED'>('ALL');
const selected = ref<Set<string>>(new Set());
const bulkBusy = ref(false);

const filteredItems = computed(() => {
  if (statusFilter.value === 'ALL') return items.value;
  return items.value.filter(ip => ip.status === statusFilter.value);
});

// 按状态分组计数 — 给 chips 显示数字
const statusCounts = computed(() => {
  const m: Record<string, number> = { ALL: items.value.length };
  for (const ip of items.value) m[ip.status] = (m[ip.status] || 0) + 1;
  return m;
});

// 可批量操作的状态集合
const selectableStatuses = new Set(['PENDING_REVIEW', 'REJECTED']);

function toggleSelect(id: string) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

function clearSelection() {
  selected.value = new Set();
}

async function bulkSubmit() {
  if (selected.value.size === 0) return;
  bulkBusy.value = true;
  try {
    const res = await apiClient.post('/ips/bulk/submit', { ids: Array.from(selected.value) });
    if (res.data.failed) {
      toast.error(`批量提交中止 (已成功 ${res.data.submitted.length} 个): ${res.data.failed.reason}`);
    } else {
      toast.success(`已批量提交 ${res.data.submitted.length} 个 IP 审核`);
    }
    clearSelection();
    await fetch();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '批量提交失败');
  } finally {
    bulkBusy.value = false;
  }
}

async function bulkArchive() {
  if (selected.value.size === 0) return;
  if (!confirm(`确定归档这 ${selected.value.size} 个 IP 吗?归档后不可恢复。`)) return;
  bulkBusy.value = true;
  try {
    const res = await apiClient.post('/ips/bulk/archive', { ids: Array.from(selected.value) });
    if (res.data.failed) {
      toast.error(`批量归档中止 (已成功 ${res.data.archived.length} 个): ${res.data.failed.reason}`);
    } else {
      toast.success(`已批量归档 ${res.data.archived.length} 个 IP`);
    }
    clearSelection();
    await fetch();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '批量归档失败');
  } finally {
    bulkBusy.value = false;
  }
}

async function fetch() {
  loading.value = true;
  try {
    const [{ data: ips }, { data: kyc }] = await Promise.all([
      apiClient.get('/ips/mine/list'),
      apiClient.get('/kyc/status').catch(() => ({ data: { status: null } })),
    ]);
    items.value = ips.items;
    kycStatus.value = kyc.status ?? null;
    clearSelection();
  } finally { loading.value = false; }
}

function statusLabel(s: string): string {
  return {
    PENDING_REVIEW: '待提交',
    REVIEWED_PROOFING: '审核中',
    PUBLIC_INTENT: '公示中',
    OFFICIAL_REGISTERED: '已登记',
    REJECTED: '已拒绝',
    ARCHIVED: '已归档',
  }[s] || s;
}

function statusColor(s: string): string {
  return {
    PENDING_REVIEW: 'bg-ink/10 text-ink/60',
    REVIEWED_PROOFING: 'bg-gold/20 text-ink',
    PUBLIC_INTENT: 'bg-gold/20 text-ink',
    OFFICIAL_REGISTERED: 'bg-success/15 text-success',
    REJECTED: 'bg-danger/10 text-danger',
    ARCHIVED: 'bg-ink/5 text-ink/40',
  }[s] || 'bg-ink/10 text-ink/60';
}

const presentTypes = (ip: any) => {
  return new Set(ip.files?.filter((f: any) => f.validated).map((f: any) => f.assetType) || []);
};

const completionPercent = (ip: any) => {
  const present = presentTypes(ip);
  return Math.round((requiredTypes.filter(t => present.has(t.type)).length / requiredTypes.length) * 100);
};

// 哪些 IP 卡在 PUBLIC_INTENT 等证书 (banner 提示)
const waitingCertIps = computed(() => items.value.filter(ip => ip.status === 'PUBLIC_INTENT'));

// 哪些选项可显示在 chips
const filterChips = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING_REVIEW', label: '待提交' },
  { key: 'PUBLIC_INTENT', label: '公示中' },
  { key: 'OFFICIAL_REGISTERED', label: '已登记' },
  { key: 'REJECTED', label: '已拒绝' },
  { key: 'ARCHIVED', label: '已归档' },
] as const;

onMounted(fetch);
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 py-10">
    <div class="flex items-baseline justify-between mb-2">
      <h1 class="font-display text-3xl">创作者中心</h1>
      <div class="flex items-center gap-3">
        <RouterLink
          to="/creator/tasks"
          class="text-xs text-ink/60 hover:text-gold transition"
        >📋 任务板</RouterLink>
        <RouterLink
          to="/creator/api-keys"
          class="text-xs text-ink/60 hover:text-gold transition"
        >🔑 Agent API Key</RouterLink>
        <RouterLink
          to="/creator/ips/new"
          class="px-5 py-2 bg-ink text-cream rounded-full text-sm hover:bg-gold transition"
        >+ 新建 IP</RouterLink>
      </div>
    </div>
    <p class="text-sm text-ink/60 mb-8">{{ auth.user?.displayName }} · {{ auth.user?.email }}</p>

    <!-- KYC 审核中提示 banner — 见 #19, 创作者 KYC PENDING 时 dashboard 也要能看见 -->
    <div
      v-if="kycStatus === 'PENDING' || kycStatus === 'REJECTED'"
      :class="[
        'mb-6 p-4 rounded-2xl border',
        kycStatus === 'PENDING' ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200',
      ]"
    >
      <div class="flex items-start gap-3">
        <span class="text-lg">{{ kycStatus === 'PENDING' ? '⏳' : '✕' }}</span>
        <div class="flex-1 text-sm">
          <div :class="['font-medium mb-1', kycStatus === 'PENDING' ? 'text-blue-900' : 'text-red-900']">
            {{ kycStatus === 'PENDING' ? 'KYC 实名认证审核中' : 'KYC 审核未通过' }}
          </div>
          <div :class="['leading-relaxed', kycStatus === 'PENDING' ? 'text-blue-800/80' : 'text-red-800/80']">
            <template v-if="kycStatus === 'PENDING'">
              升级为创作者需要先完成 KYC。审核通常 1-2 个工作日,完成后会自动开通创作者权限。
            </template>
            <template v-else>
              KYC 未通过,无法上传 IP。请修正后重新提交。
            </template>
          </div>
          <RouterLink
            to="/creator/onboard"
            class="mt-2 inline-block text-xs underline"
            :class="kycStatus === 'PENDING' ? 'text-blue-700' : 'text-red-700'"
          >查看详情 →</RouterLink>
        </div>
      </div>
    </div>

    <!-- 证书登记中提示 banner -->
    <div
      v-if="waitingCertIps.length > 0"
      class="mb-6 p-4 bg-gold/10 border border-gold/30 rounded-2xl"
    >
      <div class="flex items-start gap-3">
        <span class="text-gold text-lg">⏳</span>
        <div class="flex-1 text-sm">
          <div class="font-medium text-ink mb-1">
            {{ waitingCertIps.length }} 个 IP 正在等待版权证书登记
          </div>
          <div class="text-ink/70 leading-relaxed">
            你的 IP 已通过平台审核,正在 <strong>公示中</strong>。公示期通过后,平台会代为申请国家或省级作品著作权登记证书,
            登记完成后状态会变为 <span class="font-mono text-success">已登记</span>。整个流程通常 1-3 周,具体时间取决于版权局。
            如需加急,请<a href="/contact" class="text-gold underline">联系商务</a>。
          </div>
          <div class="mt-2 text-xs text-ink/50 font-mono">
            {{ waitingCertIps.map(ip => ip.code).join(' · ') }}
          </div>
        </div>
      </div>
    </div>

    <!-- 状态筛选 chips (#23) -->
    <div v-if="!loading && items.length > 0" class="flex items-center gap-2 mb-4 flex-wrap">
      <button
        v-for="c in filterChips"
        :key="c.key"
        @click="statusFilter = c.key as any"
        :class="[
          'px-3 py-1.5 text-xs rounded-full border transition',
          statusFilter === c.key
            ? 'bg-ink text-cream border-ink'
            : 'border-line text-ink/60 hover:border-ink/40',
        ]"
      >
        {{ c.label }}
        <span v-if="statusCounts[c.key]" class="ml-1 text-[10px] opacity-60">({{ statusCounts[c.key] }})</span>
      </button>
    </div>

    <div v-if="loading" class="grid md:grid-cols-2 gap-4">
      <div v-for="i in 4" :key="i" class="bg-surface rounded-2xl border border-line p-5 space-y-3">
        <div class="flex items-start justify-between">
          <div class="space-y-2 flex-1">
            <Skeleton shape="line" width="50%" height-class="h-4" />
            <Skeleton shape="line" width="30%" height-class="h-2" />
          </div>
          <Skeleton shape="line" width="20%" height-class="h-4" />
        </div>
        <Skeleton shape="line" width="40%" height-class="h-2" />
        <Skeleton shape="line" width="100%" height-class="h-1" />
      </div>
    </div>
    <EmptyState
      v-else-if="items.length === 0"
      icon="🎨"
      title="你还没有创建任何 IP"
      description="上传资产包 + 人物小传 + LoRA 模型,提交审核后就能在形象库展示"
      action-label="立即创建第一个"
      action-to="/creator/ips/new"
    />
    <div v-else-if="filteredItems.length === 0" class="py-16 text-center">
      <div class="text-ink/40 text-sm">该状态暂无 IP</div>
      <button @click="statusFilter = 'ALL'" class="mt-2 text-xs text-gold hover:underline">查看全部</button>
    </div>
    <div v-else class="grid md:grid-cols-2 gap-4">
      <div
        v-for="ip in filteredItems"
        :key="ip.id"
        :class="[
          'relative bg-surface rounded-2xl border p-5 transition',
          selectableStatuses.has(ip.status) ? 'cursor-pointer hover:shadow-soft' : '',
          selected.has(ip.id) ? 'border-gold ring-2 ring-gold/30' : 'border-line',
        ]"
        @click="selectableStatuses.has(ip.status) && toggleSelect(ip.id)"
      >
        <!-- 选择 checkbox (可批量操作时显示) -->
        <div v-if="selectableStatuses.has(ip.status)" class="absolute top-3 left-3">
          <input
            type="checkbox"
            :checked="selected.has(ip.id)"
            @click.stop="toggleSelect(ip.id)"
            class="w-4 h-4 accent-gold cursor-pointer"
          />
        </div>
        <RouterLink
          :to="`/creator/ips/${ip.id}`"
          class="block"
          :class="selectableStatuses.has(ip.status) ? 'pl-7' : ''"
          @click.stop
        >
          <div class="flex items-start justify-between mb-3">
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">{{ ip.displayName }}</div>
              <div class="text-xs text-ink/50 font-mono">{{ ip.code }}</div>
            </div>
            <span :class="['px-2 py-0.5 text-xs rounded-full shrink-0 ml-2', statusColor(ip.status)]">{{ statusLabel(ip.status) }}</span>
          </div>
          <!-- REJECTED 时显示具体原因 (card 上一眼能看) -->
          <div
            v-if="ip.status === 'REJECTED' && ip.rejectionReason"
            class="mb-2 p-2 bg-danger/10 border border-danger/20 rounded text-xs text-danger/90 line-clamp-2"
            :title="ip.rejectionReason"
          >
            ✕ 原因: {{ ip.rejectionReason }}
          </div>
          <!-- 5 必填素材状态 -->
          <div class="flex items-center gap-3 mb-2 flex-wrap">
            <div
              v-for="t in requiredTypes"
              :key="t.type"
              class="flex items-center gap-1 text-xs"
              :title="presentTypes(ip).has(t.type) ? `${t.label} 已上传` : `${t.label} 缺失`"
            >
              <span :class="presentTypes(ip).has(t.type) ? 'text-success' : 'text-danger/70'">
                {{ presentTypes(ip).has(t.type) ? '✓' : '○' }}
              </span>
              <span class="text-ink/60">{{ t.label }}</span>
            </div>
            <!-- #31: 已传面部特写但还没指定版权图 → 警告 -->
            <span
              v-if="presentTypes(ip).has('FACE_CLOSEUP') && !ip.faceCloseupFileId"
              class="text-[10px] px-1.5 py-0.5 bg-warning/15 text-warning border border-warning/30 rounded"
              title="已传面部特写,但还没指定哪张作为版权图"
            >
              ⚠️ 未指定版权图
            </span>
            <!-- #32: 未标注种族 → 警告 -->
            <span
              v-if="!ip.ethnicity"
              class="text-[10px] px-1.5 py-0.5 bg-warning/15 text-warning border border-warning/30 rounded"
              title="为 IP 标注种族 (中/日/韩/欧/...), 否则不算进形象库覆盖度"
            >
              ⚠️ 未标注种族
            </span>
          </div>
          <div class="h-1 bg-cream rounded-full overflow-hidden">
            <div class="h-full bg-gold" :style="{ width: completionPercent(ip) + '%' }" />
          </div>
          <div class="text-xs text-ink/50 mt-1 text-right">
            完整度 {{ completionPercent(ip) }}%
          </div>
        </RouterLink>
      </div>
    </div>

    <!-- 批量操作栏 (#23) — 选中项时底部浮起 -->
    <Transition name="slide-up">
      <div
        v-if="selected.size > 0"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-cream px-5 py-3 rounded-full shadow-xl flex items-center gap-4 z-30"
      >
        <span class="text-sm">已选 {{ selected.size }} 个 IP</span>
        <div class="h-4 w-px bg-cream/30"></div>
        <button
          v-if="Array.from(selected).some(id => items.find(i => i.id === id)?.status === 'PENDING_REVIEW')"
          @click="bulkSubmit"
          :disabled="bulkBusy"
          class="text-sm hover:text-gold disabled:opacity-40"
        >
          {{ bulkBusy ? '处理中...' : '批量提交审核' }}
        </button>
        <button
          v-if="Array.from(selected).some(id => items.find(i => i.id === id)?.status === 'REJECTED')"
          @click="bulkArchive"
          :disabled="bulkBusy"
          class="text-sm hover:text-gold disabled:opacity-40"
        >
          {{ bulkBusy ? '处理中...' : '批量归档' }}
        </button>
        <button
          @click="clearSelection"
          class="text-xs text-cream/60 hover:text-cream"
        >
          ✕
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.2s; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translate(-50%, 20px); }
</style>
