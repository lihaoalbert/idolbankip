<script setup lang="ts">
/**
 * Workspace 详情页 — /workspaces/:id
 * W3 W2 D1
 * 创作者: 改工具链 + 分镜 + 提交 (active / revision → submitted)
 * 买家: 通过 / 打回 (submitted → approved / revision)
 * 双方: 看 brief 概要 + 消息列表 + 发消息
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';

interface BriefSummary {
  id: string;
  title: string;
  buyerId: string;
  status: string;
  budgetMin: string;
  budgetMax: string;
  deadlineAt: string;
  description: string | null;
  // R11.1 P0-1: 关联订单(最新一笔),买家侧顶栏「去支付」CTA 用
  orders?: Array<{ id: string; status: string; amountFen: number; paidAt: string | null }>;
}

interface Workspace {
  id: string;
  briefId: string;
  creatorId: string;
  toolchain: Record<string, boolean>;
  scripts: unknown;
  status: 'active' | 'submitted' | 'approved' | 'revision';
  startedAt: string;
  submittedAt: string | null;
  finishedAt: string | null;
  revisionCount: number;
  brief: BriefSummary;
}

interface MessageItem {
  id: string;
  content: string;
  type: string;
  createdAt: string;
  from: { id: string; displayName: string; avatarUrl: string | null };
}

interface AIGenRecord {
  id: string;
  toolName: string;
  modelName: string;
  prompt: string;
  outputUrl: string | null;
  costCents: number;
  durationMs: number;
  status: 'success' | 'failed' | 'timeout';
  errorMsg: string | null;
  createdAt: string;
}

const TOOL_LABELS: Record<string, string> = {
  sora: 'Sora',
  kling: '可灵',
  jimeng: '即梦',
  runway: 'Runway',
};

interface SubmissionItem {
  id: string;
  version: number;
  ossKeys: string[];
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  createdAt: string;
  comments: Array<{
    id: string;
    content: string;
    createdAt: string;
    from: { id: string; displayName: string; avatarUrl: string | null };
  }>;
}

const route = useRoute();
const router = useRouter();
const toast = useToast();
const auth = useAuthStore();

const workspaceId = computed(() => String(route.params.id));
const role = computed(() =>
  auth.user?.roles?.includes('CREATOR') ? 'creator' : 'buyer',
);

const workspace = ref<Workspace | null>(null);
const messages = ref<MessageItem[]>([]);
const generations = ref<AIGenRecord[]>([]);
const generationsTotal = ref(0);
const generationsCostCents = ref(0);
const submissions = ref<SubmissionItem[]>([]);
const loading = ref(true);
const sending = ref(false);
const acting = ref(false);

// R11.1 P0-1: workspace 顶栏「去支付」主入口
const payingWs = ref(false);
async function payWorkspaceOrder() {
  if (!workspace.value?.brief?.orders?.[0]) return;
  const orderId = workspace.value.brief.orders[0].id;
  payingWs.value = true;
  try {
    await apiClient.post(`/orders/${orderId}/pay`, { channel: 'mock_alipay' });
    toast.success('支付成功 — 创作者已收到通知,可开始上传中间稿');
    await fetchWorkspace();
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '支付失败');
  } finally {
    payingWs.value = false;
  }
}

// D5 中间稿上传
const subNotes = ref('');
const subFiles = ref(''); // 逗号分隔 OSS keys (mock 阶段)
const uploading = ref(false);
const subComments = ref<Record<string, string>>({});

const toolchain = ref<Record<string, boolean>>({});
const scriptsText = ref('');
const newMessage = ref('');
const messageEnd = ref<HTMLElement | null>(null);

// AI 工具调用面板
const enabledTools = computed(() =>
  Object.entries(toolchain.value)
    .filter(([, v]) => v)
    .map(([k]) => k),
);
const genTool = ref<string>('');
const genPrompt = ref('');
const genDuration = ref<number>(8);
const genEstimating = ref<{ costCents: number; durationSec: number } | null>(null);
const callingTool = ref(false);

// D3 — 工具链满配成本预估
const toolchainCost = ref<{
  items: Array<{ toolName: string; costCents: number }>;
  totalCents: number;
} | null>(null);

async function fetchToolchainCost() {
  if (role.value !== 'creator' || !workspace.value) return;
  try {
    const { data } = await apiClient.get<{
      items: Array<{ toolName: string; costCents: number }>;
      totalCents: number;
    }>(`/creator/workspaces/${workspace.value.id}/toolchain/cost-estimate`);
    toolchainCost.value = data;
  } catch {
    toolchainCost.value = null;
  }
}

watch(
  enabledTools,
  (t) => {
    if (!genTool.value && t.length > 0) genTool.value = t[0];
    if (genTool.value && !t.includes(genTool.value)) genTool.value = t[0] ?? '';
  },
  { immediate: true },
);

const TOOLS = [
  { key: 'sora', label: 'Sora (OpenAI)' },
  { key: 'kling', label: '可灵 (快手)' },
  { key: 'jimeng', label: '即梦 (字节)' },
  { key: 'runway', label: 'Runway' },
];

const STATUS_LABEL: Record<string, string> = {
  active: '创作中',
  submitted: '已提交待审核',
  approved: '已通过',
  revision: '打回修改',
};

async function fetchWorkspace() {
  loading.value = true;
  try {
    const path =
      role.value === 'creator'
        ? `/creator/workspaces/${workspaceId.value}`
        : `/buyer/workspaces/${workspaceId.value}`;
    const { data } = await apiClient.get<{ workspace: Workspace }>(path);
    workspace.value = data.workspace;
    toolchain.value = { ...data.workspace.toolchain };
    scriptsText.value = data.workspace.scripts
      ? JSON.stringify(data.workspace.scripts, null, 2)
      : '';
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '加载 workspace 失败');
  } finally {
    loading.value = false;
  }
}

async function fetchGenerations() {
  if (role.value !== 'creator' && role.value !== 'buyer') return;
  try {
    const path =
      role.value === 'creator'
        ? `/creator/workspaces/${workspaceId.value}/generations`
        : `/buyer/workspaces/${workspaceId.value}/generations`;
    const { data } = await apiClient.get<{
      items: AIGenRecord[];
      total: number;
      totalCostCents: number;
    }>(path);
    generations.value = data.items;
    generationsTotal.value = data.total;
    generationsCostCents.value = data.totalCostCents;
  } catch (e: any) {
    // 静默 — 不阻塞主页面
    console.warn('load generations failed', e);
  }
}

async function fetchSubmissions() {
  if (role.value !== 'creator' && role.value !== 'buyer') return;
  try {
    const { data } = await apiClient.get<{ items: SubmissionItem[]; total: number }>(
      `/workspaces/${workspaceId.value}/submissions`,
    );
    submissions.value = data.items;
  } catch (e: any) {
    console.warn('load submissions failed', e);
  }
}

async function uploadSubmission() {
  if (!workspace.value) return;
  const keys = subFiles.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!keys.length) {
    toast.error('至少填一个 OSS key');
    return;
  }
  uploading.value = true;
  try {
    await apiClient.post(
      `/creator/workspaces/${workspace.value.id}/submissions`,
      { ossKeys: keys, notes: subNotes.value.trim() || undefined },
    );
    toast.success('中间稿已上传');
    subFiles.value = '';
    subNotes.value = '';
    await fetchSubmissions();
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '上传失败');
  } finally {
    uploading.value = false;
  }
}

async function setSubmissionStatus(submissionId: string, status: 'approved' | 'rejected') {
  if (!confirm(`确认将中间稿标记为 ${status === 'approved' ? '通过' : '打回'}?`)) return;
  acting.value = true;
  try {
    await apiClient.post(`/buyer/submissions/${submissionId}/status`, { status });
    toast.success(status === 'approved' ? '已通过' : '已打回');
    await fetchSubmissions();
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '操作失败');
  } finally {
    acting.value = false;
  }
}

async function addSubmissionComment(submissionId: string) {
  const content = (subComments.value[submissionId] ?? '').trim();
  if (!content) return;
  acting.value = true;
  try {
    await apiClient.post(`/submissions/${submissionId}/comments`, { content });
    subComments.value[submissionId] = '';
    await fetchSubmissions();
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '评论失败');
  } finally {
    acting.value = false;
  }
}

async function fetchPreflight() {
  if (!genTool.value) {
    genEstimating.value = null;
    return;
  }
  try {
    const { data } = await apiClient.get<{
      estimate: { costCents: number; durationSec: number };
    }>(
      `/creator/workspaces/${workspaceId.value}/tools/preflight`,
      {
        params: { toolName: genTool.value, durationSec: genDuration.value },
      },
    );
    genEstimating.value = data.estimate;
  } catch {
    genEstimating.value = null;
  }
}

async function callTool() {
  if (!genTool.value || !genPrompt.value.trim() || !workspace.value) return;
  callingTool.value = true;
  try {
    await apiClient.post(
      `/creator/workspaces/${workspace.value.id}/generate`,
      {
        toolName: genTool.value,
        prompt: genPrompt.value.trim(),
        durationSec: genDuration.value,
      },
    );
    toast.success(`${TOOL_LABELS[genTool.value] ?? genTool.value} 调用完成`);
    genPrompt.value = '';
    await fetchGenerations();
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '调用失败');
  } finally {
    callingTool.value = false;
  }
}

async function fetchMessages() {
  try {
    const path =
      role.value === 'creator'
        ? `/creator/workspaces/${workspaceId.value}/messages`
        : `/buyer/workspaces/${workspaceId.value}/messages`;
    const { data } = await apiClient.get<{ items: MessageItem[]; total: number }>(
      path,
    );
    messages.value = data.items;
    await nextTick();
    messageEnd.value?.scrollIntoView({ behavior: 'smooth' });
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '加载消息失败');
  }
}

async function saveToolchain() {
  if (!workspace.value) return;
  acting.value = true;
  try {
    const { data } = await apiClient.patch<{ workspace: Workspace }>(
      `/creator/workspaces/${workspace.value.id}/toolchain`,
      { toolchain: toolchain.value },
    );
    workspace.value = data.workspace;
    toast.success('工具链已保存');
    await fetchToolchainCost();
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '保存失败');
  } finally {
    acting.value = false;
  }
}

async function saveScripts() {
  if (!workspace.value) return;
  let parsed: unknown = null;
  if (scriptsText.value.trim()) {
    try {
      parsed = JSON.parse(scriptsText.value);
    } catch {
      toast.error('分镜必须是合法 JSON');
      return;
    }
  }
  acting.value = true;
  try {
    const { data } = await apiClient.patch<{ workspace: Workspace }>(
      `/creator/workspaces/${workspace.value.id}/scripts`,
      { scripts: parsed },
    );
    workspace.value = data.workspace;
    toast.success('分镜已保存');
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '保存失败');
  } finally {
    acting.value = false;
  }
}

async function submit() {
  if (!workspace.value) return;
  acting.value = true;
  try {
    const { data } = await apiClient.post<{ workspace: Workspace }>(
      `/creator/workspaces/${workspace.value.id}/submit`,
    );
    workspace.value = data.workspace;
    toast.success('已提交,等待买家审核');
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '提交失败');
  } finally {
    acting.value = false;
  }
}

async function approve() {
  if (!workspace.value) return;
  if (!confirm('确认通过并结束这次创作?')) return;
  acting.value = true;
  try {
    const { data } = await apiClient.post<{ workspace: Workspace }>(
      `/buyer/workspaces/${workspace.value.id}/approve`,
    );
    workspace.value = data.workspace;
    toast.success('已通过,工作台结束');
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '操作失败');
  } finally {
    acting.value = false;
  }
}

async function requestRevision() {
  if (!workspace.value) return;
  if (!confirm('确认打回让创作者修改?')) return;
  acting.value = true;
  try {
    const { data } = await apiClient.post<{ workspace: Workspace }>(
      `/buyer/workspaces/${workspace.value.id}/revision`,
    );
    workspace.value = data.workspace;
    toast.success('已打回,创作者可再次提交');
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '操作失败');
  } finally {
    acting.value = false;
  }
}

async function sendMessage() {
  const content = newMessage.value.trim();
  if (!content || !workspace.value) return;
  sending.value = true;
  try {
    const path =
      role.value === 'creator'
        ? `/creator/workspaces/${workspace.value.id}/messages`
        : `/buyer/workspaces/${workspace.value.id}/messages`;
    await apiClient.post(path, { content, type: 'text' });
    newMessage.value = '';
    await fetchMessages();
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '发送失败');
  } finally {
    sending.value = false;
  }
}

const canCreatorEdit = computed(
  () =>
    role.value === 'creator' &&
    workspace.value != null &&
    (workspace.value.status === 'active' || workspace.value.status === 'revision'),
);
const canCreatorSubmit = computed(
  () =>
    role.value === 'creator' &&
    workspace.value != null &&
    (workspace.value.status === 'active' || workspace.value.status === 'revision'),
);
const canBuyerDecide = computed(
  () => role.value === 'buyer' && workspace.value?.status === 'submitted',
);

function goBrief() {
  if (!workspace.value) return;
  if (role.value === 'creator') {
    router.push({ name: 'creator-brief-detail', params: { id: workspace.value.briefId } });
  } else {
    router.push({ name: 'buyer-brief-detail', params: { id: workspace.value.briefId } });
  }
}

onMounted(async () => {
  await fetchWorkspace();
  await fetchMessages();
  await fetchGenerations();
  await fetchToolchainCost();
  await fetchSubmissions();
});

watch(workspaceId, async () => {
  await fetchWorkspace();
  await fetchMessages();
  await fetchGenerations();
  await fetchSubmissions();
});

watch([genTool, genDuration], () => {
  fetchPreflight();
});
</script>

<template>
  <div class="ws-page">
    <header v-if="workspace" class="ws-header">
      <button class="ws-back" @click="goBrief">← 返回 brief</button>
      <div class="ws-title-row">
        <h1>{{ workspace.brief.title }}</h1>
        <span :class="['ws-status', `ws-status-${workspace.status}`]">
          {{ STATUS_LABEL[workspace.status] ?? workspace.status }}
        </span>
      </div>
      <p class="ws-meta">
        预算 ¥{{ workspace.brief.budgetMin }} - ¥{{ workspace.brief.budgetMax }} ·
        截止 {{ new Date(workspace.brief.deadlineAt).toLocaleDateString() }} ·
        第 {{ workspace.revisionCount }} 次打回
      </p>
      <!-- R11.1 P0-1: 买家侧「去支付」主入口 — 决策中心 -->
      <div
        v-if="role === 'buyer' && workspace.brief.orders?.[0]?.status === 'CREATED'"
        class="ws-pay-cta"
      >
        <span class="ws-pay-label">💳 买家尚未支付定金</span>
        <button class="ws-btn ws-btn-primary" :disabled="payingWs" @click="payWorkspaceOrder">
          {{ payingWs ? '支付中…' : `去支付 ¥${(workspace.brief.orders[0].amountFen / 100).toFixed(0)} →` }}
        </button>
      </div>
      <div
        v-else-if="role === 'buyer' && workspace.brief.orders?.[0]?.status === 'DOWNLOAD_UNLOCKED'"
        class="ws-pay-cta ws-pay-cta-done"
      >
        <span class="ws-pay-label">✓ 定金已付 — 协作已激活</span>
      </div>
      <!-- R11.2 P1-2: 顶栏审核快捷 CTA,创作者已提交时显眼 -->
      <div
        v-if="role === 'buyer' && workspace.status === 'submitted'"
        class="ws-pay-cta"
        style="background: rgba(220, 38, 38, 0.06); border-color: #dc2626;"
      >
        <span class="ws-pay-label" style="color: #dc2626;">📩 创作者已提交 — 等待你审核</span>
        <button class="ws-btn ws-btn-primary" :disabled="acting" @click="approve">通过 / 打回</button>
      </div>
    </header>

    <div v-if="loading" class="ws-loading">加载中…</div>

    <main v-else-if="workspace" class="ws-main">
      <section v-if="role === 'creator'" class="ws-panel">
        <h2>工具链</h2>
        <p class="ws-hint">勾选本次创作会用到的 AI 工具</p>
        <div class="ws-toolchain">
          <label v-for="t in TOOLS" :key="t.key" class="ws-tool">
            <input
              type="checkbox"
              :disabled="!canCreatorEdit"
              v-model="toolchain[t.key]"
            />
            {{ t.label }}
          </label>
        </div>
        <button
          v-if="canCreatorEdit"
          class="ws-btn ws-btn-secondary"
          :disabled="acting"
          @click="saveToolchain"
        >
          保存工具链
        </button>
        <div v-if="toolchainCost && toolchainCost.totalCents > 0" class="ws-cost-bar">
          <strong>工具链满配预估成本:</strong>
          ¥{{ (toolchainCost.totalCents / 100).toFixed(2) }}
          <span class="ws-cost-detail">
            ({{ toolchainCost.items
              .map((i) => `${TOOL_LABELS[i.toolName] ?? i.toolName} ¥${(i.costCents / 100).toFixed(2)}`)
              .join(' + ') }})
          </span>
        </div>
      </section>

      <section v-if="role === 'creator'" class="ws-panel">
        <h2>分镜脚本</h2>
        <p class="ws-hint">JSON 格式,可写场景列表/镜头时长/动作描述等</p>
        <textarea
          v-model="scriptsText"
          :disabled="!canCreatorEdit"
          class="ws-scripts"
          rows="8"
          placeholder='[{"scene":1,"desc":"开场镜头","duration":3}]'
        />
        <button
          v-if="canCreatorEdit"
          class="ws-btn ws-btn-secondary"
          :disabled="acting"
          @click="saveScripts"
        >
          保存分镜
        </button>
      </section>

      <section v-if="role === 'creator'" class="ws-panel">
        <h2>AI 工具调用</h2>
        <p class="ws-hint">
          工具链里勾选的工具可以在这里调用,所有调用都会落库记成本(¥{{ (generationsCostCents / 100).toFixed(2) }} 累计)
        </p>
        <div v-if="!enabledTools.length" class="ws-empty">
          请先在工具链里至少勾选一个工具
        </div>
        <template v-else>
          <div class="ws-gen-form">
            <label class="ws-gen-field">
              <span>工具</span>
              <select v-model="genTool" :disabled="callingTool">
                <option v-for="t in enabledTools" :key="t" :value="t">
                  {{ TOOL_LABELS[t] ?? t }}
                </option>
              </select>
            </label>
            <label class="ws-gen-field ws-gen-field-small">
              <span>时长(秒)</span>
              <input
                v-model.number="genDuration"
                type="number"
                min="1"
                max="60"
                :disabled="callingTool"
              />
            </label>
          </div>
          <textarea
            v-model="genPrompt"
            :disabled="callingTool"
            class="ws-scripts"
            rows="4"
            placeholder="提示词描述要生成的视频内容,例如:东亚-女-青年-苏清禾,在咖啡厅里对着镜头微笑,镜头从特写拉远"
          />
          <div class="ws-gen-meta">
            <span v-if="genEstimating">
              预估成本: ¥{{ (genEstimating.costCents / 100).toFixed(2) }} ·
              {{ genEstimating.durationSec }}s
            </span>
            <button
              class="ws-btn ws-btn-primary"
              :disabled="callingTool || !genPrompt.trim()"
              @click="callTool"
            >
              {{ callingTool ? '调用中…' : '调用' }}
            </button>
          </div>
        </template>

        <div v-if="generations.length" class="ws-gen-list">
          <h3>调用记录 ({{ generationsTotal }})</h3>
          <div
            v-for="r in generations"
            :key="r.id"
            :class="['ws-gen-item', `ws-gen-${r.status}`]"
          >
            <div class="ws-gen-row1">
              <span class="ws-gen-tool">{{ TOOL_LABELS[r.toolName] ?? r.toolName }}</span>
              <span class="ws-gen-cost">¥{{ (r.costCents / 100).toFixed(2) }}</span>
              <span class="ws-gen-time">
                {{ new Date(r.createdAt).toLocaleString() }}
              </span>
            </div>
            <div class="ws-gen-prompt">{{ r.prompt }}</div>
            <div v-if="r.outputUrl" class="ws-gen-out">
              <a :href="r.outputUrl" target="_blank" rel="noopener">查看输出</a>
            </div>
            <div v-if="r.status === 'failed'" class="ws-gen-err">
              失败: {{ r.errorMsg }}
            </div>
          </div>
        </div>
      </section>

      <section class="ws-panel">
        <h2>中间稿 (创作者上传,买家评论)</h2>
        <p class="ws-hint">
          共 {{ submissions.length }} 版 — 每个版本独立评论流,买家可标记通过/打回
        </p>

        <div v-if="role === 'creator' && canCreatorEdit" class="ws-sub-form">
          <label class="ws-gen-field">
            <span>OSS Keys (逗号分隔,mock 阶段手动填)</span>
            <input
              v-model="subFiles"
              :disabled="uploading"
              placeholder="creators/me/v1.mp4, creators/me/v1-script.json"
            />
          </label>
          <label class="ws-gen-field">
            <span>备注</span>
            <textarea
              v-model="subNotes"
              :disabled="uploading"
              rows="2"
              placeholder="本次中间稿的备注,例如:刚做完分镜 P1"
            />
          </label>
          <button
            class="ws-btn ws-btn-primary"
            :disabled="uploading || !subFiles.trim()"
            @click="uploadSubmission"
          >
            {{ uploading ? '上传中…' : '上传中间稿' }}
          </button>
        </div>

        <div v-if="!submissions.length" class="ws-empty">还没有中间稿</div>
        <div v-else class="ws-sub-list">
          <div v-for="s in submissions" :key="s.id" class="ws-sub-item">
            <div class="ws-sub-header">
              <strong>v{{ s.version }}</strong>
              <span :class="['ws-sub-status', `ws-sub-status-${s.status}`]">
                {{
                  s.status === 'pending' ? '待审' :
                  s.status === 'approved' ? '通过' :
                  s.status === 'rejected' ? '打回' :
                  '已被新版替换'
                }}
              </span>
              <span class="ws-sub-time">{{ new Date(s.createdAt).toLocaleString() }}</span>
            </div>
            <div v-if="s.notes" class="ws-sub-notes">{{ s.notes }}</div>
            <div class="ws-sub-keys">
              <a v-for="k in s.ossKeys" :key="k" :href="`https://mock.ibi.ren/${k}`" target="_blank" rel="noopener">
                {{ k }}
              </a>
            </div>
            <div v-if="role === 'buyer' && s.status === 'pending'" class="ws-sub-buyer-actions">
              <button class="ws-btn ws-btn-primary" :disabled="acting" @click="setSubmissionStatus(s.id, 'approved')">
                通过
              </button>
              <button class="ws-btn ws-btn-danger" :disabled="acting" @click="setSubmissionStatus(s.id, 'rejected')">
                打回
              </button>
            </div>

            <div class="ws-sub-comments">
              <div v-if="!s.comments.length" class="ws-sub-empty-comments">还没有评论</div>
              <div v-for="c in s.comments" :key="c.id" class="ws-sub-comment">
                <div class="ws-sub-comment-meta">
                  {{ c.from.displayName }} · {{ new Date(c.createdAt).toLocaleString() }}
                </div>
                <div class="ws-sub-comment-content">{{ c.content }}</div>
              </div>
              <div class="ws-sub-comment-form">
                <textarea
                  v-model="subComments[s.id]"
                  rows="2"
                  placeholder="评论…"
                />
                <button
                  class="ws-btn ws-btn-secondary"
                  :disabled="acting || !(subComments[s.id] ?? '').trim()"
                  @click="addSubmissionComment(s.id)"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="role === 'creator' && canCreatorSubmit" class="ws-panel">
        <h2>提交创作成果</h2>
        <p class="ws-hint">确认工具链和分镜无误后,提交给买家审核</p>
        <button class="ws-btn ws-btn-primary" :disabled="acting" @click="submit">
          提交审核
        </button>
      </section>

      <section v-if="role === 'buyer' && canBuyerDecide" class="ws-panel">
        <h2>审核创作者提交</h2>
        <p class="ws-hint">通过则结束工作台,打回则让创作者再次修改</p>
        <div class="ws-buyer-actions">
          <button class="ws-btn ws-btn-primary" :disabled="acting" @click="approve">
            通过
          </button>
          <button class="ws-btn ws-btn-danger" :disabled="acting" @click="requestRevision">
            打回修改
          </button>
        </div>
      </section>

      <section class="ws-panel ws-messages-panel">
        <h2>沟通记录</h2>
        <div class="ws-messages">
          <div v-if="!messages.length" class="ws-empty">还没有消息,发一条打个招呼吧</div>
          <div
            v-for="m in messages"
            :key="m.id"
            :class="['ws-msg', m.from.id === auth.user?.id ? 'ws-msg-mine' : 'ws-msg-other']"
          >
            <div class="ws-msg-meta">
              {{ m.from.displayName }} · {{ new Date(m.createdAt).toLocaleString() }}
            </div>
            <div class="ws-msg-content">{{ m.content }}</div>
          </div>
          <div ref="messageEnd" />
        </div>
        <div class="ws-composer">
          <textarea
            v-model="newMessage"
            rows="2"
            placeholder="输入消息…"
            :disabled="sending"
            @keydown.ctrl.enter.prevent="sendMessage"
          />
          <button class="ws-btn ws-btn-primary" :disabled="sending || !newMessage.trim()" @click="sendMessage">
            发送
          </button>
        </div>
      </section>
    </main>

    <div v-else class="ws-error">无法加载 workspace</div>
  </div>
</template>

<style scoped>
.ws-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 20px 80px;
  color: #1f2937;
}
.ws-back {
  background: none;
  border: 0;
  color: #6b7280;
  cursor: pointer;
  font-size: 14px;
  margin-bottom: 12px;
  padding: 0;
}
.ws-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.ws-title-row h1 {
  font-size: 22px;
  margin: 0;
}
.ws-status {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 500;
}
.ws-status-active { background: #dbeafe; color: #1d4ed8; }
.ws-status-submitted { background: #fef3c7; color: #92400e; }
.ws-status-approved { background: #d1fae5; color: #047857; }
.ws-status-revision { background: #fee2e2; color: #b91c1c; }
.ws-meta {
  color: #6b7280;
  font-size: 13px;
  margin: 8px 0 0;
}
/* R11.1 P0-1: workspace 顶栏「去支付」CTA */
.ws-pay-cta {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(220, 38, 38, 0.06);
  border: 0.5px solid #dc2626;
  border-radius: 4px;
}
.ws-pay-cta-done {
  background: rgba(16, 185, 129, 0.08);
  border-color: #10b981;
}
.ws-pay-label {
  font-size: 13px;
  color: #dc2626;
  font-weight: 500;
}
.ws-pay-cta-done .ws-pay-label { color: #047857; }
.ws-loading, .ws-error {
  text-align: center;
  padding: 60px 0;
  color: #6b7280;
}
.ws-main {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 20px;
}
.ws-panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
}
.ws-panel h2 {
  font-size: 16px;
  margin: 0 0 4px;
}
.ws-hint {
  color: #6b7280;
  font-size: 13px;
  margin: 0 0 12px;
}
.ws-toolchain {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.ws-tool {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}
.ws-scripts {
  width: 100%;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 13px;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-sizing: border-box;
  resize: vertical;
}
.ws-btn {
  border: 0;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
}
.ws-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ws-btn-primary { background: #2563eb; color: #fff; }
.ws-btn-secondary { background: #f3f4f6; color: #1f2937; }
.ws-btn-danger { background: #fee2e2; color: #b91c1c; }
.ws-buyer-actions {
  display: flex;
  gap: 12px;
}
.ws-messages-panel {
  display: flex;
  flex-direction: column;
}
.ws-messages {
  max-height: 360px;
  overflow-y: auto;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ws-empty {
  text-align: center;
  color: #9ca3af;
  padding: 24px 0;
  font-size: 13px;
}
.ws-msg {
  max-width: 75%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 14px;
}
.ws-msg-mine {
  align-self: flex-end;
  background: #2563eb;
  color: #fff;
}
.ws-msg-other {
  align-self: flex-start;
  background: #f3f4f6;
  color: #1f2937;
}
.ws-msg-meta {
  font-size: 11px;
  opacity: 0.75;
  margin-bottom: 4px;
}
.ws-msg-content {
  white-space: pre-wrap;
  word-break: break-word;
}
.ws-composer {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.ws-composer textarea {
  flex: 1;
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
}

/* AI 工具调用面板 */
.ws-gen-form {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.ws-gen-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #6b7280;
}
.ws-gen-field-small { max-width: 120px; }
.ws-gen-field select,
.ws-gen-field input {
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #1f2937;
  background: #fff;
}
.ws-gen-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: 13px;
  color: #6b7280;
}
.ws-gen-list {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}
.ws-gen-list h3 {
  font-size: 14px;
  margin: 0 0 8px;
  color: #6b7280;
}
.ws-gen-item {
  padding: 10px;
  border-radius: 8px;
  background: #f9fafb;
  margin-bottom: 8px;
}
.ws-gen-failed { background: #fef2f2; }
.ws-gen-row1 {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 13px;
  margin-bottom: 4px;
}
.ws-gen-tool { font-weight: 500; }
.ws-gen-cost { color: #1d4ed8; font-weight: 500; }
.ws-gen-time { color: #9ca3af; font-size: 12px; margin-left: auto; }
.ws-gen-prompt {
  font-size: 13px;
  color: #4b5563;
  word-break: break-word;
}
.ws-gen-out {
  margin-top: 4px;
  font-size: 12px;
}
.ws-gen-out a {
  color: #2563eb;
  text-decoration: none;
}
.ws-gen-out a:hover { text-decoration: underline; }
.ws-gen-err {
  margin-top: 4px;
  font-size: 12px;
  color: #b91c1c;
}

/* D3 成本预估条 */
.ws-cost-bar {
  margin-top: 12px;
  padding: 10px 12px;
  background: #eff6ff;
  border-radius: 8px;
  font-size: 14px;
  color: #1e40af;
}
.ws-cost-detail {
  margin-left: 6px;
  font-size: 12px;
  color: #3b82f6;
}

/* D5 中间稿面板 */
.ws-sub-form {
  background: #f9fafb;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ws-sub-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ws-sub-item {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  background: #fff;
}
.ws-sub-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.ws-sub-header strong { font-size: 15px; }
.ws-sub-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}
.ws-sub-status-pending { background: #fef3c7; color: #92400e; }
.ws-sub-status-approved { background: #d1fae5; color: #047857; }
.ws-sub-status-rejected { background: #fee2e2; color: #b91c1c; }
.ws-sub-status-superseded { background: #e5e7eb; color: #6b7280; }
.ws-sub-time {
  font-size: 12px;
  color: #9ca3af;
  margin-left: auto;
}
.ws-sub-notes {
  font-size: 13px;
  color: #4b5563;
  margin-bottom: 6px;
  padding: 6px 10px;
  background: #f9fafb;
  border-radius: 6px;
}
.ws-sub-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.ws-sub-keys a {
  font-size: 12px;
  color: #2563eb;
  text-decoration: none;
  background: #eff6ff;
  padding: 2px 8px;
  border-radius: 4px;
  word-break: break-all;
}
.ws-sub-keys a:hover { text-decoration: underline; }
.ws-sub-buyer-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.ws-sub-comments {
  border-top: 1px dashed #e5e7eb;
  padding-top: 8px;
}
.ws-sub-empty-comments {
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
  padding: 8px 0;
}
.ws-sub-comment {
  padding: 6px 10px;
  background: #f9fafb;
  border-radius: 6px;
  margin-bottom: 4px;
}
.ws-sub-comment-meta {
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 2px;
}
.ws-sub-comment-content {
  font-size: 13px;
  color: #1f2937;
  white-space: pre-wrap;
  word-break: break-word;
}
.ws-sub-comment-form {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.ws-sub-comment-form textarea {
  flex: 1;
  padding: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
}
</style>