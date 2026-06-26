<script setup lang="ts">
/**
 * #30.6.26 Admin LLM Provider Config — 系统设置 / LLM 配置.
 *
 * 用途: 不需发版即可在 admin UI 换 LLM provider / API key / model.
 * 安全性: apiKey 永远不显示明文 — 列表只显示末 4 位, 编辑时如不修改则不传 apiKey 字段.
 *
 * 复用模式:
 *   - 列表 + 状态 badge: 镜像 IpQueuePage.vue 的 card 表格风格
 *   - 操作 modal: 镜像 TaskDetailAdminPage.vue:276 的 fixed overlay
 *   - native confirm() 危险操作 (删除 / 切换 active)
 *   - inline success/error banner (参考 CopyrightDetailAdminPage.vue:230-231)
 */
import { computed, onMounted, ref } from 'vue';
import { llmConfigApi, type LlmConfigRow, type LlmProvider, type TestConnectionResult } from '@/api/llm-config';

const items = ref<LlmConfigRow[]>([]);
const loading = ref(true);
const acting = ref(false);
const success = ref('');
const error = ref('');

// modal: 单一 modal, mode 决定 create / edit
type Modal = null | { mode: 'create' } | { mode: 'edit'; row: LlmConfigRow };
const modal = ref<Modal>(null);

const form = ref({
  provider: 'minimax' as LlmProvider,
  displayName: '',
  baseUrl: 'https://api.minimaxi.com',
  model: 'claude-3-5-sonnet-20241022',
  apiKey: '',
  apiKeyDirty: false, // 编辑模式下是否修改了 apiKey
  note: '',
  setActive: false, // 仅 create 时可见
});

const testResults = ref<Record<string, TestConnectionResult>>({});

const showKey = ref(false);

const PROVIDER_OPTIONS: { value: LlmProvider; label: string; urlHint: string }[] = [
  { value: 'minimax', label: 'MiniMax (Anthropic 兼容)', urlHint: 'https://api.minimaxi.com' },
  { value: 'anthropic', label: 'Anthropic Claude', urlHint: 'https://api.anthropic.com' },
  { value: 'openai', label: 'OpenAI', urlHint: 'https://api.openai.com' },
  { value: 'dashscope', label: '阿里云 DashScope', urlHint: 'https://dashscope.aliyuncs.com' },
  { value: 'custom', label: '自定义 (OpenAI 兼容)', urlHint: 'http://your-endpoint/v1' },
];

const activeRow = computed(() => items.value.find((r) => r.isActive) || null);
const inactiveRows = computed(() => items.value.filter((r) => !r.isActive));

function providerLabel(p: LlmProvider) {
  return PROVIDER_OPTIONS.find((o) => o.value === p)?.label || p;
}

function resetForm() {
  form.value = {
    provider: 'minimax',
    displayName: '',
    baseUrl: 'https://api.minimaxi.com',
    model: 'claude-3-5-sonnet-20241022',
    apiKey: '',
    apiKeyDirty: false,
    note: '',
    setActive: false,
  };
}

function openCreate() {
  resetForm();
  error.value = '';
  modal.value = { mode: 'create' };
}

function openEdit(row: LlmConfigRow) {
  form.value = {
    provider: row.provider,
    displayName: row.displayName,
    baseUrl: row.baseUrl,
    model: row.model,
    apiKey: '',
    apiKeyDirty: false,
    note: row.note || '',
    setActive: false,
  };
  error.value = '';
  modal.value = { mode: 'edit', row };
}

function onProviderChange() {
  const opt = PROVIDER_OPTIONS.find((o) => o.value === form.value.provider);
  if (opt) form.value.baseUrl = opt.urlHint;
}

function closeModal() {
  if (acting.value) return;
  modal.value = null;
}

async function load() {
  loading.value = true;
  try {
    items.value = await llmConfigApi.list();
  } catch (e: any) {
    error.value = e?.response?.data?.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.value.displayName.trim() || form.value.displayName.trim().length < 2) {
    error.value = '显示名至少 2 字';
    return;
  }
  if (!form.value.baseUrl.trim().startsWith('http')) {
    error.value = 'baseUrl 必须以 http/https 开头';
    return;
  }
  if (!form.value.model.trim()) {
    error.value = 'model 不能为空';
    return;
  }
  if (modal.value?.mode === 'create') {
    if (!form.value.apiKey || form.value.apiKey.length < 8) {
      error.value = 'API key 至少 8 字符';
      return;
    }
  } else if (modal.value?.mode === 'edit' && form.value.apiKeyDirty) {
    if (!form.value.apiKey || form.value.apiKey.length < 8) {
      error.value = 'API key 至少 8 字符';
      return;
    }
  }

  acting.value = true;
  error.value = '';
  try {
    if (modal.value?.mode === 'create') {
      const r = await llmConfigApi.create({
        provider: form.value.provider,
        displayName: form.value.displayName.trim(),
        baseUrl: form.value.baseUrl.trim(),
        model: form.value.model.trim(),
        apiKey: form.value.apiKey,
        note: form.value.note.trim() || undefined,
        setActive: form.value.setActive,
      });
      success.value = form.value.setActive
        ? `已创建并设为当前 active: ${r.displayName}`
        : `已创建: ${r.displayName}`;
    } else if (modal.value?.mode === 'edit') {
      const body: any = {
        provider: form.value.provider,
        displayName: form.value.displayName.trim(),
        baseUrl: form.value.baseUrl.trim(),
        model: form.value.model.trim(),
        note: form.value.note.trim() || null,
      };
      if (form.value.apiKeyDirty) body.apiKey = form.value.apiKey;
      const r = await llmConfigApi.update(modal.value.row.id, body);
      success.value = `已更新: ${r.displayName}`;
    }
    modal.value = null;
    await load();
    setTimeout(() => (success.value = ''), 4000);
  } catch (e: any) {
    error.value = e?.response?.data?.message || '保存失败';
  } finally {
    acting.value = false;
  }
}

async function setActive(row: LlmConfigRow) {
  if (row.isActive) return;
  if (!confirm(`切换当前 active 到「${row.displayName}」?\n\n当前 active 配置的所有 in-flight 请求会继续用旧 key 完成; 之后新请求走新 key.`)) return;
  acting.value = true;
  error.value = '';
  try {
    const r = await llmConfigApi.setActive(row.id);
    success.value = `已切换到: ${r.displayName}`;
    await load();
    setTimeout(() => (success.value = ''), 4000);
  } catch (e: any) {
    error.value = e?.response?.data?.message || '切换失败';
  } finally {
    acting.value = false;
  }
}

async function remove(row: LlmConfigRow) {
  if (row.isActive) {
    error.value = '当前 active 配置不能删, 请先切换到别的配置';
    setTimeout(() => (error.value = ''), 4000);
    return;
  }
  if (!confirm(`确认删除「${row.displayName}」?\n\n该配置的 API key 加密数据会从 DB 永久移除. 此操作不可恢复.`)) return;
  acting.value = true;
  error.value = '';
  try {
    await llmConfigApi.remove(row.id);
    success.value = `已删除: ${row.displayName}`;
    await load();
    setTimeout(() => (success.value = ''), 4000);
  } catch (e: any) {
    error.value = e?.response?.data?.message || '删除失败';
  } finally {
    acting.value = false;
  }
}

async function testConn(row: LlmConfigRow) {
  acting.value = true;
  error.value = '';
  try {
    const r = await llmConfigApi.test(row.id);
    testResults.value = { ...testResults.value, [row.id]: r };
    if (r.ok) {
      success.value = `✓ ${row.displayName} 连接成功 (${r.latencyMs}ms)`;
    } else {
      error.value = `✗ ${row.displayName} 连接失败: ${r.error || '未知错误'}`;
    }
    setTimeout(() => {
      success.value = '';
      error.value = '';
    }, 6000);
  } catch (e: any) {
    error.value = e?.response?.data?.message || '测试请求失败';
  } finally {
    acting.value = false;
  }
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('zh-CN', { hour12: false });
}

function maskKey(last4: string) {
  if (!last4) return '••••••••';
  return `sk-••••••••${last4}`;
}

onMounted(load);
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 py-8 space-y-6">
    <div class="flex items-baseline justify-between">
      <h1 class="font-display text-2xl">LLM 配置</h1>
      <button @click="openCreate" class="btn-primary">+ 新增配置</button>
    </div>

    <div v-if="success" class="card-base border-success/30 bg-success/10 text-success text-sm">{{ success }}</div>
    <div v-if="error && !modal" class="card-base border-danger/30 bg-danger/10 text-danger text-sm">{{ error }}</div>

    <!-- 说明 -->
    <div class="card-base bg-cream/50 text-sm text-ink/70 space-y-2">
      <div class="font-medium text-ink">💡 用途</div>
      <p>管理 ibi.ren 平台 AI 服务所用的 LLM provider 配置 (Claude / GPT / 通义等). API key AES-256-GCM 加密存 DB, 切换配置不需发版.</p>
      <p>当前 <strong class="text-ink">{{ activeRow ? activeRow.displayName : '无 active 配置' }}</strong> 被 <code class="font-mono text-xs">AiService</code> 使用, 创作者 AI 识别 / 任务建议 / 反推特征 / 说明书生成都走它.</p>
      <p class="text-xs text-ink/50">⚠ 切换 active 时, 正在进行的 LLM 请求会继续用旧 key 完成 (in-flight 不中断); 之后新请求走新 key.</p>
    </div>

    <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>

    <template v-else>
      <!-- 当前 active -->
      <section v-if="activeRow" class="card-base border-gold/40 bg-gold/5">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="badge bg-gold/20 text-gold">★ 当前 active</span>
              <span class="text-xs text-ink/50">{{ providerLabel(activeRow.provider) }}</span>
            </div>
            <div class="font-display text-lg">{{ activeRow.displayName }}</div>
            <div class="text-xs font-mono text-ink/60 mt-1">
              <span class="text-ink/40">baseUrl:</span> {{ activeRow.baseUrl }}
            </div>
            <div class="text-xs font-mono text-ink/60">
              <span class="text-ink/40">model:</span> {{ activeRow.model }}
            </div>
            <div class="text-xs font-mono text-ink/60">
              <span class="text-ink/40">apiKey:</span> {{ maskKey(activeRow.apiKeyLast4) }}
            </div>
            <div v-if="activeRow.note" class="text-xs text-ink/60 mt-2 italic">📝 {{ activeRow.note }}</div>
            <div class="text-[10px] text-ink/40 mt-2">激活于 {{ fmtDate(activeRow.activeAt) }}</div>
          </div>
          <div class="flex flex-col gap-2 shrink-0">
            <button @click="openEdit(activeRow)" :disabled="acting" class="btn-ghost text-xs">编辑</button>
            <button @click="testConn(activeRow)" :disabled="acting" class="btn-ghost text-xs">测试连接</button>
            <span v-if="testResults[activeRow.id]" :class="['text-xs text-center', testResults[activeRow.id].ok ? 'text-success' : 'text-danger']">
              {{ testResults[activeRow.id].ok ? '✓' : '✗' }} {{ testResults[activeRow.id].latencyMs }}ms
            </span>
          </div>
        </div>
      </section>

      <!-- 备用配置列表 -->
      <section v-if="inactiveRows.length > 0" class="space-y-3">
        <h2 class="font-medium text-sm text-ink/60 uppercase tracking-wide">备用配置 ({{ inactiveRows.length }})</h2>
        <div v-for="row in inactiveRows" :key="row.id" class="card-base">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs text-ink/50">{{ providerLabel(row.provider) }}</span>
              </div>
              <div class="font-medium">{{ row.displayName }}</div>
              <div class="text-xs font-mono text-ink/60 mt-1">
                <span class="text-ink/40">baseUrl:</span> {{ row.baseUrl }} · <span class="text-ink/40">model:</span> {{ row.model }}
              </div>
              <div class="text-xs font-mono text-ink/60">
                <span class="text-ink/40">apiKey:</span> {{ maskKey(row.apiKeyLast4) }}
              </div>
              <div v-if="row.note" class="text-xs text-ink/60 mt-2 italic">📝 {{ row.note }}</div>
            </div>
            <div class="flex flex-col gap-2 shrink-0">
              <button @click="setActive(row)" :disabled="acting" class="btn-ghost text-xs">设为当前</button>
              <button @click="openEdit(row)" :disabled="acting" class="btn-ghost text-xs">编辑</button>
              <button @click="testConn(row)" :disabled="acting" class="btn-ghost text-xs">测试连接</button>
              <button @click="remove(row)" :disabled="acting" class="btn-warn text-xs">删除</button>
              <span v-if="testResults[row.id]" :class="['text-xs text-center', testResults[row.id].ok ? 'text-success' : 'text-danger']">
                {{ testResults[row.id].ok ? '✓' : '✗' }} {{ testResults[row.id].latencyMs }}ms
              </span>
            </div>
          </div>
        </div>
      </section>

      <div v-if="!activeRow && inactiveRows.length === 0" class="card-base text-center text-ink/50 py-12">
        还没有任何 LLM 配置. 点击右上「+ 新增配置」开始.
      </div>
    </template>

    <!-- modal: create / edit 复用 -->
    <div v-if="modal" class="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4" @click.self="closeModal">
      <div class="bg-cream rounded-2xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 class="font-medium">
          {{ modal.mode === 'create' ? '新增 LLM 配置' : `编辑「${modal.row.displayName}」` }}
        </h3>

        <div>
          <label class="text-xs text-ink/60 block mb-1">Provider</label>
          <select v-model="form.provider" @change="onProviderChange" class="input-base">
            <option v-for="o in PROVIDER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>

        <div>
          <label class="text-xs text-ink/60 block mb-1">显示名 (≥ 2 字)</label>
          <input v-model="form.displayName" placeholder="例: MiniMax 生产 / Anthropic 备用" class="input-base" />
        </div>

        <div>
          <label class="text-xs text-ink/60 block mb-1">baseUrl (≥ 8 字符, http/https)</label>
          <input v-model="form.baseUrl" placeholder="https://api.minimaxi.com" class="input-base font-mono text-xs" />
        </div>

        <div>
          <label class="text-xs text-ink/60 block mb-1">model</label>
          <input v-model="form.model" placeholder="claude-3-5-sonnet-20241022" class="input-base font-mono text-xs" />
        </div>

        <div>
          <label class="text-xs text-ink/60 block mb-1">
            API key
            <span v-if="modal.mode === 'edit'" class="text-ink/40 font-normal">
              (留空保留旧 key, 修改请填完整新 key, 至少 8 字符)
            </span>
          </label>
          <div class="relative">
            <input
              v-model="form.apiKey"
              @input="form.apiKeyDirty = !!form.apiKey"
              :type="showKey ? 'text' : 'password'"
              :placeholder="modal.mode === 'create' ? 'sk-api-...' : '留空 = 不修改'"
              class="input-base font-mono text-xs pr-16"
              autocomplete="off"
            />
            <button
              type="button"
              @click="showKey = !showKey"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink/50 hover:text-ink"
            >{{ showKey ? '隐藏' : '显示' }}</button>
          </div>
          <p class="text-[10px] text-ink/40 mt-1">AES-256-GCM 加密存 DB, 不会以明文出现在 list 接口中.</p>
        </div>

        <div>
          <label class="text-xs text-ink/60 block mb-1">备注 (可选)</label>
          <input v-model="form.note" placeholder="例: 余额充足主用 / 应急备用" class="input-base" />
        </div>

        <div v-if="modal.mode === 'create'">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input v-model="form.setActive" type="checkbox" class="rounded" />
            <span>创建后立即设为当前 active (会顶掉现有 active)</span>
          </label>
        </div>

        <div v-if="error" class="text-danger text-xs">{{ error }}</div>

        <div class="flex justify-end gap-2 pt-2 border-t border-line">
          <button @click="closeModal" :disabled="acting" class="px-4 py-2 text-sm text-ink/60 hover:text-ink">取消</button>
          <button @click="save" :disabled="acting" class="btn-primary">
            {{ acting ? '保存中...' : (modal.mode === 'create' ? '创建' : '保存') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>