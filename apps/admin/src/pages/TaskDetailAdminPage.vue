<script setup lang="ts">
/**
 * #30 admin 任务详情 — 提交列表 + 通过/拒绝
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiClient } from '@/api/client';

const props = defineProps<{ id: string }>();
const router = useRouter();
const notify = (msg: string, ok = true) => console.log(ok ? '✅' : '❌', msg);

const task = ref<any>(null);
const submissions = ref<any[]>([]);
const loading = ref(false);
const rejectModal = ref<{ ipId: string; name: string } | null>(null);
const rejectReason = ref('');
const acting = ref(false);

const genderLabel: Record<string, string> = { FEMALE: '女', MALE: '男', NONBINARY: '无性别' };
const ageLabel: Record<string, string> = { CHILD: '童颜', YOUNG: '青年', MIDDLE: '中年', ELDERLY: '银发' };
const ethLabel: Record<string, string> = {
  EAST_ASIAN: '东亚', SOUTHEAST_ASIAN: '东南亚', SOUTH_ASIAN: '南亚',
  AFRICAN: '非洲', EUROPEAN: '欧洲', MIXED: '混合/其他',
};
const statusLabel: Record<string, string> = {
  PENDING_REVIEW: '待审',
  REVIEWED_PROOFING: '审核中',
  PUBLIC_INTENT: '公示中',
  OFFICIAL_REGISTERED: '已登记',
  REJECTED: '已拒',
  ARCHIVED: '已归档',
};
const taskStatusLabel: Record<string, string> = {
  OPEN: '招募中', CLOSED: '已关闭', COMPLETED: '已完成', CANCELLED: '已取消',
};
const taskStatusColor: Record<string, string> = {
  OPEN: 'bg-success/15 text-success',
  CLOSED: 'bg-ink/10 text-ink/50',
  COMPLETED: 'bg-gold/15 text-gold',
  CANCELLED: 'bg-danger/15 text-danger',
};

const grouped = computed(() => {
  const m: Record<string, { creator: any; items: any[] }> = {};
  for (const s of submissions.value) {
    const cid = s.creator.id;
    if (!m[cid]) m[cid] = { creator: s.creator, items: [] };
    m[cid].items.push(s);
  }
  return Object.values(m);
});

const stats = computed(() => {
  const total = submissions.value.length;
  const byStatus: Record<string, number> = {};
  for (const s of submissions.value) {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  }
  return { total, byStatus };
});

async function load() {
  loading.value = true;
  try {
    const [t, s] = await Promise.all([
      apiClient.get(`/admin/tasks/${props.id}`),
      apiClient.get(`/admin/tasks/${props.id}/submissions`),
    ]);
    task.value = t.data;
    submissions.value = s.data || [];
  } catch (e: any) {
    notify(e?.response?.data?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function approve(ipId: string) {
  if (!confirm('确认通过此提交? 状态将变为 PUBLIC_INTENT (公示中)')) return;
  acting.value = true;
  try {
    await apiClient.post(`/admin/tasks/${props.id}/submissions/${ipId}/approve`);
    notify('已通过');
    load();
  } catch (e: any) {
    notify(e?.response?.data?.message || '操作失败');
  } finally {
    acting.value = false;
  }
}

async function reject() {
  if (!rejectModal.value || rejectReason.value.trim().length < 5) {
    notify('拒绝原因至少 5 字');
    return;
  }
  acting.value = true;
  try {
    await apiClient.post(`/admin/tasks/${props.id}/submissions/${rejectModal.value.ipId}/reject`, {
      reason: rejectReason.value.trim(),
    });
    notify('已拒绝');
    rejectModal.value = null;
    rejectReason.value = '';
    load();
  } catch (e: any) {
    notify(e?.response?.data?.message || '操作失败');
  } finally {
    acting.value = false;
  }
}

async function closeTask() {
  if (!task.value) return;
  if (!confirm(`确认关闭「${task.value.title}」? 创作者将无法再接单`)) return;
  try {
    await apiClient.patch(`/admin/tasks/${props.id}`, { action: 'CLOSE' });
    notify('任务已关闭');
    load();
  } catch (e: any) {
    notify(e?.response?.data?.message || '关闭失败');
  }
}

async function completeTask() {
  if (!task.value) return;
  if (!confirm('确认标完成? 任务将进入 COMPLETED 终态')) return;
  try {
    await apiClient.patch(`/admin/tasks/${props.id}`, { action: 'COMPLETE' });
    notify('任务已完成');
    load();
  } catch (e: any) {
    notify(e?.response?.data?.message || '操作失败');
  }
}

function fmtSpec() {
  if (!task.value?.spec) return '';
  const s = task.value.spec;
  const parts: string[] = [];
  if (s.gender) parts.push(genderLabel[s.gender] || s.gender);
  if (s.ageBuckets?.length) parts.push(s.ageBuckets.map((a: string) => ageLabel[a] || a).join('/'));
  if (s.ethnicities?.length) parts.push(s.ethnicities.map((e: string) => ethLabel[e] || e).join('/'));
  if (s.styleTags?.length) parts.push(s.styleTags.join('·'));
  if (s.scenarioTags?.length) parts.push(s.scenarioTags.join('·'));
  return parts.join(' · ');
}

onMounted(load);
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-6 space-y-5">
    <RouterLink to="/tasks" class="text-xs text-ink/50 hover:text-ink inline-block">← 返回任务列表</RouterLink>

    <div v-if="loading" class="text-center text-sm text-ink/50 py-8">加载中…</div>
    <div v-else-if="!task" class="text-center text-sm text-ink/50 py-8">任务不存在</div>
    <template v-else>
      <!-- 任务头 -->
      <section class="card-base">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-2 flex-wrap">
              <span :class="taskStatusColor[task.status]" class="text-xs px-2 py-0.5 rounded-full">
                {{ taskStatusLabel[task.status] || task.status }}
              </span>
              <h1 class="font-display text-2xl">{{ task.title }}</h1>
            </div>
            <p class="text-sm text-ink/70 leading-relaxed whitespace-pre-line">{{ task.description }}</p>
            <div class="mt-3 p-3 bg-cream/60 rounded-lg text-xs text-ink/70">
              <span class="font-medium">规格:</span> {{ fmtSpec() || '不限' }}
            </div>
          </div>
          <div class="shrink-0 flex flex-col items-end gap-2">
            <div class="text-right">
              <div class="text-2xl font-mono">¥{{ (task.budgetFen / 100).toFixed(0) }}</div>
              <div class="text-xs text-ink/50">总预算</div>
            </div>
            <div v-if="task.perIpFen" class="text-right">
              <div class="text-sm font-mono">¥{{ (task.perIpFen / 100).toFixed(0) }} / IP</div>
              <div class="text-xs text-ink/50">单 IP 报酬</div>
            </div>
            <div class="flex gap-2">
              <button
                v-if="task.status === 'OPEN'"
                @click="closeTask"
                class="text-xs px-3 py-1.5 border border-line rounded-full hover:bg-ink hover:text-cream transition"
              >关闭</button>
              <button
                v-if="task.status === 'CLOSED'"
                @click="completeTask"
                class="text-xs px-3 py-1.5 bg-gold text-ink rounded-full hover:bg-ink hover:text-cream transition"
              >标完成</button>
            </div>
          </div>
        </div>
        <div class="mt-4 pt-4 border-t border-line flex items-center gap-6 text-xs text-ink/60 flex-wrap">
          <span>截止: {{ new Date(task.deadlineAt).toLocaleDateString() }}</span>
          <span>已接: {{ task._count?.accepts || 0 }} / {{ task.maxAccepts }}</span>
          <span>提交: {{ stats.total }}</span>
          <span v-for="(n, s) in stats.byStatus" :key="s">{{ statusLabel[s] || s }}: {{ n }}</span>
        </div>
      </section>

      <!-- 提交列表 (按创作者分组) -->
      <section class="card-base">
        <h2 class="font-medium mb-4">提交列表 ({{ stats.total }})</h2>
        <div v-if="grouped.length === 0" class="text-sm text-ink/50 text-center py-8">
          暂无提交
        </div>
        <div v-else class="space-y-4">
          <div
            v-for="g in grouped"
            :key="g.creator.id"
            class="border border-line rounded-xl p-4"
          >
            <div class="flex items-center gap-2 mb-3 pb-2 border-b border-line">
              <span class="font-medium">{{ g.creator.displayName }}</span>
              <span class="text-xs text-ink/50 font-mono">{{ g.creator.email }}</span>
              <span class="text-xs text-ink/40">·</span>
              <span class="text-xs text-ink/50">提交 {{ g.items.length }} 个</span>
            </div>
            <div class="space-y-2">
              <div
                v-for="ip in g.items"
                :key="ip.id"
                class="flex items-center gap-3 p-2 bg-cream/40 rounded-lg"
              >
                <RouterLink :to="`/ips/${ip.id}`" class="flex items-center gap-3 flex-1 min-w-0 hover:bg-gold/10 rounded p-1">
                  <span class="text-sm font-medium">{{ ip.displayName }}</span>
                  <span class="text-xs text-ink/50 font-mono">{{ ip.code }}</span>
                  <span class="text-xs px-2 py-0.5 bg-cream border border-line rounded-full">
                    {{ statusLabel[ip.status] || ip.status }}
                  </span>
                  <span v-if="ip.rejectionReason" class="text-xs text-danger truncate" :title="ip.rejectionReason">
                    ✕ {{ ip.rejectionReason }}
                  </span>
                </RouterLink>
                <div class="shrink-0 flex items-center gap-2">
                  <button
                    v-if="ip.status === 'PENDING_REVIEW' || ip.status === 'REVIEWED_PROOFING'"
                    @click="approve(ip.id)"
                    :disabled="acting"
                    class="text-xs px-3 py-1 bg-success text-cream rounded-full hover:bg-success/80 transition disabled:opacity-50"
                  >通过</button>
                  <button
                    v-if="ip.status === 'PENDING_REVIEW' || ip.status === 'REVIEWED_PROOFING' || ip.status === 'REJECTED'"
                    @click="rejectModal = { ipId: ip.id, name: ip.displayName }"
                    :disabled="acting"
                    class="text-xs px-3 py-1 border border-danger text-danger rounded-full hover:bg-danger hover:text-cream transition disabled:opacity-50"
                  >拒绝</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- 拒绝原因 modal -->
    <div v-if="rejectModal" class="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4" @click.self="rejectModal = null">
      <div class="bg-cream rounded-2xl p-6 max-w-md w-full space-y-4">
        <h3 class="font-medium">拒绝「{{ rejectModal.name }}」</h3>
        <p class="text-xs text-ink/60">创作者将看到这条原因, 请具体说明问题 (≥ 5 字)</p>
        <textarea
          v-model="rejectReason"
          rows="4"
          class="w-full px-3 py-2 border border-line rounded-lg bg-surface text-sm"
          placeholder="例如: 面部特写不清晰, 请重新上传 ≥2048×2048"
        ></textarea>
        <div class="flex justify-end gap-2">
          <button @click="rejectModal = null; rejectReason = ''" class="px-4 py-2 text-sm text-ink/60 hover:text-ink">取消</button>
          <button
            @click="reject"
            :disabled="acting"
            class="px-6 py-2 bg-danger text-cream rounded-full text-sm hover:bg-danger/80 transition disabled:opacity-50"
          >{{ acting ? '处理中...' : '确认拒绝' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
