<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient, ossUrl, formatFen } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import WatermarkOverlay from '@/components/WatermarkOverlay.vue';
import Skeleton from '@/components/Skeleton.vue';
import { useToast } from '@/composables/useToast';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToast();

const code = computed(() => route.params.code as string);
const ip = ref<any>(null);
const files = ref<any[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const watermarkText = computed(() =>
  auth.user?.email ? `ibi.ren · ${auth.user.email} · ${code.value}` : `ibi.ren · ${code.value}`
);

// 4 个核心素材必填, 与 ips.service.validatePackCompleteness 对齐
const requiredAssetTypes = ['THREE_VIEW', 'EXPRESSION_GRID', 'TRANSPARENT_RENDER', 'BIO_TXT'];
const optionalAssetTypes = ['LORA_FILE', 'RECIPE_TXT', 'VOICE_REF', 'PACKAGE_ZIP'];

const filesByType = computed(() => {
  const m: Record<string, any> = {};
  for (const f of files.value) m[f.assetType] = f;
  return m;
});

const presentTypes = computed(() => new Set(files.value.filter((f) => f.validated).map((f) => f.assetType)));
const validatedCount = computed(() => files.value.filter((f) => f.validated).length);
const requiredCount = computed(() => requiredAssetTypes.filter((t) => presentTypes.value.has(t)).length);
const completenessPct = computed(() => Math.round((requiredCount.value / requiredAssetTypes.length) * 100));

const totalSize = computed(() => {
  const total = files.value.reduce((acc, f) => acc + Number(f.sizeBytes || 0), 0);
  if (total < 1024) return `${total} B`;
  if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
  if (total < 1024 * 1024 * 1024) return `${(total / 1024 / 1024).toFixed(1)} MB`;
  return `${(total / 1024 / 1024 / 1024).toFixed(2)} GB`;
});

// 授权阶梯 (从起价分摊 / 加成)
const licenseTiers = computed(() => {
  const base = Number(ip.value?.fullLicensePriceFen || 0);
  return [
    {
      code: 'SINGLE_AD',
      label: '单次广告',
      desc: '一条商业广告片 / 海报 · 12 个月',
      priceFen: Math.round(base * 0.4),
      recommended: false,
      contactOnly: false,
    },
    {
      code: 'SINGLE_DRAMA',
      label: '单部短剧',
      desc: '一部竖屏短剧 (40 集以内) · 18 个月',
      priceFen: base,
      recommended: true,
      contactOnly: false,
    },
    {
      code: 'THREE_YEAR_WEB',
      label: '全网 3 年商用',
      desc: '任意平台不限次数商用 · 含品牌代言',
      priceFen: Math.round(base * 2.5),
      recommended: false,
      contactOnly: false,
    },
    {
      code: 'BUYOUT_EXCLUSIVE',
      label: '终身独家买断',
      desc: '永久独家使用权 · 联系商务面谈',
      priceFen: 0,
      recommended: false,
      contactOnly: true,
    },
  ];
});

const statusTimeline = computed(() => [
  { code: 'CREATED', label: '创作者上传', ts: ip.value?.createdAt },
  { code: 'PUBLIC_INTENT', label: '区块链存证 + 公示', ts: ip.value?.publishedAt },
  { code: 'OFFICIAL_REGISTERED', label: '官方著作权登记', ts: ip.value?.officialAt },
]);

const isOfficial = computed(() => ip.value?.status === 'OFFICIAL_REGISTERED');
const isPublicIntent = computed(() => ip.value?.status === 'PUBLIC_INTENT');

async function fetchDetail() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await apiClient.get(`/ips/${code.value}`);
    ip.value = data.ip;
    files.value = data.files;
  } catch (e: any) {
    error.value = e?.response?.data?.message || '加载失败';
    toast.error(error.value);
  } finally {
    loading.value = false;
  }
}

function checkout(orderType: 'DEPOSIT_INTENT' | 'FULL_LICENSE', scope?: string) {
  if (!auth.isAuthenticated) {
    router.push({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }
  if (!auth.hasAnyRole(['BUYER'])) {
    toast.error('只有采购方账户可以购买');
    return;
  }
  router.push({
    name: 'checkout',
    params: { code: code.value },
    query: { orderType, scope },
  });
}

function formatSize(bytes: string | number): string {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function assetTypeLabel(t: string): string {
  return {
    THREE_VIEW: '三视图',
    EXPRESSION_GRID: '表情矩阵',
    TRANSPARENT_RENDER: '立绘图',
    LORA_FILE: 'LoRA 模型',
    RECIPE_TXT: 'Prompt 说明书',
    TEST_SAMPLE: '测试样板',
    BIO_TXT: '人物小传',
    VOICE_REF: '声音样本',
    LEGAL_PROOF: '原创证明',
    PACKAGE_ZIP: '资产包压缩',
  }[t] || t;
}

function shortHash(h?: string | null, len = 10): string {
  if (!h) return '—';
  return h.length > len ? `${h.slice(0, len)}…` : h;
}

function dateLabel(d?: string | null): string {
  if (!d) return '待完成';
  return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

onMounted(fetchDetail);
</script>

<template>
  <!-- 加载骨架 -->
  <div v-if="loading" class="max-w-6xl mx-auto px-6 py-10">
    <Skeleton shape="block" aspect="16/9" width-class="w-full rounded-3xl" />
    <div class="grid lg:grid-cols-3 gap-8 mt-8">
      <div class="lg:col-span-2 space-y-3">
        <Skeleton shape="line" width="40%" height-class="h-5" />
        <Skeleton shape="line" :lines="3" height-class="h-3" />
      </div>
      <div class="bg-line/30 rounded-2xl h-80" />
    </div>
  </div>

  <div v-else-if="error" class="max-w-2xl mx-auto py-32 text-center">
    <p class="text-danger">{{ error }}</p>
    <RouterLink to="/ips" class="mt-4 inline-block text-sm underline">返回列表</RouterLink>
  </div>

  <div v-else-if="ip" class="max-w-6xl mx-auto px-6 py-10">
    <!-- ========== Hero ========== -->
    <section class="relative aspect-[4/3] md:aspect-[16/9] rounded-3xl overflow-hidden bg-gradient-to-br from-cream to-gold/20 mb-6">
      <img
        v-if="ip.heroVideoKey"
        :src="ossUrl(ip.heroVideoKey)"
        class="w-full h-full object-cover"
        autoplay
        muted
        loop
        playsinline
        controlslist="nodownload nofullscreen noremoteplayback"
        disablepictureinpicture
      />
      <img
        v-else-if="ip.previewImageKeys?.[0]"
        :src="ossUrl(ip.previewImageKeys[0])"
        class="w-full h-full object-cover no-pirate"
        draggable="false"
        @contextmenu.prevent
      />
      <img
        v-else-if="ip.thumbnailKey"
        :src="ossUrl(ip.thumbnailKey)"
        class="w-full h-full object-cover no-pirate"
        draggable="false"
        @contextmenu.prevent
      />
      <WatermarkOverlay :text="watermarkText" density="high" />
      <div class="absolute top-4 left-4 flex gap-2">
        <span class="px-3 py-1 bg-ink/80 text-cream text-xs rounded-full backdrop-blur">
          {{ isOfficial ? '✓ 已登记 · 可全量商用' : '版权办理中 · 已存证' }}
        </span>
        <span v-if="ip.invisibleWatermarkApplied" class="px-3 py-1 bg-ink/60 text-cream text-xs rounded-full backdrop-blur">
          🛡️ 隐水印保护中
        </span>
      </div>
      <div class="absolute bottom-4 left-4 right-4 flex items-end justify-between text-white">
        <div>
          <h1 class="font-display text-4xl md:text-5xl drop-shadow-lg">{{ ip.displayName }}</h1>
          <p v-if="ip.tagline" class="text-sm mt-2 text-white/90 max-w-xl drop-shadow">{{ ip.tagline }}</p>
          <div class="flex gap-2 mt-3 flex-wrap">
            <span v-for="t in (ip.styleTags?.split(',') || []).filter(Boolean)" :key="t" class="px-2 py-0.5 text-[10px] bg-white/20 backdrop-blur rounded-full">{{ t }}</span>
          </div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-xs font-mono text-white/80">{{ ip.code }}</div>
          <div v-if="ip.blockchainHash" class="text-[10px] font-mono text-white/60 mt-1">hash {{ shortHash(ip.blockchainHash, 8) }}</div>
        </div>
      </div>
    </section>

    <!-- ========== 版权状态 + 资产完整度 (双卡) ========== -->
    <section class="mb-6 grid md:grid-cols-3 gap-4">
      <!-- 状态时间线 -->
      <div class="md:col-span-2 p-5 bg-white border border-line rounded-2xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-display text-base">版权登记进度</h3>
          <span :class="[
            'text-xs px-2 py-0.5 rounded-full',
            isOfficial ? 'bg-success/15 text-success' : 'bg-gold/20 text-ink',
          ]">
            {{ isOfficial ? '已登记' : '公示中' }}
          </span>
        </div>
        <ol class="flex items-start justify-between relative gap-2">
          <li
            v-for="(s, idx) in statusTimeline"
            :key="s.code"
            class="flex-1 flex flex-col items-center text-center min-w-0"
          >
            <div :class="[
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono mb-2',
              s.ts ? 'bg-success text-white' : 'bg-line text-ink/40',
            ]">
              {{ s.ts ? '✓' : idx + 1 }}
            </div>
            <div :class="['text-xs leading-tight', s.ts ? 'text-ink font-medium' : 'text-ink/40']">{{ s.label }}</div>
            <div class="text-[10px] text-ink/40 mt-0.5">{{ dateLabel(s.ts) }}</div>
          </li>
        </ol>
        <div v-if="ip.blockchainTxId" class="mt-4 pt-4 border-t border-line text-xs text-ink/60 flex items-center gap-3 flex-wrap">
          <span>📜 区块链存证</span>
          <code class="font-mono text-ink/80">{{ shortHash(ip.blockchainTxId, 16) }}</code>
          <span v-if="ip.proofTimestamp" class="text-ink/40">{{ dateLabel(ip.proofTimestamp) }}</span>
        </div>
      </div>

      <!-- 资产完整度 -->
      <div class="p-5 bg-white border border-line rounded-2xl flex flex-col">
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-display text-base">资产完整度</h3>
          <span :class="[
            'text-xs px-2 py-0.5 rounded-full font-mono',
            completenessPct === 100 ? 'bg-success/15 text-success' : 'bg-gold/20 text-ink',
          ]">{{ completenessPct }}%</span>
        </div>
        <div class="flex items-center gap-3 mt-2">
          <div class="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#eee" stroke-width="3" />
              <circle
                cx="18" cy="18" r="15.9"
                fill="none"
                :stroke="completenessPct === 100 ? '#22c55e' : '#c9a55a'"
                stroke-width="3"
                stroke-linecap="round"
                :stroke-dasharray="`${completenessPct} ${100 - completenessPct}`"
              />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center text-xs font-mono">{{ requiredCount }}/{{ requiredAssetTypes.length }}</div>
          </div>
          <div class="text-xs text-ink/60 leading-relaxed">
            必填素材已上传 <span class="font-mono text-ink">{{ requiredCount }}</span> / {{ requiredAssetTypes.length }} 项
            <span v-if="completenessPct === 100" class="block text-success mt-0.5">✓ 交付无忧</span>
            <span v-else class="block text-gold mt-0.5">建议补齐</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 30 天空窗期提示 -->
    <div
      v-if="isPublicIntent"
      class="mb-6 p-4 bg-gold/15 border border-gold/40 rounded-2xl text-sm flex items-start gap-3"
    >
      <span class="text-lg">⚠️</span>
      <div>
        <div class="font-medium mb-1">版权正在权威机构登记中 · 通常 5–30 个工作日</div>
        <div class="text-ink/70">
          平台已通过区块链时间戳锁定关键元数据 ({{ shortHash(ip.blockchainHash, 12) }})。
          在版权下发前支付意向金即锁定排他期,期间若发生第三方主张权利纠纷,平台承诺全额退款或免费更换等值 IP。
        </div>
      </div>
    </div>

    <!-- ========== 资产清单 + 定价阶梯 ========== -->
    <section class="grid lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2">
        <div class="flex items-baseline justify-between mb-4">
          <h2 class="font-display text-xl">资产包清单</h2>
          <span class="text-xs text-ink/50">{{ validatedCount }} 个文件 · 总大小 {{ totalSize }}</span>
        </div>
        <div class="space-y-2">
          <div
            v-for="t in [...requiredAssetTypes, ...optionalAssetTypes]"
            :key="t"
            :class="[
              'flex items-center justify-between p-4 bg-white border rounded-xl',
              presentTypes.has(t) ? 'border-line' : 'border-dashed border-line opacity-60',
            ]"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div :class="[
                'w-10 h-10 rounded-lg flex items-center justify-center text-xs font-mono shrink-0',
                presentTypes.has(t) ? 'bg-success/15 text-success' : 'bg-cream text-ink/40',
              ]">
                {{ presentTypes.has(t) ? '✓' : t.slice(0, 3) }}
              </div>
              <div class="min-w-0">
                <div class="text-sm font-medium">
                  {{ assetTypeLabel(t) }}
                  <span v-if="requiredAssetTypes.includes(t)" class="text-[10px] text-danger ml-1">必填</span>
                  <span v-else class="text-[10px] text-ink/40 ml-1">选填</span>
                </div>
                <div v-if="filesByType[t]" class="text-xs text-ink/50 mt-0.5 truncate">
                  {{ filesByType[t].displayName }} · {{ formatSize(filesByType[t].sizeBytes) }}
                </div>
                <div v-else class="text-xs text-ink/40 mt-0.5">尚未上传</div>
              </div>
            </div>
            <div class="flex items-center gap-2 text-xs text-ink/40 shrink-0">
              <span>🔒</span>
              <span>购买后解锁</span>
            </div>
          </div>
        </div>

        <!-- AI 生成溯源 -->
        <div v-if="ip.blockchainHash" class="mt-6 p-4 bg-cream/60 rounded-2xl text-sm">
          <div class="font-medium mb-2 flex items-center gap-2">
            <span>🧬</span>
            <span>AI 生成溯源</span>
          </div>
          <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
            <span class="text-ink/60">存证网络</span>
            <span class="font-mono">{{ ip.blockchainNetwork || 'mock-chain-v1' }}</span>
            <span class="text-ink/60">Payload Hash</span>
            <span class="font-mono break-all">{{ ip.blockchainHash }}</span>
            <span class="text-ink/60">交易 ID</span>
            <span class="font-mono break-all">{{ ip.blockchainTxId }}</span>
            <template v-if="ip.proofTimestamp">
              <span class="text-ink/60">存证时间</span>
              <span class="font-mono">{{ new Date(ip.proofTimestamp).toLocaleString('zh-CN') }}</span>
            </template>
          </div>
          <div class="mt-2 pt-2 border-t border-line/50 text-[11px] text-ink/50">
            该 IP 所有素材的 SHA-256 校验和按字典序排序后计算哈希值, 任何后续修改都将与链上记录不一致。
          </div>
        </div>

        <div class="mt-6 p-4 bg-cream/60 rounded-2xl text-sm text-ink/70 leading-relaxed">
          <strong class="text-ink">交付说明</strong>:
          完整资产包 = 视觉矩阵 (三视图 + 表情 + 透明 PNG) + AI 核心 (LoRA + Prompt 说明书) +
          身份小传 (bio + 可选声音样本) + 合规文件。购买后通过 OSS 临时签名链下载,单次链接 5 分钟有效。
        </div>
      </div>

      <!-- ========== 定价阶梯 (sticky) ========== -->
      <aside class="lg:sticky lg:top-20 self-start space-y-4">
        <!-- 意向金 (测试期) -->
        <div class="p-6 bg-ink text-cream rounded-2xl">
          <div class="text-xs text-cream/60 mb-1">测试期意向金</div>
          <div class="font-display text-4xl text-gold mb-1">{{ formatFen(ip.depositPriceFen) }}</div>
          <div class="text-xs text-cream/60 mb-4">7 天测试使用权 · 带水印 · 不可商用</div>
          <button
            @click="checkout('DEPOSIT_INTENT')"
            class="w-full py-3 bg-gold text-ink rounded-full font-medium hover:bg-cream transition"
          >支付意向金</button>
        </div>

        <!-- 阶梯授权 -->
        <div class="p-5 bg-white border border-line rounded-2xl">
          <div class="text-xs text-ink/60 mb-3 font-medium">正式授权阶梯</div>
          <div class="space-y-2">
            <button
              v-for="tier in licenseTiers"
              :key="tier.code"
              @click="tier.contactOnly ? null : checkout('FULL_LICENSE', tier.code)"
              :disabled="tier.contactOnly"
              :class="[
                'w-full p-3 rounded-xl border text-left transition flex items-center justify-between gap-3',
                tier.recommended
                  ? 'border-gold bg-gold/10 hover:bg-gold/20'
                  : 'border-line hover:border-gold hover:bg-cream/40',
                tier.contactOnly && 'opacity-70 cursor-not-allowed hover:border-line hover:bg-white',
              ]"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">{{ tier.label }}</span>
                  <span v-if="tier.recommended" class="text-[10px] px-1.5 py-0.5 bg-gold text-ink rounded-full">推荐</span>
                </div>
                <div class="text-[11px] text-ink/50 mt-0.5 truncate">{{ tier.desc }}</div>
              </div>
              <div class="text-right shrink-0">
                <div v-if="tier.contactOnly" class="text-xs text-ink/60">联系商务</div>
                <div v-else class="text-sm font-mono">{{ formatFen(tier.priceFen) }}</div>
              </div>
            </button>
          </div>
          <p class="text-[11px] text-ink/40 mt-3 leading-relaxed">
            所有正式授权均含电子签授权书 + 完整资产包下载。<br>
            阶梯价基于创作者设定起价,具体可在商务洽谈阶段调整。
          </p>
        </div>
      </aside>
    </section>
  </div>
</template>