<script setup lang="ts">
/**
 * IP 创作者向导 — 单页 3 分段,替代 IpCreatePage + IpEditPage
 *
 * 步骤:
 *   1. 基础信息 (displayName / tagline / description / 性别 / 年龄 / 风格 / 场景 / 价格)
 *   2. 资产包 (8 类素材上传, 4 必填 + 4 选填)
 *   3. 预览提交 (汇总 + 提交审核)
 *
 * 路由:
 *   /creator/ips/new  → 进入向导, 步骤 1
 *   /creator/ips/:id  → 加载已有 IP, 进入步骤 2 (或根据 ?step= 跳转)
 *
 * 设计:
 *   - 顶部 sticky 进度条 (3 个圆点 + 连接线), 显示当前步 + 完成度
 *   - 每段独立卡片, 可滚动; 完成该段才能"下一步"
 *   - 步骤 1 "下一步": 新建场景 POST /ips → router.replace 到 /creator/ips/:id
 *                       编辑场景 PATCH /ips/:id
 *   - 步骤 2 上传中保持 uploadingType 单字段锁定
 *   - 步骤 3 仅当资产完整度 100% 时显示提交按钮
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient } from '@/api/client';
import Skeleton from '@/components/Skeleton.vue';
import { useToast } from '@/composables/useToast';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const ipId = computed(() => route.params.id as string | undefined);
const isNew = computed(() => !ipId.value);

// 1 / 2 / 3
const step = ref<number>(isNew.value ? 1 : 2);
const ip = ref<any>(null);
const files = ref<any[]>([]);
const loading = ref(false);
const submitting = ref(false);
const savingInfo = ref(false);
const uploadingType = ref<string | null>(null);

const infoForm = ref({
  displayName: '',
  tagline: '',
  description: '',
  gender: 'female',
  visualAgeBucket: 'young',
  styleTags: [] as string[],
  scenarioTags: [] as string[],
  depositPriceFen: 19900,
  fullLicensePriceFen: 300000,
});
const infoError = ref('');

const styleOptions = ['现代', '古风', '赛博', '二次元', '民国', '未来', '复古'];
const scenarioOptions = ['短剧群演', '短剧主演', '品牌代言', '平面模特', '游戏角色', '直播', '广告'];

const requiredTypes = ['THREE_VIEW', 'EXPRESSION_GRID', 'TRANSPARENT_RENDER', 'BIO_TXT'];
const allAssetTypes = [...requiredTypes, 'LORA_FILE', 'RECIPE_TXT', 'VOICE_REF', 'PACKAGE_ZIP'];
const fileTypeLabel: Record<string, string> = {
  THREE_VIEW: '三视图 (jpg/png, ≥2048×2048)',
  EXPRESSION_GRID: '表情矩阵 (5 种表情)',
  TRANSPARENT_RENDER: '立绘图 (PNG 带 alpha)',
  LORA_FILE: 'LoRA 模型 (.safetensors, ≤300MB)',
  RECIPE_TXT: 'Prompt 说明书 (触发词/参数)',
  BIO_TXT: '人物小传 (.txt)',
  VOICE_REF: '声音样本 (.wav, 可选)',
  PACKAGE_ZIP: '完整资产包 (.zip, 可选)',
};

const fileByType = computed(() => {
  const m: Record<string, any> = {};
  for (const f of files.value) m[f.assetType] = f;
  return m;
});

const completion = computed(() => {
  const present = new Set(files.value.filter((f) => f.validated).map((f) => f.assetType));
  return Math.round((requiredTypes.filter((t) => present.has(t)).length / requiredTypes.length) * 100);
});

const infoValid = computed(() =>
  infoForm.value.displayName.trim().length > 0 &&
  infoForm.value.description.trim().length > 0 &&
  infoForm.value.styleTags.length > 0 &&
  infoForm.value.scenarioTags.length > 0
);

const step1Done = computed(() => !!ip.value);
const step2Done = computed(() => completion.value === 100);
const canSubmit = computed(() => step1Done.value && step2Done.value && ip.value?.status === 'PENDING_REVIEW');

function toggle(arr: string[], v: string) {
  const i = arr.indexOf(v);
  if (i === -1) arr.push(v); else arr.splice(i, 1);
}

function jumpTo(target: number) {
  // 只允许跳到已完成或当前步
  if (target === 1) return step.value = 1;
  if (target === 2 && step1Done.value) return step.value = 2;
  if (target === 3 && step2Done.value) return step.value = 3;
}

async function loadIp() {
  if (isNew.value) return;
  loading.value = true;
  try {
    const list = await apiClient.get('/ips/mine/list');
    const found = list.data.items.find((x: any) => x.id === ipId.value);
    if (!found) {
      toast.error('未找到 IP');
      router.replace('/creator');
      return;
    }
    ip.value = found;
    files.value = found.files || [];
    infoForm.value = {
      displayName: found.displayName,
      tagline: found.tagline || '',
      description: found.description || '',
      gender: found.gender,
      visualAgeBucket: found.visualAgeBucket,
      styleTags: found.styleTags || [],
      scenarioTags: found.scenarioTags || [],
      depositPriceFen: Number(found.depositPriceFen),
      fullLicensePriceFen: Number(found.fullLicensePriceFen),
    };
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '加载 IP 失败');
  } finally {
    loading.value = false;
  }
}

async function saveInfo() {
  infoError.value = '';
  if (!infoValid.value) {
    infoError.value = '请填写名称、简介,并至少选择 1 个风格 + 1 个场景';
    return;
  }
  savingInfo.value = true;
  try {
    if (isNew.value) {
      const { data } = await apiClient.post('/ips', infoForm.value);
      toast.success('IP 创建成功,继续上传资产包');
      router.replace(`/creator/ips/${data.ip.id}`);
    } else {
      await apiClient.patch(`/ips/${ipId.value}`, infoForm.value);
      toast.success('基础信息已更新');
      await loadIp();
    }
    step.value = 2;
  } catch (e: any) {
    const msg = e?.response?.data?.message;
    infoError.value = Array.isArray(msg) ? msg.join('; ') : (msg || '保存失败');
    toast.error(infoError.value);
  } finally {
    savingInfo.value = false;
  }
}

async function requestUploadPolicy(assetType: string, file: File) {
  uploadingType.value = assetType;
  try {
    const { data: policy } = await apiClient.post('/upload/policy', {
      ipId: ipId.value,
      assetType,
      filename: file.name,
      size: file.size,
    });
    const fd = new FormData();
    fd.append('key', policy.key);
    fd.append('policy', policy.policy);
    fd.append('OSSAccessKeyId', policy.accessKeyId);
    fd.append('Signature', policy.signature);
    fd.append('file', file);
    const ossRes = await fetch(policy.host + '/', { method: 'POST', body: fd });
    if (!ossRes.ok) throw new Error(`OSS 上传失败 HTTP ${ossRes.status}`);
    const etag = (ossRes.headers.get('ETag') || '').replace(/"/g, '');
    await apiClient.post('/upload/oss-callback', {
      filename: file.name,
      size: file.size,
      etag,
      x: policy.key,
    });
    toast.success(`${fileTypeLabel[assetType]} 上传成功`);
    await loadIp();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || e?.message || '上传失败');
    throw e;
  } finally {
    uploadingType.value = null;
  }
}

async function submitForReview() {
  submitting.value = true;
  try {
    await apiClient.post(`/ips/${ipId.value}/submit`);
    toast.success('已提交审核');
    router.push('/creator');
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '提交失败');
  } finally {
    submitting.value = false;
  }
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

onMounted(loadIp);
watch(() => route.params.id, loadIp);

const stepMeta = [
  { num: 1, label: '基础信息', short: '①' },
  { num: 2, label: '资产包', short: '②' },
  { num: 3, label: '预览提交', short: '③' },
];
</script>

<template>
  <!-- 加载骨架 -->
  <div v-if="loading" class="max-w-4xl mx-auto px-6 py-10 space-y-6">
    <Skeleton shape="line" width="40%" height-class="h-6" />
    <Skeleton shape="line" width="60%" height-class="h-3" />
    <Skeleton shape="block" aspect="16/3" width-class="w-full rounded-2xl" />
    <Skeleton shape="line" :lines="5" />
  </div>

  <div v-else class="max-w-4xl mx-auto px-6 py-10">
    <!-- 返回 + 标题 + 状态条 -->
    <RouterLink to="/creator" class="text-xs text-ink/50 hover:text-ink mb-4 inline-block">← 返回创作者中心</RouterLink>
    <div v-if="ip" class="flex items-baseline justify-between mb-2">
      <h1 class="font-display text-3xl">{{ ip.displayName }}</h1>
      <span class="font-mono text-xs text-ink/40">{{ ip.code }}</span>
    </div>
    <div v-else class="mb-2">
      <h1 class="font-display text-3xl">创建新 IP</h1>
      <p class="text-sm text-ink/60 mt-1">填写基础信息后,下一步上传资产包,完整度 100% 即可提交审核</p>
    </div>
    <div v-if="ip" class="flex items-center gap-3 mb-6">
      <span class="text-xs px-2 py-0.5 bg-cream border border-line rounded-full">状态: {{ statusLabel(ip.status) }}</span>
      <span class="text-xs text-ink/60">资产完整度 {{ completion }}%</span>
      <span v-if="ip.tagline" class="text-xs text-ink/50">· {{ ip.tagline }}</span>
    </div>

    <!-- 步骤进度条 (sticky) -->
    <div class="sticky top-16 z-20 bg-cream/90 backdrop-blur -mx-6 px-6 py-4 mb-6 border-b border-line">
      <div class="flex items-center gap-3">
        <template v-for="(s, idx) in stepMeta" :key="s.num">
          <button
            type="button"
            @click="jumpTo(s.num)"
            :disabled="s.num > 1 && !(s.num === 2 ? step1Done : step2Done)"
            :class="[
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition',
              step === s.num
                ? 'bg-ink text-cream'
                : (s.num === 1 ? step1Done : s.num === 2 ? step1Done : step2Done)
                  ? 'bg-success/15 text-success hover:bg-success/25'
                  : 'bg-line/60 text-ink/40 cursor-not-allowed',
            ]"
          >
            <span :class="[
              'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono',
              step === s.num ? 'bg-cream text-ink' : 'bg-white/60 text-current',
            ]">{{ (s.num === 1 ? step1Done : s.num === 2 ? step1Done : step2Done) && step !== s.num ? '✓' : s.num }}</span>
            <span class="font-medium">{{ s.label }}</span>
          </button>
          <div v-if="idx < stepMeta.length - 1" class="flex-1 h-px bg-line" />
        </template>
      </div>
    </div>

    <!-- 步骤 1: 基础信息 -->
    <section v-show="step === 1" class="bg-white rounded-2xl border border-line p-6 space-y-5">
      <h2 class="font-display text-lg">① 基础信息</h2>
      <div>
        <label class="text-xs text-ink/60 block mb-1">IP 名称 <span class="text-danger">*</span></label>
        <input v-model="infoForm.displayName" required class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" placeholder="如:林知夏" />
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-1">一句话简介</label>
        <input v-model="infoForm.tagline" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" placeholder="如:都市冷感御姐,平面/短剧双栖" />
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-1">人物小传 (Markdown) <span class="text-danger">*</span></label>
        <textarea v-model="infoForm.description" rows="6" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold font-mono text-sm" placeholder="姓名 / 年龄 / 性格 / 背景故事..."></textarea>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-ink/60 block mb-1">性别</label>
          <select v-model="infoForm.gender" class="w-full px-3 py-2 border border-line rounded-lg bg-cream">
            <option value="female">女</option>
            <option value="male">男</option>
            <option value="nonbinary">无性别</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-ink/60 block mb-1">视觉年龄</label>
          <select v-model="infoForm.visualAgeBucket" class="w-full px-3 py-2 border border-line rounded-lg bg-cream">
            <option value="child">童</option>
            <option value="young">青</option>
            <option value="middle">中</option>
            <option value="old">老</option>
          </select>
        </div>
      </div>

      <div>
        <label class="text-xs text-ink/60 block mb-2">风格 (至少 1 个) <span class="text-danger">*</span></label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="s in styleOptions"
            :key="s"
            type="button"
            @click="toggle(infoForm.styleTags, s)"
            :class="infoForm.styleTags.includes(s) ? 'bg-ink text-cream' : 'bg-cream text-ink/60 border border-line'"
            class="px-3 py-1.5 text-xs rounded-full"
          >{{ s }}</button>
        </div>
      </div>

      <div>
        <label class="text-xs text-ink/60 block mb-2">应用场景 (至少 1 个) <span class="text-danger">*</span></label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="s in scenarioOptions"
            :key="s"
            type="button"
            @click="toggle(infoForm.scenarioTags, s)"
            :class="infoForm.scenarioTags.includes(s) ? 'bg-ink text-cream' : 'bg-cream text-ink/60 border border-line'"
            class="px-3 py-1.5 text-xs rounded-full"
          >{{ s }}</button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-ink/60 block mb-1">意向金 (元)</label>
          <input v-model.number="infoForm.depositPriceFen" type="number" min="0" step="100" class="w-full px-3 py-2 border border-line rounded-lg bg-cream" />
          <div class="text-[10px] text-ink/40 mt-1">默认 199 元 = 19900 分</div>
        </div>
        <div>
          <label class="text-xs text-ink/60 block mb-1">正式授权起价 (元)</label>
          <input v-model.number="infoForm.fullLicensePriceFen" type="number" min="0" step="100" class="w-full px-3 py-2 border border-line rounded-lg bg-cream" />
        </div>
      </div>

      <div v-if="infoError" class="p-3 bg-danger/10 text-danger text-sm rounded-lg">{{ infoError }}</div>

      <div class="flex justify-end gap-3 pt-2">
        <button
          v-if="!isNew"
          type="button"
          @click="step = 2"
          class="px-6 py-2 text-sm text-ink/60 hover:text-ink"
        >跳过</button>
        <button
          type="button"
          @click="saveInfo"
          :disabled="savingInfo || !infoValid"
          class="px-8 py-2.5 bg-ink text-cream rounded-full text-sm font-medium hover:bg-gold transition disabled:opacity-50"
        >
          {{ savingInfo ? '保存中...' : (isNew ? '创建并上传资产包 →' : '保存并继续 →') }}
        </button>
      </div>
    </section>

    <!-- 步骤 2: 资产包 -->
    <section v-show="step === 2" class="bg-white rounded-2xl border border-line p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-display text-lg">② 资产包</h2>
        <div class="text-xs text-ink/60">
          必填 4 项 / 选填 4 项 · 当前完成度
          <span class="font-mono ml-1" :class="completion === 100 ? 'text-success' : 'text-gold'">{{ completion }}%</span>
        </div>
      </div>
      <div class="h-1 bg-cream rounded-full overflow-hidden mb-6">
        <div class="h-full bg-gold transition-all" :style="{ width: completion + '%' }" />
      </div>
      <div v-if="!ip" class="p-6 bg-cream/60 rounded-xl text-center text-sm text-ink/60">
        请先完成步骤 ① 基础信息后再上传资产包
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="t in allAssetTypes"
          :key="t"
          class="p-4 border border-line rounded-xl flex items-center justify-between"
        >
          <div class="flex-1">
            <div class="text-sm font-medium">
              {{ fileTypeLabel[t] }}
              <span v-if="requiredTypes.includes(t)" class="text-danger text-[10px] ml-1">必填</span>
            </div>
            <div v-if="fileByType[t]" class="text-xs text-success mt-1">✓ {{ fileByType[t].originalName }} 已上传</div>
            <div v-else-if="requiredTypes.includes(t)" class="text-xs text-danger mt-1">必填,尚未上传</div>
            <div v-else class="text-xs text-ink/40 mt-1">选填</div>
          </div>
          <label
            :class="[
              'px-4 py-2 border rounded-full text-xs transition cursor-pointer',
              uploadingType === t
                ? 'bg-line text-ink/40 border-line cursor-wait'
                : 'bg-cream border-line hover:bg-ink hover:text-cream',
            ]"
          >
            {{ uploadingType === t ? '上传中…' : (fileByType[t] ? '替换' : '上传') }}
            <input
              type="file"
              class="hidden"
              :disabled="!!uploadingType"
              :accept="t === 'LORA_FILE' ? '.safetensors' : t === 'BIO_TXT' || t === 'RECIPE_TXT' ? '.txt,.md' : t === 'VOICE_REF' ? '.wav,.mp3' : t === 'PACKAGE_ZIP' ? '.zip' : 'image/*'"
              @change="(e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) requestUploadPolicy(t, f);
                (e.target as HTMLInputElement).value = '';
              }"
            />
          </label>
        </div>
      </div>

      <div class="mt-8 p-4 bg-cream/60 rounded-xl text-sm text-ink/70 leading-relaxed">
        <strong class="text-ink">合规承诺</strong>:上传素材即视为您确认拥有该 AI 形象的完整知识产权,
        并同意承担《作品原创性及自主承担侵权责任承诺书》的法律责任。平台保留因肖像权、版权争议而下架 IP 的权利。
      </div>

      <div class="flex justify-between mt-6">
        <button
          type="button"
          @click="step = 1"
          class="px-6 py-2 text-sm text-ink/60 hover:text-ink"
        >← 返回基础信息</button>
        <button
          type="button"
          @click="step = 3"
          :disabled="!ip || completion < 100"
          class="px-8 py-2.5 bg-ink text-cream rounded-full text-sm font-medium hover:bg-gold transition disabled:opacity-40"
        >下一步:预览提交 →</button>
      </div>
    </section>

    <!-- 步骤 3: 预览提交 -->
    <section v-show="step === 3" class="bg-white rounded-2xl border border-line p-6">
      <h2 class="font-display text-lg mb-4">③ 预览提交</h2>
      <div v-if="!ip" class="p-6 bg-cream/60 rounded-xl text-center text-sm text-ink/60">
        请先完成步骤 ① + ②
      </div>
      <div v-else class="space-y-4">
        <div class="grid grid-cols-2 gap-y-3 text-sm">
          <span class="text-ink/60">IP 名称</span><span class="font-medium">{{ ip.displayName }}</span>
          <span class="text-ink/60">编号</span><span class="font-mono text-xs">{{ ip.code }}</span>
          <span class="text-ink/60">性别 / 年龄</span><span>{{ ip.gender }} / {{ ip.visualAgeBucket }}</span>
          <span class="text-ink/60">风格</span><span>{{ (ip.styleTags || []).join(' · ') || '—' }}</span>
          <span class="text-ink/60">应用场景</span><span>{{ (ip.scenarioTags || []).join(' · ') || '—' }}</span>
          <span class="text-ink/60">意向金</span><span class="font-mono">¥{{ (Number(ip.depositPriceFen) / 100).toFixed(0) }}</span>
          <span class="text-ink/60">正式授权起价</span><span class="font-mono">¥{{ (Number(ip.fullLicensePriceFen) / 100).toFixed(0) }}</span>
          <span class="text-ink/60">资产完整度</span><span :class="completion === 100 ? 'text-success' : 'text-gold'">{{ completion }}%</span>
        </div>
        <div class="p-4 bg-cream/60 rounded-xl">
          <div class="text-xs text-ink/60 mb-2">已上传素材 ({{ files.length }})</div>
          <div class="space-y-1 text-sm">
            <div v-for="f in files" :key="f.id" class="flex justify-between">
              <span>{{ fileTypeLabel[f.assetType] || f.assetType }}</span>
              <span class="text-ink/50 text-xs">{{ f.originalName }}</span>
            </div>
          </div>
        </div>

        <div v-if="ip.status !== 'PENDING_REVIEW'" class="p-4 bg-ink/5 border border-ink/10 rounded-xl text-sm">
          当前状态: <span class="font-medium">{{ statusLabel(ip.status) }}</span>。
          <span v-if="ip.status === 'REJECTED'">如需重新提交,请联系平台管理员。</span>
        </div>

        <div class="flex justify-between mt-6">
          <button
            type="button"
            @click="step = 2"
            class="px-6 py-2 text-sm text-ink/60 hover:text-ink"
          >← 返回资产包</button>
          <button
            v-if="canSubmit"
            type="button"
            @click="submitForReview"
            :disabled="submitting"
            class="px-8 py-2.5 bg-ink text-cream rounded-full text-sm font-medium hover:bg-gold transition disabled:opacity-50"
          >
            {{ submitting ? '提交中...' : '提交审核' }}
          </button>
          <p v-else-if="!step2Done" class="text-sm text-ink/50">资产完整度需达到 100% 才能提交</p>
        </div>
      </div>
    </section>
  </div>
</template>