<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import Skeleton from '@/components/Skeleton.vue';
import EmptyState from '@/components/EmptyState.vue';

const auth = useAuthStore();
const items = ref<any[]>([]);
const loading = ref(true);

// 4 个必填素材,创作者中心展示
const requiredTypes = [
  { type: 'THREE_VIEW', icon: '◰', label: '三视图' },
  { type: 'EXPRESSION_GRID', icon: '☺', label: '表情' },
  { type: 'TRANSPARENT_RENDER', icon: '◇', label: '立绘' },
  { type: 'BIO_TXT', icon: '✎', label: '小传' },
] as const;

async function fetch() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/ips/mine/list');
    items.value = data.items;
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

onMounted(fetch);
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 py-10">
    <div class="flex items-baseline justify-between mb-2">
      <h1 class="font-display text-3xl">创作者中心</h1>
      <RouterLink
        to="/creator/ips/new"
        class="px-5 py-2 bg-ink text-cream rounded-full text-sm hover:bg-gold transition"
      >+ 新建 IP</RouterLink>
    </div>
    <p class="text-sm text-ink/60 mb-8">{{ auth.user?.displayName }} · {{ auth.user?.email }}</p>

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
    <div v-else class="grid md:grid-cols-2 gap-4">
      <RouterLink
        v-for="ip in items"
        :key="ip.id"
        :to="`/creator/ips/${ip.id}`"
        class="block bg-surface rounded-2xl border border-line p-5 hover:shadow-soft transition"
      >
        <div class="flex items-start justify-between mb-3">
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate">{{ ip.displayName }}</div>
            <div class="text-xs text-ink/50 font-mono">{{ ip.code }}</div>
          </div>
          <span :class="['px-2 py-0.5 text-xs rounded-full shrink-0 ml-2', statusColor(ip.status)]">{{ statusLabel(ip.status) }}</span>
        </div>
        <!-- 4 必填素材状态 -->
        <div class="flex items-center gap-3 mb-2">
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
</template>
