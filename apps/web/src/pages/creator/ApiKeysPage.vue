<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';
import { useToast } from '@/composables/useToast';

const origin = computed(() => window.location.origin);

interface ApiKey {
  id: string;
  keyPrefix: string;
  label: string;
  scopes: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface CreatedKey {
  id: string;
  plainKey: string;
  keyPrefix: string;
  label: string;
  scopes: string[];
  expiresAt: string | null;
  createdAt: string;
}

const items = ref<ApiKey[]>([]);
const loading = ref(true);
const creating = ref(false);
const newLabel = ref('');
const justCreated = ref<CreatedKey | null>(null);
const toast = useToast();

async function fetch() {
  loading.value = true;
  try {
    const { data } = await apiClient.get('/creator/api-keys');
    items.value = data;
  } finally { loading.value = false; }
}

async function create() {
  if (!newLabel.value.trim()) {
    toast.error('请输入 Key 名称');
    return;
  }
  creating.value = true;
  try {
    const { data } = await apiClient.post('/creator/api-keys', { label: newLabel.value.trim() });
    justCreated.value = data;
    newLabel.value = '';
    await fetch();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '创建失败');
  } finally {
    creating.value = false;
  }
}

async function revoke(id: string, label: string) {
  if (!confirm(`确定撤销 "${label}" 这个 API key 吗?撤销后立即失效,无法恢复。`)) return;
  try {
    await apiClient.delete(`/creator/api-keys/${id}`);
    toast.success('已撤销');
    await fetch();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '撤销失败');
  }
}

function copyKey() {
  if (!justCreated.value) return;
  navigator.clipboard.writeText(justCreated.value.plainKey).then(
    () => toast.success('已复制到剪贴板'),
    () => toast.error('复制失败,请手动选中'),
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

onMounted(fetch);
</script>

<template>
  <div class="max-w-4xl mx-auto px-6 py-10">
    <div class="mb-6">
      <h1 class="text-2xl font-display">Agent API Key</h1>
      <p class="text-sm text-ink/60 mt-1">
        通过 API key 接入 n8n / 脚本 / 第三方 Agent 批量上传 IP。所有 key 仅显示一次明文,丢失需重新生成。
      </p>
    </div>

    <!-- 创建表单 -->
    <div class="mb-6 p-5 bg-surface border border-line rounded-2xl">
      <h2 class="text-sm font-medium mb-3">生成新 Key</h2>
      <div class="flex gap-2">
        <input
          v-model="newLabel"
          type="text"
          placeholder="例如: n8n-prod / 我家 Mac mini"
          class="flex-1 px-3 py-2 bg-cream border border-line rounded text-sm focus:outline-none focus:border-gold"
          @keyup.enter="create"
        />
        <button
          @click="create"
          :disabled="creating || !newLabel.trim()"
          class="px-4 py-2 bg-ink text-cream text-sm rounded hover:bg-gold transition disabled:opacity-40"
        >
          {{ creating ? '生成中...' : '生成' }}
        </button>
      </div>
      <p class="text-xs text-ink/40 mt-2">
        默认可用 scope: <code class="text-gold">ips:create, ips:upload</code>
      </p>
    </div>

    <!-- 明文显示 (一次性) -->
    <div
      v-if="justCreated"
      class="mb-6 p-5 bg-gold/10 border-2 border-gold/40 rounded-2xl"
    >
      <div class="flex items-start gap-2 mb-3">
        <span class="text-2xl">⚠️</span>
        <div>
          <div class="font-medium text-ink">你的新 API key</div>
          <div class="text-xs text-ink/60 mt-0.5">
            请立即保存到密码管理器。关闭此面板后将无法再次查看。
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2 mb-3">
        <code class="flex-1 px-3 py-2 bg-cream border border-gold/30 rounded text-sm font-mono break-all">
          {{ justCreated.plainKey }}
        </code>
        <button
          @click="copyKey"
          class="px-3 py-2 bg-ink text-cream text-xs rounded hover:bg-gold transition shrink-0"
        >
          复制
        </button>
      </div>
      <div class="text-xs text-ink/60">
        Label: <strong>{{ justCreated.label }}</strong>
        · Prefix: <code class="font-mono">{{ justCreated.keyPrefix }}...</code>
        · Scopes: <code class="text-gold">{{ justCreated.scopes.join(', ') }}</code>
      </div>
      <button
        @click="justCreated = null"
        class="mt-3 text-xs text-ink/60 hover:text-ink underline"
      >
        我已保存,关闭
      </button>
    </div>

    <!-- Key 列表 -->
    <div v-if="loading" class="text-center py-8 text-ink/40 text-sm">加载中...</div>
    <EmptyState
      v-else-if="items.length === 0"
      icon="🔑"
      title="还没有 API key"
      description="生成第一个 key,让你的脚本/Agent 可以批量创建 IP。"
    />
    <table v-else class="w-full text-sm">
      <thead class="text-left text-xs text-ink/50 border-b border-line">
        <tr>
          <th class="py-2 font-normal">Label</th>
          <th class="py-2 font-normal">Key</th>
          <th class="py-2 font-normal">Scopes</th>
          <th class="py-2 font-normal">最后使用</th>
          <th class="py-2 font-normal">创建</th>
          <th class="py-2 font-normal text-right">操作</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-line">
        <tr v-for="k in items" :key="k.id" :class="k.revokedAt && 'opacity-40'">
          <td class="py-3 font-medium">{{ k.label }}</td>
          <td class="py-2 font-mono text-xs text-ink/60">{{ k.keyPrefix }}...</td>
          <td class="py-2 text-xs text-ink/60">{{ k.scopes }}</td>
          <td class="py-2 text-xs text-ink/60">{{ timeAgo(k.lastUsedAt) }}</td>
          <td class="py-2 text-xs text-ink/60">{{ timeAgo(k.createdAt) }}</td>
          <td class="py-2 text-right">
            <span v-if="k.revokedAt" class="text-xs text-danger">已撤销</span>
            <button
              v-else
              @click="revoke(k.id, k.label)"
              class="text-xs text-danger hover:underline"
            >
              撤销
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 文档片段 -->
    <div class="mt-10 p-5 bg-cream/50 border border-line rounded-2xl text-sm">
      <h3 class="font-medium mb-2">使用方式</h3>
      <p class="text-xs text-ink/60 mb-3">通过 <code class="text-gold font-mono">x-api-key</code> 头调用:</p>
      <pre class="bg-ink text-cream/90 p-3 rounded text-xs font-mono overflow-x-auto"><code>curl -H "x-api-key: ibi_sk_xxxxxxxxxxxxxxxx" \
     -H "Content-Type: application/json" \
     -d '{"items":[{"displayName":"苏清禾","description":"...","gender":"FEMALE","visualAgeBucket":"YOUNG_ADULT","styleTags":["realistic"],"scenarioTags":["portrait"],"fullLicensePriceFen":199900}]}' \
     {{ origin }}/api/v1/agent/ips/batch</code></pre>
      <p class="text-xs text-ink/50 mt-3">
        完整 CLI 工具: <code class="font-mono">scripts/bulk-upload.mjs</code> (读 manifest.json 自动批量创建并上传)
      </p>
    </div>
  </div>
</template>
