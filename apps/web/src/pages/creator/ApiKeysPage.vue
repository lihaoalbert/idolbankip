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
  if (!confirm(`确定撤销 "${label}" 这个 API key 吗?撤销后立即失效, 无法恢复。`)) return;
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
    () => toast.error('复制失败, 请手动选中'),
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

function shortId(id: string, len = 8): string {
  return id ? id.slice(-len).toUpperCase() : '—';
}

onMounted(fetch);
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <!-- 顶部条 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">IBIren · AGENT KEYS</div>
        <div class="catalog-no text-ink/40">VOL. I — API ACCESS</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-6 lg:px-10 py-10 md:py-16">
      <!-- 返回捏者中心 -->
      <RouterLink to="/creator" class="catalog-no text-ink/50 hover:text-gold transition inline-flex items-center gap-2 mb-6">
        <span>←</span><span>RETURN TO CREATOR CENTER</span>
      </RouterLink>

      <!-- 章节头 -->
      <div class="grid grid-cols-12 gap-4 mb-8">
        <div class="col-span-3 catalog-no text-ink/50">№ 032</div>
        <div class="col-span-3 col-start-5 catalog-no text-ink/50">CHAPTER XXXII — API</div>
        <div class="col-span-3 col-start-9 catalog-no text-ink/50">{{ items.length }} ACTIVE KEYS</div>
        <div class="col-span-3 col-start-12 catalog-no text-ink/50 text-right hidden md:block">AGENT ACCESS</div>
      </div>

      <div class="mb-10">
        <h1 class="font-display text-5xl md:text-7xl text-ink leading-[0.95]">
          Agent <span class="font-display-italic text-gold">API</span> Key
        </h1>
        <p class="mt-4 text-base text-ink/60 max-w-2xl leading-relaxed">
          通过 API key 接入 n8n / 脚本 / 第三方 Agent
          <span class="font-display-italic text-ink">批量上传 IP</span>
          · 所有 key 仅显示一次明文 · 丢失需重新生成。
        </p>
      </div>

      <!-- 创建表单 -->
      <section class="mb-10 bg-surface border-0.5 border-ink p-6 md:p-8 relative">
        <div class="absolute -top-3 left-8">
          <div class="stamp text-gold border-gold bg-cream">ISSUE NEW</div>
        </div>
        <div class="catalog-no text-ink/50 mb-4">— 01 — NEW KEY · 生成新 Key</div>
        <div class="flex gap-3">
          <input
            v-model="newLabel"
            type="text"
            placeholder="例如: n8n-prod / Mac mini / agent-01"
            class="flex-1 px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition text-sm"
            @keyup.enter="create"
          />
          <button
            @click="create"
            :disabled="creating || !newLabel.trim()"
            class="inline-flex items-center gap-3 px-5 py-3 bg-ink text-cream hover:bg-gold transition catalog-no text-xs disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <span class="text-cream/70 group-hover:text-ink/70 text-[10px]">ISSUE</span>
            <span>{{ creating ? '生成中…' : '生成' }}</span>
          </button>
        </div>
        <p class="mt-3 catalog-no text-xs text-ink/40">
          DEFAULT SCOPES · <code class="text-gold">ips:create, ips:upload</code>
        </p>
      </section>

      <!-- 明文显示 (一次性) -->
      <section
        v-if="justCreated"
        class="mb-10 bg-gold/5 border-2 border-gold/60 p-6 md:p-8 relative overflow-hidden"
      >
        <div class="absolute top-4 right-4 stamp text-gold border-gold">ONE-TIME</div>
        <div class="flex items-start gap-3 mb-4">
          <span class="font-display-italic text-gold text-3xl shrink-0">⚠</span>
          <div>
            <div class="catalog-no text-gold mb-1">NEW API KEY · 一次性明文</div>
            <div class="font-display text-xl text-ink mb-2">你的新 API key</div>
            <div class="text-sm text-ink/70 leading-relaxed">
              请立即保存到密码管理器 · 关闭此面板后将
              <span class="text-danger font-medium">无法再次查看</span>
              · IBIren 不存储明文副本。
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 mb-4">
          <code class="flex-1 px-4 py-3 bg-cream border-0.5 border-gold/40 text-sm font-mono break-all">
            {{ justCreated.plainKey }}
          </code>
          <button
            @click="copyKey"
            class="inline-flex items-center gap-2 px-4 py-3 bg-ink text-cream hover:bg-gold transition shrink-0 catalog-no text-xs group"
          >
            <span class="text-cream/70 group-hover:text-ink/70 text-[10px]">COPY</span>
            <span>复制</span>
          </button>
        </div>
        <div class="grid md:grid-cols-3 gap-4 text-xs">
          <div>
            <div class="catalog-no text-ink/40 mb-1">LABEL</div>
            <div class="font-mono text-ink">{{ justCreated.label }}</div>
          </div>
          <div>
            <div class="catalog-no text-ink/40 mb-1">PREFIX</div>
            <div class="font-mono text-ink">{{ justCreated.keyPrefix }}...</div>
          </div>
          <div>
            <div class="catalog-no text-ink/40 mb-1">SCOPES</div>
            <div class="font-mono text-gold">{{ justCreated.scopes.join(', ') }}</div>
          </div>
        </div>
        <button
          @click="justCreated = null"
          class="mt-5 catalog-no text-xs text-ink/60 hover:text-ink"
        >
          ✓ SAVED · CLOSE
        </button>
      </section>

      <!-- Key 列表 -->
      <section>
        <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
          — 02 — ISSUED KEYS · 已签发 Key
        </div>

        <div v-if="loading" class="space-y-3">
          <div v-for="i in 3" :key="i" class="bg-surface border-0.5 border-line p-5">
            <Skeleton shape="line" width="60%" height-class="h-4" />
            <div class="mt-3"><Skeleton shape="line" width="40%" height-class="h-2" /></div>
          </div>
        </div>

        <EmptyState
          v-else-if="items.length === 0"
          icon="◇"
          title="— No keys issued yet —"
          description="生成第一个 key, 让你的脚本 / Agent 可以批量创建 IP。"
        />

        <div v-else class="bg-surface border-0.5 border-ink">
          <!-- 表头 -->
          <div class="hidden md:grid grid-cols-12 gap-4 px-6 py-4 hairline-b border-line bg-cream/50 catalog-no text-ink/50">
            <div class="col-span-3">LABEL</div>
            <div class="col-span-3">KEY</div>
            <div class="col-span-2">SCOPES</div>
            <div class="col-span-2">LAST USED</div>
            <div class="col-span-2 text-right">ACTIONS</div>
          </div>

          <div
            v-for="k in items"
            :key="k.id"
            :class="['grid grid-cols-12 gap-4 px-6 py-5 hairline-b border-line items-center hover:bg-gold/5 transition', k.revokedAt && 'opacity-40']"
          >
            <div class="col-span-12 md:col-span-3">
              <div class="font-display text-base text-ink">{{ k.label }}</div>
              <div class="font-mono text-[10px] text-ink/40 mt-0.5">{{ shortId(k.id) }}</div>
            </div>
            <div class="col-span-6 md:col-span-3">
              <code class="font-mono text-xs text-ink/70">{{ k.keyPrefix }}...</code>
            </div>
            <div class="col-span-6 md:col-span-2">
              <code class="text-xs text-gold">{{ k.scopes }}</code>
            </div>
            <div class="col-span-6 md:col-span-2 catalog-no text-xs text-ink/60">
              {{ timeAgo(k.lastUsedAt) }}
            </div>
            <div class="col-span-6 md:col-span-2 md:text-right">
              <span v-if="k.revokedAt" class="catalog-no text-xs text-danger">REVOKED</span>
              <button
                v-else
                @click="revoke(k.id, k.label)"
                class="catalog-no text-xs text-danger hover:underline"
              >
                REVOKE
              </button>
            </div>
          </div>

          <div class="px-6 py-4 flex items-center justify-between catalog-no text-ink/40">
            <span>END OF REGISTER</span>
            <span>{{ items.length }} KEYS ON RECORD</span>
          </div>
        </div>
      </section>

      <!-- 文档片段 · 像图录的附录 -->
      <section class="mt-12 bg-cream border-0.5 border-ink p-6 md:p-8">
        <div class="catalog-no text-ink/50 mb-3">APPENDIX · 使用方式</div>
        <p class="text-sm text-ink/60 mb-4">
          通过 <code class="font-mono text-gold">x-api-key</code> 头调用 REST API:
        </p>
        <pre class="bg-ink text-cream/90 p-4 text-xs font-mono overflow-x-auto leading-relaxed"><code>curl -H "x-api-key: ibi_sk_xxxxxxxxxxxxxxxx" \
     -H "Content-Type: application/json" \
     -d '{"items":[{"displayName":"苏清禾","description":"...","gender":"FEMALE","visualAgeBucket":"YOUNG_ADULT","styleTags":["realistic"],"scenarioTags":["portrait"],"fullLicensePriceFen":199900}]}' \
     {{ origin }}/api/v1/agent/ips/batch</code></pre>
        <p class="mt-4 catalog-no text-xs text-ink/50">
          COMPLETE CLI · <code class="font-mono">scripts/bulk-upload.mjs</code>
          (读 manifest.json 自动批量创建并上传)
        </p>
      </section>
    </main>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line mt-12">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. API-032</span>
        <span>SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>

<script lang="ts">
import { defineComponent as _defineComponent } from 'vue';
import SkeletonComp from '@/components/Skeleton.vue';
import EmptyStateComp from '@/components/EmptyState.vue';
export default { components: { Skeleton: SkeletonComp, EmptyState: EmptyStateComp } };
</script>
