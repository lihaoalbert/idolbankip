<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import { useHonor } from '@/composables/useHonor';
import { useBlueprintFeatureFlag } from '@/composables/useBlueprintFeatureFlag';
import Skeleton from '@/components/Skeleton.vue';
import EmptyState from '@/components/EmptyState.vue';
import HonorChip from '@/components/HonorChip.vue';
import HonorStreakChip from '@/components/HonorStreakChip.vue';

const auth = useAuthStore();
const toast = useToast();
const { me: honorMe, loadMe: loadHonorMe } = useHonor();
const { enabled: blueprintEnabled } = useBlueprintFeatureFlag();
const items = ref<any[]>([]);
const loading = ref(true);
const kycStatus = ref<string | null>(null);

const requiredTypes = [
  { type: 'FACE_CLOSEUP', label: '面部' },
  { type: 'THREE_VIEW', label: '三视图' },
  { type: 'EXPRESSION_GRID', label: '表情' },
  { type: 'TRANSPARENT_RENDER', label: '立绘' },
  { type: 'BIO_TXT', label: '小传' },
] as const;

const statusFilter = ref<'ALL' | 'PENDING_REVIEW' | 'PUBLIC_INTENT' | 'OFFICIAL_REGISTERED' | 'REJECTED' | 'ARCHIVED'>('ALL');
const selected = ref<Set<string>>(new Set());
const bulkBusy = ref(false);

const filteredItems = computed(() => {
  if (statusFilter.value === 'ALL') return items.value;
  return items.value.filter(ip => ip.status === statusFilter.value);
});

const statusCounts = computed(() => {
  const m: Record<string, number> = { ALL: items.value.length };
  for (const ip of items.value) m[ip.status] = (m[ip.status] || 0) + 1;
  return m;
});

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

function statusRoman(s: string): string {
  return {
    PENDING_REVIEW: 'I',
    REVIEWED_PROOFING: 'II',
    PUBLIC_INTENT: 'III',
    OFFICIAL_REGISTERED: 'IV',
    REJECTED: '×',
    ARCHIVED: '×',
  }[s] || '?';
}

function statusVariant(s: string): 'pending' | 'success' | 'danger' | 'neutral' {
  if (s === 'OFFICIAL_REGISTERED') return 'success';
  if (['REJECTED', 'ARCHIVED'].includes(s)) return 'danger';
  if (['PENDING_REVIEW', 'PUBLIC_INTENT', 'REVIEWED_PROOFING'].includes(s)) return 'pending';
  return 'neutral';
}

const presentTypes = (ip: any) => {
  return new Set(ip.files?.filter((f: any) => f.validated).map((f: any) => f.assetType) || []);
};

const completionPercent = (ip: any) => {
  const present = presentTypes(ip);
  return Math.round((requiredTypes.filter(t => present.has(t.type)).length / requiredTypes.length) * 100);
};

const waitingCertIps = computed(() => items.value.filter(ip => ip.status === 'PUBLIC_INTENT'));

const filterChips = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING_REVIEW', label: '待提交' },
  { key: 'PUBLIC_INTENT', label: '公示中' },
  { key: 'OFFICIAL_REGISTERED', label: '已登记' },
  { key: 'REJECTED', label: '已拒绝' },
  { key: 'ARCHIVED', label: '已归档' },
] as const;

onMounted(async () => {
  await Promise.all([fetch(), loadHonorMe()]);
});

const progressToNextPct = computed(() => {
  const me = honorMe.value;
  if (!me?.nextLevel) return 0;
  const target = Math.max(1, me.nextLevel.minPoints);
  return Math.min(100, Math.round((me.totalPoints / target) * 100));
});

const progressLabel = computed(() => {
  const me = honorMe.value;
  if (!me?.nextLevel) return null;
  return `${me.totalPoints.toLocaleString()} / ${me.nextLevel.minPoints.toLocaleString()}`;
});
</script>

<template>
  <div class="bg-r12-canvas min-h-screen">

    <!-- 顶部条 -->
    <header class="border-b border-r12-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-r12-ink-tertiary">IBIren · CREATOR STUDIO</div>
        <div class="catalog-no text-r12-ink-tertiary">VOL. I — DASHBOARD</div>
        <div class="catalog-no text-r12-ink-tertiary">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-[1320px] mx-auto px-6 lg:px-10 py-10 md:py-14">

      <!-- 章节头 -->
      <div class="grid grid-cols-12 gap-4 mb-8">
        <div class="col-span-3 catalog-no text-r12-ink-tertiary">№ 029</div>
        <div class="col-span-3 col-start-5 catalog-no text-r12-ink-tertiary">CHAPTER XXIX — STUDIO</div>
        <div class="col-span-3 col-start-9 catalog-no text-r12-ink-tertiary">CREATOR ACCESS</div>
        <div class="col-span-3 col-start-12 catalog-no text-r12-ink-tertiary text-right hidden md:block">{{ auth.user?.displayName }}</div>
      </div>

      <div class="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <h1 class="font-r12-sans text-r12-display md:text-[56px] font-semibold leading-tight text-r12-ink-primary">
            捏者<span class="text-r12-cobalt">中</span>心
          </h1>
          <p class="mt-3 text-r12-caption text-r12-ink-secondary">
            <span class="font-r12-mono text-r12-mono-body">{{ auth.user?.email }}</span>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <RouterLink
            to="/creator/tasks"
            class="inline-flex items-center gap-2 px-4 py-2 border border-r12-ink-primary hover:bg-r12-ink-primary hover:text-white transition text-r12-body rounded-r8-sm"
          >
            <span>任务板</span>
            <span class="font-display-italic">→</span>
          </RouterLink>
          <RouterLink
            to="/creator/api-keys"
            class="inline-flex items-center gap-2 px-4 py-2 border border-r12-ink-primary hover:bg-r12-ink-primary hover:text-white transition text-r12-body rounded-r8-sm"
          >
            <span>API Keys</span>
            <span class="font-display-italic">→</span>
          </RouterLink>
          <RouterLink
            to="/creator/ips/new"
            class="inline-flex items-center gap-3 px-5 py-2.5 bg-r12-cobalt text-white hover:bg-r12-ink-primary transition group rounded-r8-sm"
          >
            <span class="catalog-no text-white/70 group-hover:text-white/90 text-[10px]">NEW PLATE</span>
            <span class="font-r12-sans font-medium">+ 新建 IP</span>
          </RouterLink>
        </div>
      </div>

      <!-- 荣誉面板 · 暗色卡片 -->
      <section v-if="honorMe" class="mb-10 bg-r12-ink-primary text-white p-6 md:p-8 relative overflow-hidden rounded-r8-sm">
        <div class="absolute top-4 right-4 stamp text-r12-warning border-r12-warning">HONOR</div>
        <div class="catalog-no text-white/50 mb-3">— 01 — HONOR PANEL · 捏者荣誉</div>

        <div class="flex items-center gap-4 flex-wrap mb-6">
          <HonorChip :level="honorMe.level" variant="block" />
          <HonorStreakChip
            v-if="honorMe.streak.current"
            :current="honorMe.streak.current"
            :longest="honorMe.streak.longest"
          />
          <div class="flex items-baseline gap-2 px-4 py-2 bg-white/10 border border-r12-warning/40">
            <span class="text-r12-cobalt text-2xl">✦</span>
            <span class="font-r12-mono text-r12-mono-num-lg">{{ honorMe.totalPoints.toLocaleString() }}</span>
            <span class="catalog-no text-white/60">FACE-COIN</span>
          </div>
          <div class="catalog-no text-white/60">
            <span class="text-white font-medium">{{ honorMe.badgesEarned }}</span> 徽章 ·
            <span class="text-white font-medium">{{ honorMe.ipsCreated }}</span> IP
          </div>
          <RouterLink
            v-if="auth.user?.id"
            :to="`/u/${auth.user.id}`"
            class="ml-auto catalog-no text-r12-cobalt catalog-no hover:underline"
          >
            VIEW PUBLIC PROFILE →
          </RouterLink>
        </div>

        <!-- 进度条 -->
        <div v-if="honorMe.nextLevel" class="mb-6">
          <div class="flex items-center justify-between catalog-no text-white/60 mb-2">
            <span>TO NEXT LEVEL · {{ honorMe.nextLevel.icon }} {{ honorMe.nextLevel.title }}</span>
            <span class="font-r12-mono text-r12-mono-num">{{ progressLabel }}</span>
          </div>
          <div class="h-1.5 bg-white/10 overflow-hidden rounded-r8-sm">
            <div
              class="h-full bg-r12-cobalt transition-all"
              :style="{ width: progressToNextPct + '%' }"
            />
          </div>
        </div>

        <!-- 最近流水 -->
        <div v-if="honorMe.recentLedger?.length" class="pt-4 border-t border-white/15">
          <div class="catalog-no text-white/50 mb-3">RECENT LEDGER · 最近荣誉流水</div>
          <ul class="space-y-2">
            <li
              v-for="row in honorMe.recentLedger.slice(0, 3)"
              :key="row.id"
              class="flex items-center justify-between text-xs"
            >
              <span class="text-white/70 truncate flex-1 mr-3">{{ row.reason }}</span>
              <span :class="row.delta >= 0 ? 'text-r12-success font-r12-mono' : 'text-r12-danger font-r12-mono'">
                {{ row.delta >= 0 ? '+' : '' }}{{ row.delta }}
              </span>
            </li>
          </ul>
        </div>
      </section>

      <!-- KYC 提示 -->
      <div
        v-if="kycStatus === 'PENDING' || kycStatus === 'REJECTED'"
        :class="[
          'mb-6 p-5 border',
          kycStatus === 'PENDING' ? 'bg-r12-cobalt-soft border-r12-cobalt' : 'bg-r12-danger-soft border-r12-danger'
        ]"
      >
        <div class="flex items-start gap-3">
          <span class="font-r12-sans italic text-2xl shrink-0" :class="kycStatus === 'PENDING' ? 'text-r12-cobalt' : 'text-r12-danger'">
            {{ kycStatus === 'PENDING' ? '⌛' : '×' }}
          </span>
          <div class="flex-1 text-sm">
            <div class="font-r12-sans text-r12-body font-semibold mb-1" :class="kycStatus === 'PENDING' ? 'text-r12-ink-primary' : 'text-r12-danger'">
              {{ kycStatus === 'PENDING' ? 'KYC 实名认证审核中' : 'KYC 审核未通过' }}
            </div>
            <div class="leading-relaxed text-r12-ink-secondary">
              <template v-if="kycStatus === 'PENDING'">
                审核通常 1-2 个工作日, 完成后会自动开通捏者权限。
              </template>
              <template v-else>
                KYC 未通过, 无法上传 IP · 请修正后重新提交。
              </template>
            </div>
            <RouterLink to="/creator/onboard" class="mt-2 inline-block catalog-no text-r12-cobalt catalog-no hover:underline">
              VIEW DETAILS →
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Blueprint Wizard 入口 (Phase C R2) — 仅当 feature flag 启用时显示
           8 层人脸分解向导 → 出图 prompt 锁版 → 后接 IpWizard
           v-if 防止 kill switch 时还显示入口(配合路由守卫 redirect) -->
      <section
        v-if="blueprintEnabled"
        class="mb-10 border border-r12-line bg-r12-surface p-6 md:p-8 relative overflow-hidden"
      >
        <div class="absolute top-4 right-4 stamp text-r12-warning border-r12-warning">BETA · L1~L8</div>
        <div class="catalog-no text-r12-ink-tertiary mb-3">— 02 — LAYERED PROMPT GENERATOR</div>
        <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div class="flex-1">
            <h2 class="font-r12-sans text-r12-h2 font-semibold text-r12-ink-primary leading-tight mb-2">
              八层人脸分解 <span class="text-r12-cobalt">→</span> 出图 prompt
            </h2>
            <p class="text-r12-caption text-r12-ink-secondary leading-relaxed max-w-2xl">
              骨骼 → 软组织 → 五官 → 皮肤 → 发型 → 装饰 → 中文 prompt → 评估雷达图。
              <strong>先把脸锁版</strong>,再用 prompt 给平台(MJ / SD / 即梦 / 豆包)出图,避免每次重新抽卡。
              完整体验 8 步约 15 分钟,可中途保存草稿。
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-3 catalog-no text-r12-micro text-r12-ink-tertiary">
              <span>8 步表单</span><span>·</span>
              <span>本地草稿自动保存</span><span>·</span>
              <span>8 维原创度评估</span><span>·</span>
              <span>与 IpWizard 衔接(Phase 2)</span>
            </div>
          </div>
          <RouterLink
            to="/creator/blueprint/new/step/1"
            class="inline-flex items-center gap-3 px-6 py-3 bg-r12-ink-primary text-white hover:bg-r12-cobalt transition group shrink-0"
          >
            <span class="catalog-no text-white/60 group-hover:text-white/80 text-[10px]">BEGIN</span>
            <span class="font-r12-sans font-medium">开始 Layered Prompt →</span>
          </RouterLink>
        </div>
      </section>

      <!-- 证书登记中提示 -->
      <div
        v-if="waitingCertIps.length > 0"
        class="mb-10 p-5 bg-r12-warning-soft border border-r12-warning/40 relative overflow-hidden"
      >
        <div class="absolute top-4 right-4 stamp text-r12-warning border-r12-warning">PENDING</div>
        <div class="flex items-start gap-3">
          <span class="text-r12-cobalt text-2xl shrink-0">⌛</span>
          <div class="flex-1 text-sm">
            <div class="font-r12-sans text-r12-body font-semibold text-r12-ink-primary mb-1">
              {{ waitingCertIps.length }} 个 IP 正在等待版权证书登记
            </div>
            <div class="text-r12-ink-secondary leading-relaxed">
              你的 IP 已通过平台审核, 正在
              <strong>公示中</strong>
              · 公示期通过后, 平台会代为申请国家或省级作品著作权登记证书 ·
              登记完成后状态会变为 <span class="font-r12-mono text-r12-success">已登记</span>
              · 整个流程通常 1-3 周。
            </div>
            <div class="mt-2 catalog-no text-r12-micro text-r12-ink-tertiary">
              {{ waitingCertIps.map(ip => ip.code).join(' · ') }}
            </div>
          </div>
        </div>
      </div>

      <!-- 状态筛选 -->
      <div class="mb-6 pb-4 border-b border-r12-line flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-2 flex-wrap">
          <button
            v-for="c in filterChips"
            :key="c.key"
            @click="statusFilter = c.key as any"
            :class="[
              'px-3 py-1.5 text-xs catalog-no transition border',
              statusFilter === c.key
                ? 'bg-r12-cobalt text-white border-r12-cobalt'
                : 'border-r12-line text-r12-ink-secondary hover:border-r12-ink-primary hover:text-r12-ink-primary'
            ]"
          >
            {{ c.label }}
            <span v-if="statusCounts[c.key]" class="ml-1 text-[10px] opacity-60">({{ statusCounts[c.key] }})</span>
          </button>
        </div>
        <div class="catalog-no text-r12-ink-tertiary">
          — 03 — IP LEDGER · 作品台账 —
        </div>
      </div>

      <!-- 内容 -->
      <div v-if="loading" class="grid md:grid-cols-2 gap-6">
        <div v-for="i in 4" :key="i" class="bg-r12-surface border border-r12-line p-6 rounded-r8-sm space-y-4">
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
        icon="◇"
        title="— No plates in studio —"
        description="上传资产包 + 人物小传 + LoRA 模型, 提交审核后就能在形象库展示"
        action-label="CREATE FIRST PLATE"
        action-to="/creator/ips/new"
      />

      <div v-else-if="filteredItems.length === 0" class="py-20 text-center">
        <div class="catalog-no text-r12-ink-tertiary mb-3">— EMPTY —</div>
        <button @click="statusFilter = 'ALL'" class="text-r12-caption text-r12-cobalt catalog-no hover:underline">查看全部 →</button>
      </div>

      <div v-else class="grid md:grid-cols-2 gap-6">
        <article
          v-for="ip in filteredItems"
          :key="ip.id"
          :class="[
            'relative bg-r12-surface border border-r12-line p-6 transition rounded-r8-sm',
            selectableStatuses.has(ip.status) ? 'cursor-pointer' : '',
            selected.has(ip.id) ? 'border-gold ring-2 ring-gold/30' : 'border-r12-line hover:border-r12-ink-primary'
          ]"
          @click="selectableStatuses.has(ip.status) && toggleSelect(ip.id)"
        >
          <!-- 复选框 -->
          <div v-if="selectableStatuses.has(ip.status)" class="absolute top-4 left-4">
            <input
              type="checkbox"
              :checked="selected.has(ip.id)"
              @click.stop="toggleSelect(ip.id)"
              class="w-4 h-4 accent-r12-cobalt cursor-pointer"
            />
          </div>

          <RouterLink
            :to="`/creator/ips/${ip.id}`"
            class="block"
            :class="selectableStatuses.has(ip.status) ? 'pl-7' : ''"
            @click.stop
          >
            <div class="flex items-start justify-between mb-3 gap-3">
              <div class="flex-1 min-w-0">
                <div class="font-r12-sans text-r12-h3 font-semibold text-r12-ink-primary truncate">{{ ip.displayName }}</div>
                <div class="catalog-no text-r12-ink-tertiary mt-1">{{ ip.code }}</div>
              </div>
              <span
                :class="[
                  'inline-flex items-center gap-1.5 px-2 py-1 text-xs catalog-no shrink-0 rounded-r8-sm',
                  statusVariant(ip.status) === 'success' ? 'bg-r12-success-soft text-r12-success' :
                  statusVariant(ip.status) === 'danger' ? 'bg-r12-danger-soft text-r12-danger' :
                  statusVariant(ip.status) === 'pending' ? 'bg-r12-warning-soft text-r12-warning' :
                  'bg-r12-line text-r12-ink-secondary'
                ]"
              >
                <span class="text-r12-cobalt">{{ statusRoman(ip.status) }}</span>
                <span>{{ statusLabel(ip.status) }}</span>
              </span>
            </div>

            <!-- REJECTED 原因 -->
            <div
              v-if="ip.status === 'REJECTED' && ip.rejectionReason"
              class="mb-3 p-3 bg-r12-danger-soft border border-r12-danger/40 text-r12-caption text-r12-danger line-clamp-2 rounded-r8-sm"
              :title="ip.rejectionReason"
            >
              <span class="catalog-no text-r12-danger mr-1">REASON</span>
              {{ ip.rejectionReason }}
            </div>

            <!-- 必填素材状态 -->
            <div class="flex items-center gap-3 mb-3 flex-wrap">
              <div
                v-for="t in requiredTypes"
                :key="t.type"
                class="flex items-center gap-1 text-xs"
                :title="presentTypes(ip).has(t.type) ? `${t.label} 已上传` : `${t.label} 缺失`"
              >
                <span :class="presentTypes(ip).has(t.type) ? 'text-r12-success' : 'text-r12-danger/60'">
                  {{ presentTypes(ip).has(t.type) ? '✓' : '○' }}
                </span>
                <span class="catalog-no text-r12-ink-secondary">{{ t.label }}</span>
              </div>
              <span
                v-if="presentTypes(ip).has('FACE_CLOSEUP') && !ip.faceCloseupFileId"
                class="text-[10px] px-2 py-0.5 bg-r12-warning-soft text-r12-warning border border-r12-warning/40 catalog-no rounded-r8-sm"
                title="已传面部特写, 但还没指定哪张作为版权图"
              >
                ⚠ NO COPYRIGHT PLATE
              </span>
              <span
                v-if="!ip.ethnicity"
                class="text-[10px] px-2 py-0.5 bg-r12-warning-soft text-r12-warning border border-r12-warning/40 catalog-no rounded-r8-sm"
                title="为 IP 标注种族, 否则不算进形象库覆盖度"
              >
                ⚠ NO ETHNICITY
              </span>
            </div>

            <!-- 完整度 -->
            <div class="mt-3 border-t border-r12-line pt-3">
              <div class="h-1 bg-r12-line overflow-hidden rounded-r8-sm">
                <div class="h-full bg-r12-cobalt" :style="{ width: completionPercent(ip) + '%' }" />
              </div>
              <div class="catalog-no text-r12-ink-tertiary mt-2 text-right">
                COMPLETENESS · {{ completionPercent(ip) }}%
              </div>
            </div>
          </RouterLink>
        </article>
      </div>

      <!-- 批量操作栏 -->
      <Transition name="slide-up">
        <div
          v-if="selected.size > 0"
          class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-r12-ink-primary text-white px-5 py-3 shadow-xl rounded-r8-sm flex items-center gap-4 z-30"
        >
          <span class="font-r12-sans text-r12-body font-medium">{{ selected.size }} plates selected</span>
          <span class="catalog-no text-white/50">已选 {{ selected.size }} 个 IP</span>
          <div class="h-4 w-px bg-white/30"></div>
          <button
            v-if="Array.from(selected).some(id => items.find(i => i.id === id)?.status === 'PENDING_REVIEW')"
            @click="bulkSubmit"
            :disabled="bulkBusy"
            class="text-r12-body hover:text-r12-cobalt disabled:opacity-40 transition"
          >
            {{ bulkBusy ? '处理中…' : '批量提交审核' }}
          </button>
          <button
            v-if="Array.from(selected).some(id => items.find(i => i.id === id)?.status === 'REJECTED')"
            @click="bulkArchive"
            :disabled="bulkBusy"
            class="text-r12-body hover:text-r12-cobalt disabled:opacity-40 transition"
          >
            {{ bulkBusy ? '处理中…' : '批量归档' }}
          </button>
          <button
            @click="clearSelection"
            class="text-r12-caption text-white/60 hover:text-white transition ml-2"
          >
            ✕
          </button>
        </div>
      </Transition>
    </main>

    <!-- 底部 colophon -->
    <footer class="border-t border-r12-line mt-12">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-r12-ink-tertiary">
        <span>CAT. STUDIO-029</span>
        <span>SET IN GEIST · GEIST MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.2s; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translate(-50%, 20px); }
</style>
