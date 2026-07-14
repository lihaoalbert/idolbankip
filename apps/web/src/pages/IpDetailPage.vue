<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient, ossUrl, formatFen } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useHonor } from '@/composables/useHonor';
import WatermarkOverlay from '@/components/WatermarkOverlay.vue';
import Skeleton from '@/components/Skeleton.vue';
import { useToast } from '@/composables/useToast';
import HonorChip from '@/components/HonorChip.vue';
import type { HonorLevelInfo } from '@/api/client';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToast();
const honor = useHonor();

const code = computed(() => route.params.code as string);
const ip = ref<any>(null);
const files = ref<any[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const watermarkText = computed(() =>
  auth.user?.email ? `IBIren · ${auth.user.email} · ${code.value}` : `IBIren · ${code.value}`
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
  { code: 'CREATED', label: '捏者上传', ts: ip.value?.createdAt },
  { code: 'PUBLIC_INTENT', label: '区块链存证 + 公示', ts: ip.value?.publishedAt },
  { code: 'OFFICIAL_REGISTERED', label: '官方著作权登记', ts: ip.value?.officialAt },
]);

const isOfficial = computed(() => ip.value?.status === 'OFFICIAL_REGISTERED');
const isPublicIntent = computed(() => ip.value?.status === 'PUBLIC_INTENT');

// 鉴定章节编号
const chapters = computed(() => [
  { no: '01', code: 'PROVENANCE', label: '鉴定与版权', anchor: 'provenance' },
  { no: '02', code: 'CATALOGUE', label: '资产包清单', anchor: 'catalogue' },
  { no: '03', code: 'PRICING', label: '授权阶梯', anchor: 'pricing' },
]);

async function fetchDetail() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await apiClient.get(`/ips/${code.value}`);
    ip.value = data.ip;
    creator.value = data.creator;
    files.value = data.files;
    // #30.6.20 — 作者公开页加载其荣誉面板 (等级 + 称号 chip)
    if (creator.value?.id) {
      const profile = await honor.loadProfile(creator.value.id);
      creatorHonorLevel.value = profile?.honor?.level ?? null;
    }
  } catch (e: any) {
    const msg = e?.response?.data?.message || '加载失败';
    error.value = msg;
    toast.error(msg);
  } finally {
    loading.value = false;
  }
}

const creator = ref<{ id: string; displayName: string; avatarUrl?: string | null; bio?: string | null } | null>(null);
const creatorHonorLevel = ref<HonorLevelInfo | null>(null);

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

// ============ #30.6.26 著作权代申请 ============
const isCreator = computed(() => auth.user?.id && creator.value?.id && auth.user.id === creator.value.id);
const copyrightReg = ref<any>(null);
const feeConfig = ref<{ national: number; provincial: Record<string, number> } | null>(null);
const copyrightLoading = ref(false);
const copyrightError = ref<string | null>(null);
const showApplyModal = ref(false);
const draftForm = ref({
  ownerName: '',
  ownerType: 'INDIVIDUAL' as 'INDIVIDUAL' | 'COMPANY',
  ownerIdNumber: '',
  registrationType: 'NATIONAL' as 'NATIONAL' | 'PROVINCIAL',
  registrationRegion: '',
});
const submittingCopyright = ref(false);

async function loadCopyright() {
  if (!isCreator.value || !ip.value) {
    copyrightReg.value = null;
    return;
  }
  copyrightLoading.value = true;
  copyrightError.value = null;
  try {
    const { data } = await apiClient.get(`/ips/${ip.value.id}/copyright-reg`);
    copyrightReg.value = data.registration;
  } catch (e: any) {
    // 404 视为无登记 — 不报错
    if (e?.response?.status !== 404) {
      copyrightError.value = e?.response?.data?.message || '加载失败';
    }
    copyrightReg.value = null;
  } finally {
    copyrightLoading.value = false;
  }
}

async function loadFeeConfig() {
  try {
    const { data } = await apiClient.get('/copyright-fee-config');
    feeConfig.value = data;
  } catch {
    feeConfig.value = { national: 65000, provincial: {} };
  }
}

const selectedFeeFen = computed(() => {
  if (!feeConfig.value) return 0;
  if (draftForm.value.registrationType === 'NATIONAL') return feeConfig.value.national;
  return feeConfig.value.provincial[draftForm.value.registrationRegion] ?? 10000;
});

function startApply() {
  draftForm.value = {
    ownerName: auth.user?.displayName || '',
    ownerType: 'INDIVIDUAL',
    ownerIdNumber: '',
    registrationType: 'NATIONAL',
    registrationRegion: '',
  };
  showApplyModal.value = true;
}

async function saveDraft() {
  if (!ip.value) return;
  submittingCopyright.value = true;
  copyrightError.value = null;
  try {
    await apiClient.post(`/ips/${ip.value.id}/copyright-reg/draft`, draftForm.value);
    showApplyModal.value = false;
    toast.success('草稿已保存');
    await loadCopyright();
  } catch (e: any) {
    copyrightError.value = e?.response?.data?.message || '保存失败';
  } finally {
    submittingCopyright.value = false;
  }
}

async function submitCopyright() {
  if (!ip.value) return;
  if (!confirm('提交后将进入审核流程,确定提交?')) return;
  submittingCopyright.value = true;
  try {
    await apiClient.post(`/ips/${ip.value.id}/copyright-reg/submit`);
    showApplyModal.value = false;
    toast.success('已提交,平台将在 3 个工作日内向版权局递交');
    await loadCopyright();
  } catch (e: any) {
    copyrightError.value = e?.response?.data?.message || '提交失败';
  } finally {
    submittingCopyright.value = false;
  }
}

async function withdrawCopyright() {
  if (!ip.value) return;
  if (!confirm('确定撤回申请?')) return;
  submittingCopyright.value = true;
  try {
    await apiClient.post(`/ips/${ip.value.id}/copyright-reg/withdraw`);
    toast.success('已撤回');
    await loadCopyright();
  } catch (e: any) {
    copyrightError.value = e?.response?.data?.message || '撤回失败';
  } finally {
    submittingCopyright.value = false;
  }
}

const downloadingPdf = ref(false);
async function downloadCopyrightPdf() {
  if (!ip.value) return;
  downloadingPdf.value = true;
  try {
    const { data } = await apiClient.get(`/ips/${ip.value.id}/copyright-reg/pdf`);
    // 浏览器打开签名 URL 直接下载
    const a = document.createElement('a');
    a.href = data.url;
    a.download = `${ip.value.code}-著作权申请包.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(data.cached ? '已下载(命中缓存)' : 'PDF 已生成');
  } catch (e: any) {
    copyrightError.value = e?.response?.data?.message || 'PDF 生成失败';
  } finally {
    downloadingPdf.value = false;
  }
}

const copyrightStageLabel = computed(() => {
  const stage = copyrightReg.value?.workflowStage;
  return {
    DRAFT: '草稿',
    SUBMITTED: '已提交,等待平台递交',
    ACCEPTED: '版权局已受理',
    UNDER_REVIEW: '审查中',
    CERTIFIED: '✓ 已登记',
    REJECTED: '已驳回',
    WITHDRAWN: '已撤回',
  }[stage as string] || '未申请';
});

const copyrightStageColor = computed(() => {
  const stage = copyrightReg.value?.workflowStage;
  return {
    DRAFT: 'border-r12-cobalt text-r12-cobalt bg-r12-cobalt-soft',
    SUBMITTED: 'border-r12-cobalt text-r12-cobalt bg-r12-cobalt-soft',
    ACCEPTED: 'border-blue-500 text-blue-700 bg-blue-50',
    UNDER_REVIEW: 'border-blue-500 text-blue-700 bg-blue-50',
    CERTIFIED: 'border-r12-success text-r12-success bg-r12-success-soft',
    REJECTED: 'border-r12-danger text-r12-danger bg-r12-danger-soft',
    WITHDRAWN: 'border-r12-line-strong text-r12-ink-secondary bg-r12-ink-primary/5',
  }[stage as string] || 'border-r12-line text-r12-ink-secondary bg-line/5';
});

const copyrightStageStep = computed(() => {
  const stage = copyrightReg.value?.workflowStage;
  return {
    DRAFT: 0, SUBMITTED: 1, ACCEPTED: 2, UNDER_REVIEW: 2, CERTIFIED: 3, REJECTED: 3, WITHDRAWN: 3,
  }[stage as string] ?? -1;
});

onMounted(async () => {
  await fetchDetail();
  await loadCopyright();
  await loadFeeConfig();
});
</script>

<template>
  <!-- ============================================================
       加载骨架
       ============================================================ -->
  <div v-if="loading" class="max-w-[1320px] mx-auto px-6 lg:px-10 py-10">
    <Skeleton shape="block" aspect="16/9" width-class="w-full" />
    <div class="grid lg:grid-cols-3 gap-8 mt-8">
      <div class="lg:col-span-2 space-y-3">
        <Skeleton shape="line" width="40%" height-class="h-5" />
        <Skeleton shape="line" :lines="3" height-class="h-3" />
      </div>
      <div class="bg-r12-surface h-80" />
    </div>
  </div>

  <!-- ============================================================
       错误态
       ============================================================ -->
  <div v-else-if="error" class="max-w-2xl mx-auto py-32 text-center">
    <div class="catalog-no text-r12-danger mb-4">ERROR · {{ error }}</div>
    <p class="font-display-italic text-2xl text-r12-ink-secondary mb-4">— Plate not found —</p>
    <RouterLink to="/ips" class="catalog-no text-r12-ink-secondary hover:text-r12-cobalt underline underline-offset-4">RETURN TO CATALOGUE</RouterLink>
  </div>

  <div v-else-if="ip" class="bg-r12-canvas">

    <!-- 返回形象库 (成功态顶部固定小条) -->
    <div class="sticky top-16 z-30 bg-r12-canvas/95 backdrop-blur hairline-b border-r12-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-3">
        <RouterLink to="/ips" class="catalog-no text-r12-ink-secondary hover:text-r12-cobalt transition inline-flex items-center gap-2">
          <span>←</span><span>RETURN TO CATALOGUE</span>
        </RouterLink>
      </div>
    </div>

    <!-- ============================================================
         HERO · 美术馆大特写
         ============================================================ -->
    <section class="relative">
      <div class="relative aspect-[4/3] md:aspect-[16/9] lg:aspect-[21/9] bg-r12-ink-primary overflow-hidden">
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

        <!-- 左上 · plate 编号 -->
        <div class="absolute top-6 left-6 md:top-10 md:left-10 z-10 text-white">
          <div class="catalog-no text-white/50 mb-2">PLATE № {{ ip.code }}</div>
          <div class="flex flex-wrap gap-2">
            <span :class="isOfficial ? 'bg-r12-success' : 'bg-r12-warning'" class="px-3 py-1 text-r12-ink-primary text-[10px] font-r12-mono tracking-widest rounded-sm">
              {{ isOfficial ? '✓ OFFICIAL · REGISTERED' : '⏳ IN PROCESS · NOTARISED' }}
            </span>
            <span v-if="ip.invisibleWatermarkApplied" class="px-3 py-1 bg-r12-ink-primary/70 text-white text-[10px] font-r12-mono tracking-widest rounded-sm backdrop-blur">
              🛡️ DWT-SVD
            </span>
          </div>
        </div>

        <!-- 右下 · 创作者署名 + honor -->
        <div v-if="creator" class="absolute bottom-6 right-6 md:bottom-10 md:right-10 z-10">
          <RouterLink :to="`/u/${creator.id}`" class="block group text-right">
            <div class="catalog-no text-white/50 mb-1">CURATED BY</div>
            <div class="flex items-center justify-end gap-2">
              <HonorChip v-if="creatorHonorLevel" :level="creatorHonorLevel" variant="chip" />
              <span class="font-r12-sans text-r12-h2 font-semibold text-white group-hover:text-r12-cobalt transition">
                {{ creator.displayName }}
              </span>
            </div>
          </RouterLink>
        </div>
      </div>

      <!-- 大标题 · 在图片下方, 大字 swash -->
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 pt-10 md:pt-14 pb-6">
        <div class="grid grid-cols-12 gap-4 mb-6">
          <div class="col-span-3 catalog-no text-r12-ink-tertiary">№ {{ ip.code }}</div>
          <div class="col-span-3 col-start-5 catalog-no text-r12-ink-tertiary">CAT. NF-{{ ip.code }}</div>
          <div class="col-span-3 col-start-9 catalog-no text-r12-ink-tertiary hidden md:block">1 / 1 EDITION</div>
        </div>

        <h1 class="text-r12-display font-semibold tracking-tight leading-none text-r12-ink-primary">
          {{ ip.displayName }}
        </h1>

        <div v-if="ip.tagline" class="mt-6 grid md:grid-cols-12 gap-6">
          <p class="md:col-span-7 font-r12-sans text-lg italic font-medium text-r12-ink-secondary leading-snug">
            — {{ ip.tagline }}
          </p>
          <div class="md:col-span-4 md:col-start-9 flex flex-wrap gap-2 items-start">
            <span
              v-for="t in (ip.styleTags?.split(',') || []).filter(Boolean)"
              :key="t"
              class="px-3 py-1 catalog-no text-r12-ink-secondary bg-r12-surface border-0.5 border-r12-line hover:border-r12-cobalt transition"
            >{{ t }}</span>
          </div>
        </div>
      </div>

      <!-- Hairline rule -->
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10">
        <div class="border-t-0.5 border-r12-line" />
      </div>
    </section>

    <!-- ============================================================
         CHAPTER INDEX · 章节目录 (固定可滚动)
         ============================================================ -->
    <section class="max-w-[1320px] mx-auto px-6 lg:px-10 py-8 sticky top-0 bg-r12-canvas/95 backdrop-blur z-20 border-b-0.5 border-r12-line">
      <div class="flex items-center justify-between gap-6 overflow-x-auto">
        <ol class="flex items-center gap-8">
          <li v-for="ch in chapters" :key="ch.no">
            <a :href="`#${ch.anchor}`" class="archive-tab flex items-center gap-2 whitespace-nowrap">
              <span class="text-r12-cobalt">— {{ ch.no }} —</span>
              <span>{{ ch.label }}</span>
            </a>
          </li>
        </ol>
        <div class="catalog-no text-r12-ink-tertiary whitespace-nowrap hidden md:block">
          PLATE · {{ ip.code }}
        </div>
      </div>
    </section>

    <!-- ============================================================
         主体 · 12 列网格 (鉴定 / 资产 / 定价)
         ============================================================ -->
    <section class="max-w-[1320px] mx-auto px-6 lg:px-10 py-14 md:py-20">

      <!-- ============ 01 · 鉴定与版权 ============ -->
      <article id="provenance" class="mb-20 md:mb-28 scroll-mt-24">
        <header class="grid md:grid-cols-12 gap-4 mb-10 md:mb-14 items-end">
          <div class="md:col-span-1 catalog-no text-r12-cobalt">— 01 —</div>
          <h2 class="md:col-span-6 text-r12-h1 font-semibold tracking-tight leading-tight text-r12-ink-primary leading-[0.95]">
            鉴定<span class="font-display-italic text-r12-cobalt">与版权</span>
          </h2>
          <div class="md:col-span-4 md:col-start-9 text-r12-ink-secondary leading-relaxed text-sm text-right">
            <div class="catalog-no text-r12-ink-tertiary mb-1">PROVENANCE</div>
            每一道关卡均留痕, 可随时回溯。
          </div>
        </header>

        <!-- 鉴定证书卡片 -->
        <div class="grid md:grid-cols-3 gap-px bg-line hairline border-r12-line">

          <!-- 时间线 (2 列宽) -->
          <div class="md:col-span-2 bg-r12-surface p-8 md:p-10">
            <div class="flex items-baseline justify-between mb-8">
              <h3 class="catalog-no text-r12-ink-secondary">CERTIFICATE OF REGISTRATION</h3>
              <span :class="[
                'text-[10px] px-3 py-1 font-r12-mono tracking-widest uppercase border-0.5',
                isOfficial ? 'border-r12-success text-r12-success bg-r12-success-soft' : 'border-r12-cobalt text-r12-cobalt bg-r12-cobalt-soft',
              ]">
                {{ isOfficial ? '✓ REGISTERED' : '⏳ IN PROCESS' }}
              </span>
            </div>

            <ol class="relative">
              <li
                v-for="(s, idx) in statusTimeline"
                :key="s.code"
                class="relative pl-12 pb-10 last:pb-0 border-l-0.5 hairline-l"
                :class="s.ts ? 'border-r12-success' : 'border-r12-line'"
              >
                <!-- 节点 -->
                <div :class="[
                  'absolute left-0 top-0 -translate-x-1/2 w-9 h-9 rounded-full flex items-center justify-center font-r12-mono text-xs border-0.5',
                  s.ts ? 'bg-r12-success border-r12-success text-white' : 'bg-r12-canvas border-r12-line text-r12-ink-tertiary',
                ]">
                  {{ s.ts ? '✓' : String(idx + 1).padStart(2, '0') }}
                </div>

                <div class="flex items-baseline justify-between gap-4 mb-1">
                  <h4 class="text-r12-h3 font-medium text-r12-ink-primary">{{ s.label }}</h4>
                  <span class="catalog-no text-r12-ink-tertiary shrink-0">{{ dateLabel(s.ts) }}</span>
                </div>
                <p class="text-xs text-r12-ink-secondary font-r12-mono">
                  {{ s.ts ? `On-chain confirmed at ${new Date(s.ts).toISOString().slice(0, 19).replace('T', ' ')} UTC` : 'Pending verification' }}
                </p>
              </li>
            </ol>

            <!-- 区块链存证 -->
            <div v-if="ip.blockchainTxId" class="mt-8 pt-6 hairline-t border-r12-line/60">
              <div class="catalog-no text-r12-cobalt mb-3">— BLOCKCHAIN NOTARISATION —</div>
              <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                <span class="text-r12-ink-secondary catalog-no">NETWORK</span>
                <span class="font-r12-mono text-r12-ink-primary">{{ ip.blockchainNetwork || 'mock-chain-v1' }}</span>
                <span class="text-r12-ink-secondary catalog-no">TX ID</span>
                <span class="font-r12-mono text-r12-ink-primary break-all">{{ ip.blockchainTxId }}</span>
                <span class="text-r12-ink-secondary catalog-no">PAYLOAD</span>
                <span class="font-r12-mono text-r12-ink-primary break-all text-[11px]">{{ ip.blockchainHash }}</span>
                <template v-if="ip.proofTimestamp">
                  <span class="text-r12-ink-secondary catalog-no">TIMESTAMP</span>
                  <span class="font-r12-mono text-r12-ink-primary">{{ new Date(ip.proofTimestamp).toLocaleString('zh-CN') }}</span>
                </template>
              </div>
            </div>
          </div>

          <!-- 资产完整度 (1 列宽) -->
          <div class="bg-r12-surface p-8 md:p-10 flex flex-col">
            <div class="catalog-no text-r12-ink-secondary mb-2">PACK COMPLETENESS</div>
            <div class="flex items-baseline justify-between mb-6">
              <h3 class="font-r12-sans text-r12-h2 font-semibold text-r12-ink-primary">完整度</h3>
              <span :class="[
                'font-r12-mono text-xs px-2 py-1 border-0.5',
                completenessPct === 100 ? 'border-r12-success text-r12-success' : 'border-r12-cobalt text-r12-cobalt',
              ]">{{ completenessPct }}%</span>
            </div>

            <!-- 圆形进度 -->
            <div class="relative w-32 h-32 mx-auto my-4">
              <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-line)" stroke-width="1.5" />
                <circle
                  cx="18" cy="18" r="15.9"
                  fill="none"
                  :stroke="completenessPct === 100 ? '#3D8B5F' : '#B6925A'"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  :stroke-dasharray="`${completenessPct} ${100 - completenessPct}`"
                />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <div class="font-r12-sans text-r12-h1 font-semibold tabular-nums text-r12-ink-primary">{{ requiredCount }}</div>
                <div class="catalog-no text-r12-ink-tertiary">OF {{ requiredAssetTypes.length }}</div>
              </div>
            </div>

            <p class="text-xs text-r12-ink-secondary leading-relaxed text-center mt-4">
              必填素材已上传
              <span class="font-r12-sans text-r12-body font-medium text-r12-ink-primary">{{ requiredCount }}</span>
              / {{ requiredAssetTypes.length }} 项
              <span v-if="completenessPct === 100" class="block text-r12-success mt-2 font-display-italic">— Ready to ship —</span>
              <span v-else class="block text-r12-cobalt mt-2 font-display-italic">— Suggest completing —</span>
            </p>
          </div>
        </div>

        <!-- 30 天空窗期提示 -->
        <div
          v-if="isPublicIntent"
          class="mt-6 p-6 bg-r12-cobalt/[0.08] border-l-2 border-r12-cobalt flex items-start gap-4"
        >
          <span class="font-r12-mono text-r12-h1 font-semibold tabular-nums text-r12-cobalt leading-none">§</span>
          <div>
            <div class="font-r12-sans text-r12-body font-medium text-r12-ink-primary mb-1">版权正在权威机构登记中 · 通常 5–30 个工作日</div>
            <div class="text-sm text-r12-ink-secondary leading-relaxed">
              平台已通过区块链时间戳锁定关键元数据
              <code class="font-r12-mono text-xs text-r12-ink-primary">{{ shortHash(ip.blockchainHash, 14) }}</code>。
              在版权下发前支付意向金即锁定排他期, 期间若发生第三方主张权利纠纷, 平台承诺全额退款或免费更换等值 IP。
            </div>
          </div>
        </div>

        <!-- #30.6.26 著作权代申请卡片 — 仅创作者本人可见 -->
        <div
          v-if="isCreator && !isOfficial"
          id="copyright"
          class="mt-8 p-6 md:p-8 hairline border-r12-line-strong bg-r12-surface"
        >
          <div class="flex items-start justify-between gap-4 mb-4">
            <div>
              <div class="catalog-no text-r12-cobalt mb-1">— APPENDIX · B —</div>
              <h3 class="text-r12-h2 font-semibold text-r12-ink-primary leading-tight">
                官方<span class="font-display-italic text-r12-cobalt">著作权</span>登记
              </h3>
              <p class="text-xs text-r12-ink-secondary leading-relaxed mt-2 max-w-xl">
                平台代为向版权局递交作品登记申请,登记证书载明著作权人为创作者本人。包含完整 PDF 申请包(人脸特写 + 三视图 + 表情矩阵 + 立绘图)。
              </p>
            </div>
            <div class="flex flex-col gap-2 items-end shrink-0">
              <div v-if="copyrightReg" :class="['px-3 py-1 border text-xs font-r12-mono tracking-wider', copyrightStageColor]">
                {{ copyrightStageLabel }}
              </div>
              <!-- #30.6.26 任何状态下都能下载 PDF -->
              <button
                type="button"
                class="px-3 py-1.5 border border-r12-line-strong text-xs font-r12-mono text-r12-ink-primary hover:border-r12-cobalt hover:text-r12-cobalt transition disabled:opacity-50"
                :disabled="downloadingPdf"
                @click="downloadCopyrightPdf"
                title="下载 PDF 著作权申请包(4 页)"
              >
                {{ downloadingPdf ? '生成中…' : '📄 下载 PDF 申请包' }}
              </button>
            </div>
          </div>

          <!-- 状态:无申请 — 显示申请按钮 -->
          <div v-if="!copyrightReg && !copyrightLoading" class="mt-4 p-5 bg-r12-cobalt-soft border-l-2 border-r12-cobalt">
            <div class="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div class="text-sm text-r12-ink-primary/80 leading-relaxed">
                  <span class="font-medium text-r12-ink-primary">国家级 ¥{{ (feeConfig?.national || 65000) / 100 }}</span>
                  <span class="mx-2 text-r12-ink-tertiary">·</span>
                  <span>地方级 ¥{{ feeConfig?.provincial ? Math.min(...Object.values(feeConfig.provincial)) / 100 : 60 }}-{{ feeConfig?.provincial ? Math.max(...Object.values(feeConfig.provincial)) / 100 : 300 }}/省份</span>
                </div>
                <p class="text-xs text-r12-ink-secondary mt-1">含平台代办费 + 版权局规费 · 7-30 个工作日</p>
              </div>
              <button
                type="button"
                class="px-5 py-2.5 bg-r12-cobalt text-white font-r12-sans text-r12-caption font-medium tracking-wider hover:bg-r12-cobalt-hover transition disabled:opacity-50"
                :disabled="submittingCopyright"
                @click="startApply"
              >
                申请著作权 →
              </button>
            </div>
          </div>

          <!-- 状态:DRAFT — 显示当前草稿信息 + 操作 -->
          <div v-else-if="copyrightReg?.workflowStage === 'DRAFT'" class="mt-4 space-y-3">
            <div class="p-4 bg-r12-cobalt-soft border border-r12-cobalt/30 text-sm">
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div><span class="text-r12-ink-secondary">著作权人</span> · <span class="text-r12-ink-primary">{{ copyrightReg.ownerName }} ({{ copyrightReg.ownerType === 'INDIVIDUAL' ? '个人' : '企业' }})</span></div>
                <div><span class="text-r12-ink-secondary">备案级别</span> · <span class="text-r12-ink-primary">{{ copyrightReg.registrationType === 'NATIONAL' ? '国家级' : `地方级 · ${copyrightReg.registrationRegion}` }}</span></div>
              </div>
              <p class="text-xs text-r12-ink-secondary mt-2">草稿尚未提交 · 修改后会覆盖原信息</p>
            </div>
            <div class="flex gap-3">
              <button
                type="button"
                class="px-4 py-2 border border-r12-line-strong text-r12-ink-primary font-r12-mono text-xs hover:border-r12-cobalt transition disabled:opacity-50"
                :disabled="submittingCopyright"
                @click="startApply"
              >编辑草稿</button>
              <button
                type="button"
                class="px-4 py-2 bg-r12-cobalt text-white font-r12-sans text-r12-caption font-medium hover:bg-r12-cobalt-hover transition disabled:opacity-50"
                :disabled="submittingCopyright"
                @click="submitCopyright"
              >提交申请</button>
            </div>
          </div>

          <!-- 状态:SUBMITTED / ACCEPTED / UNDER_REVIEW — 展示进度 -->
          <div v-else-if="['SUBMITTED','ACCEPTED','UNDER_REVIEW'].includes(copyrightReg?.workflowStage)" class="mt-4 space-y-4">
            <!-- 进度条 0-1-2-3 -->
            <div class="flex items-center gap-2">
              <template v-for="(s, idx) in ['DRAFT','已递交','受理','登记']" :key="s">
                <div class="flex flex-col items-center gap-1">
                  <div :class="['w-7 h-7 rounded-full border-2 flex items-center justify-center font-r12-mono text-xs',
                    idx <= copyrightStageStep ? 'border-r12-cobalt bg-r12-cobalt text-r12-ink-primary' : 'border-r12-line text-r12-ink-tertiary bg-r12-surface']">
                    {{ idx < copyrightStageStep ? '✓' : idx + 1 }}
                  </div>
                  <span class="text-[10px] text-r12-ink-secondary font-r12-mono">{{ s }}</span>
                </div>
                <div v-if="idx < 3" :class="['flex-1 h-px', idx < copyrightStageStep ? 'bg-r12-cobalt' : 'bg-line/40']"></div>
              </template>
            </div>

            <div class="p-4 bg-r12-cobalt-soft border border-r12-cobalt/30 text-sm space-y-1">
              <div class="flex justify-between">
                <span class="text-r12-ink-secondary">代办费 (申请时已快照)</span>
                <span class="font-r12-mono text-r12-ink-primary">¥{{ (copyrightReg.creatorAgentFeeFen / 100).toFixed(2) }}</span>
              </div>
              <div v-if="copyrightReg.registrationType === 'PROVINCIAL'" class="flex justify-between">
                <span class="text-r12-ink-secondary">备案省份</span>
                <span class="text-r12-ink-primary">{{ copyrightReg.registrationRegion }}</span>
              </div>
              <div v-if="copyrightReg.submittedAt" class="flex justify-between">
                <span class="text-r12-ink-secondary">提交时间</span>
                <span class="font-r12-mono text-r12-ink-primary/80">{{ dateLabel(copyrightReg.submittedAt) }}</span>
              </div>
              <div v-if="copyrightReg.applicationNo" class="flex justify-between">
                <span class="text-r12-ink-secondary">受理号</span>
                <span class="font-r12-mono text-r12-ink-primary">{{ copyrightReg.applicationNo }}</span>
              </div>
              <p class="text-xs text-r12-ink-secondary pt-2">平台将在 3 个工作日内向版权局递交,受理后会同步受理号。</p>
            </div>

            <div class="flex gap-3">
              <button
                v-if="['SUBMITTED'].includes(copyrightReg.workflowStage)"
                type="button"
                class="px-4 py-2 border border-r12-danger/40 text-r12-danger text-xs font-r12-mono hover:bg-r12-danger-soft transition disabled:opacity-50"
                :disabled="submittingCopyright"
                @click="withdrawCopyright"
              >撤回申请</button>
            </div>
          </div>

          <!-- 状态:CERTIFIED — 成功 -->
          <div v-else-if="copyrightReg?.workflowStage === 'CERTIFIED'" class="mt-4 p-5 bg-r12-success-soft border-l-2 border-r12-success">
            <div class="font-r12-sans text-r12-body font-medium text-r12-success mb-1">✓ 著作权登记成功</div>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div><span class="text-r12-ink-secondary">登记号</span> · <span class="font-r12-mono text-r12-ink-primary">{{ copyrightReg.certificateNo }}</span></div>
              <div><span class="text-r12-ink-secondary">发证日期</span> · <span class="text-r12-ink-primary">{{ dateLabel(copyrightReg.certifiedAt) }}</span></div>
            </div>
          </div>

          <!-- 状态:REJECTED / WITHDRAWN — 失败 -->
          <div v-else-if="['REJECTED','WITHDRAWN'].includes(copyrightReg?.workflowStage)" class="mt-4 p-5 bg-r12-danger-soft border-l-2 border-r12-danger">
            <div class="font-r12-sans text-r12-body font-medium text-r12-danger mb-2">
              {{ copyrightReg.workflowStage === 'REJECTED' ? '申请被驳回' : '已撤回' }}
            </div>
            <p v-if="copyrightReg.rejectionReason" class="text-sm text-r12-ink-primary/80 mb-3">
              <span class="text-r12-ink-secondary">原因:</span> {{ copyrightReg.rejectionReason }}
            </p>
            <button
              type="button"
              class="px-4 py-2 bg-r12-cobalt text-white font-r12-sans text-r12-caption font-medium hover:bg-r12-cobalt-hover transition disabled:opacity-50"
              :disabled="submittingCopyright"
              @click="startApply"
            >重新申请</button>
          </div>

          <!-- 错误提示 -->
          <div v-if="copyrightError" class="mt-3 p-3 bg-r12-danger-soft text-r12-danger text-xs">
            {{ copyrightError }}
          </div>
        </div>

        <!-- 创作者已登记后的简洁展示 -->
        <div
          v-else-if="isCreator && isOfficial"
          class="mt-8 p-5 bg-r12-success-soft border border-r12-success/30"
        >
          <div class="flex items-center gap-3">
            <span class="font-r12-sans text-r12-h2 text-r12-success">✓</span>
            <div>
              <div class="font-r12-sans text-r12-body font-medium text-r12-ink-primary">著作权已登记</div>
              <div class="text-xs text-r12-ink-secondary mt-1">登记号 <span class="font-r12-mono">{{ ip.officialCertNo }}</span></div>
            </div>
          </div>
        </div>
      </article>

      <!-- ============ 申请弹窗 ============ -->
      <div
        v-if="showApplyModal"
        class="fixed inset-0 z-50 bg-r12-ink-primary/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        @click.self="showApplyModal = false"
      >
        <div class="bg-r12-surface max-w-2xl w-full p-6 md:p-8 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-6">
            <h3 class="font-r12-sans text-r12-h2 font-semibold text-r12-ink-primary">著作权登记申请</h3>
            <button class="text-r12-ink-tertiary hover:text-r12-ink-primary text-2xl" @click="showApplyModal = false">×</button>
          </div>

          <!-- 著作权人信息 -->
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-r12-mono text-r12-ink-secondary mb-1">著作权人姓名 / 公司名 <span class="text-r12-danger">*</span></label>
              <input v-model="draftForm.ownerName" type="text" maxlength="100"
                class="w-full px-3 py-2 border border-r12-line-strong bg-r12-surface text-r12-ink-primary focus:border-r12-cobalt outline-none" />
            </div>

            <div>
              <label class="block text-xs font-r12-mono text-r12-ink-secondary mb-1">主体类型 <span class="text-r12-danger">*</span></label>
              <div class="flex gap-3">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="draftForm.ownerType" type="radio" value="INDIVIDUAL" class="accent-r12-cobalt" />
                  <span class="text-sm">个人 (INDIVIDUAL)</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="draftForm.ownerType" type="radio" value="COMPANY" class="accent-r12-cobalt" />
                  <span class="text-sm">企业 (COMPANY)</span>
                </label>
              </div>
            </div>

            <div v-if="draftForm.ownerType === 'INDIVIDUAL'">
              <label class="block text-xs font-r12-mono text-r12-ink-secondary mb-1">身份证号 <span class="text-r12-danger">*</span></label>
              <input v-model="draftForm.ownerIdNumber" type="text" maxlength="18" placeholder="18 位身份证号"
                class="w-full px-3 py-2 border border-r12-line-strong bg-r12-surface text-r12-ink-primary font-r12-mono focus:border-r12-cobalt outline-none" />
            </div>

            <div>
              <label class="block text-xs font-r12-mono text-r12-ink-secondary mb-1">登记级别 <span class="text-r12-danger">*</span></label>
              <div class="flex gap-3">
                <label class="flex-1 border p-3 cursor-pointer" :class="draftForm.registrationType === 'NATIONAL' ? 'border-r12-cobalt bg-r12-cobalt-soft' : 'border-r12-line-strong'">
                  <input v-model="draftForm.registrationType" type="radio" value="NATIONAL" class="hidden" />
                  <div class="font-r12-sans text-r12-body font-medium">国家级</div>
                  <div class="text-xs text-r12-ink-secondary">国作登字 · 全国有效</div>
                  <div class="font-r12-mono text-sm text-r12-cobalt mt-1">¥{{ (feeConfig?.national || 65000) / 100 }}</div>
                </label>
                <label class="flex-1 border p-3 cursor-pointer" :class="draftForm.registrationType === 'PROVINCIAL' ? 'border-r12-cobalt bg-r12-cobalt-soft' : 'border-r12-line-strong'">
                  <input v-model="draftForm.registrationType" type="radio" value="PROVINCIAL" class="hidden" />
                  <div class="font-r12-sans text-r12-body font-medium">地方级</div>
                  <div class="text-xs text-r12-ink-secondary">省级登记 · 仅省内有效</div>
                  <div class="font-r12-mono text-sm text-r12-cobalt mt-1">¥{{ draftForm.registrationRegion && feeConfig?.provincial[draftForm.registrationRegion] ? feeConfig.provincial[draftForm.registrationRegion] / 100 : '60-300' }}</div>
                </label>
              </div>
            </div>

            <div v-if="draftForm.registrationType === 'PROVINCIAL'">
              <label class="block text-xs font-r12-mono text-r12-ink-secondary mb-1">备案省份 <span class="text-r12-danger">*</span></label>
              <select v-model="draftForm.registrationRegion" class="w-full px-3 py-2 border border-r12-line-strong bg-r12-surface text-r12-ink-primary focus:border-r12-cobalt outline-none">
                <option value="">请选择省份</option>
                <option v-for="(fee, name) in feeConfig?.provincial || {}" :key="name" :value="name">
                  {{ name }} · ¥{{ fee / 100 }}
                </option>
              </select>
            </div>

            <!-- 费用预览 -->
            <div class="p-3 bg-r12-cobalt/[0.08] border-l-2 border-r12-cobalt text-sm">
              <div class="flex justify-between">
                <span class="text-r12-ink-secondary">代办费</span>
                <span class="font-r12-mono text-r12-ink-primary">¥{{ (selectedFeeFen / 100).toFixed(2) }}</span>
              </div>
              <p class="text-xs text-r12-ink-secondary mt-1">含平台代办服务费 + 版权局规费 · 一次性收取</p>
            </div>

            <p class="text-xs text-r12-ink-secondary leading-relaxed">
              提交即视为授权平台代为向版权局递交申请材料,著作权人为创作者本人(方案 A)。
              AI 生成内容能否成功登记以版权局最终审核为准,如被驳回平台将协助补充材料或退款。
            </p>
          </div>

          <div class="mt-6 flex gap-3 justify-end">
            <button type="button" class="px-4 py-2 border border-r12-line-strong text-r12-ink-primary text-sm hover:border-r12-cobalt transition disabled:opacity-50"
              :disabled="submittingCopyright"
              @click="saveDraft">保存草稿</button>
            <button type="button" class="px-4 py-2 bg-r12-cobalt text-white font-r12-sans text-r12-caption font-medium hover:bg-r12-cobalt-hover transition disabled:opacity-50"
              :disabled="submittingCopyright"
              @click="submitCopyright">保存并提交</button>
          </div>
        </div>
      </div>

      <!-- ============ 02 · 资产包清单 ============ -->
      <article id="catalogue" class="mb-20 md:mb-28 scroll-mt-24">
        <header class="grid md:grid-cols-12 gap-4 mb-10 md:mb-14 items-end">
          <div class="md:col-span-1 catalog-no text-r12-cobalt">— 02 —</div>
          <h2 class="md:col-span-6 text-r12-h1 font-semibold tracking-tight leading-tight text-r12-ink-primary leading-[0.95]">
            资产<span class="font-display-italic text-r12-cobalt">包清单</span>
          </h2>
          <div class="md:col-span-4 md:col-start-9 text-right">
            <div class="catalog-no text-r12-ink-tertiary mb-1">APPENDIX · A</div>
            <div class="font-r12-mono text-xs text-r12-ink-secondary">
              {{ validatedCount }} ITEMS · {{ totalSize }} TOTAL
            </div>
          </div>
        </header>

        <!-- 双栏清单 · 必填 / 选填 -->
        <div class="grid md:grid-cols-2 gap-x-px gap-y-px bg-line hairline border-r12-line">

          <!-- 必填 -->
          <div class="bg-r12-surface p-8 md:p-10">
            <div class="flex items-baseline justify-between mb-6 pb-4 hairline-b border-r12-line">
              <h3 class="font-r12-sans text-r12-h2 font-semibold text-r12-ink-primary">必填素材</h3>
              <span class="catalog-no text-r12-cobalt">REQUIRED · {{ requiredCount }} / {{ requiredAssetTypes.length }}</span>
            </div>
            <ul class="space-y-px">
              <li
                v-for="t in requiredAssetTypes"
                :key="t"
                class="flex items-center justify-between p-4 bg-r12-canvas border-0.5"
                :class="presentTypes.has(t) ? 'border-r12-line' : 'border-dashed border-r12-line/60'"
              >
                <div class="flex items-center gap-4 min-w-0 flex-1">
                  <div :class="[
                    'w-10 h-10 flex items-center justify-center font-r12-mono text-xs shrink-0 border-0.5',
                    presentTypes.has(t) ? 'border-r12-success text-r12-success bg-r12-success-soft' : 'border-r12-line text-r12-ink-tertiary',
                  ]">
                    {{ presentTypes.has(t) ? '✓' : t.slice(0, 3) }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-2">
                      <span class="font-r12-sans text-r12-body font-medium text-r12-ink-primary">{{ assetTypeLabel(t) }}</span>
                      <span class="catalog-no text-r12-danger">REQ</span>
                    </div>
                    <div v-if="filesByType[t]" class="text-xs text-r12-ink-secondary mt-0.5 truncate font-r12-mono">
                      {{ filesByType[t].displayName }} · {{ formatSize(filesByType[t].sizeBytes) }}
                    </div>
                    <div v-else class="text-xs text-r12-ink-tertiary mt-0.5 font-r12-mono">— NOT UPLOADED —</div>
                  </div>
                </div>
                <div class="catalog-no text-r12-ink-tertiary shrink-0 ml-4 flex items-center gap-2">
                  <span>🔒</span>
                  <span class="hidden lg:inline">UNLOCK</span>
                </div>
              </li>
            </ul>
          </div>

          <!-- 选填 -->
          <div class="bg-r12-surface p-8 md:p-10">
            <div class="flex items-baseline justify-between mb-6 pb-4 hairline-b border-r12-line">
              <h3 class="font-r12-sans text-r12-h2 font-semibold text-r12-ink-primary">选填素材</h3>
              <span class="catalog-no text-r12-ink-secondary">OPTIONAL · {{ optionalAssetTypes.filter(t => presentTypes.has(t)).length }} / {{ optionalAssetTypes.length }}</span>
            </div>
            <ul class="space-y-px">
              <li
                v-for="t in optionalAssetTypes"
                :key="t"
                class="flex items-center justify-between p-4 bg-r12-canvas border-0.5"
                :class="presentTypes.has(t) ? 'border-r12-line' : 'border-dashed border-r12-line/60'"
              >
                <div class="flex items-center gap-4 min-w-0 flex-1">
                  <div :class="[
                    'w-10 h-10 flex items-center justify-center font-r12-mono text-xs shrink-0 border-0.5',
                    presentTypes.has(t) ? 'border-r12-cobalt text-r12-cobalt bg-r12-cobalt-soft' : 'border-r12-line text-r12-ink-tertiary',
                  ]">
                    {{ presentTypes.has(t) ? '◆' : '○' }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-2">
                      <span class="font-r12-sans text-r12-body font-medium text-r12-ink-primary">{{ assetTypeLabel(t) }}</span>
                      <span class="catalog-no text-r12-ink-tertiary">OPT</span>
                    </div>
                    <div v-if="filesByType[t]" class="text-xs text-r12-ink-secondary mt-0.5 truncate font-r12-mono">
                      {{ filesByType[t].displayName }} · {{ formatSize(filesByType[t].sizeBytes) }}
                    </div>
                    <div v-else class="text-xs text-r12-ink-tertiary mt-0.5 font-r12-mono">— OPTIONAL —</div>
                  </div>
                </div>
                <div class="catalog-no text-r12-ink-tertiary shrink-0 ml-4 flex items-center gap-2">
                  <span>🔒</span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <!-- AI 溯源 / 隐水印 -->
        <div v-if="ip.blockchainHash" class="mt-8 grid md:grid-cols-2 gap-px bg-line hairline border-r12-line">
          <div class="bg-r12-surface p-8 md:p-10">
            <div class="flex items-baseline justify-between mb-4">
              <div class="catalog-no text-r12-cobalt">— AI PROVENANCE —</div>
              <span v-if="ip.invisibleWatermarkApplied" class="catalog-no text-r12-success border-0.5 border-r12-success px-2 py-0.5">
                ✓ WATERMARKED
              </span>
            </div>
            <h3 class="font-r12-sans text-r12-h2 font-semibold text-r12-ink-primary mb-4">生成<span class="font-display-italic">溯源</span></h3>
            <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs mb-4">
              <span class="text-r12-ink-secondary catalog-no">NETWORK</span>
              <span class="font-r12-mono">{{ ip.blockchainNetwork || 'mock-chain-v1' }}</span>
              <span class="text-r12-ink-secondary catalog-no">PAYLOAD</span>
              <span class="font-r12-mono break-all text-[11px]">{{ ip.blockchainHash }}</span>
              <span class="text-r12-ink-secondary catalog-no">TX</span>
              <span class="font-r12-mono break-all text-[11px]">{{ ip.blockchainTxId }}</span>
            </div>
            <p class="text-xs text-r12-ink-primary/65 leading-relaxed">
              <strong class="text-r12-ink-primary">链上存证</strong>: 该 IP 所有素材的 SHA-256 校验和按字典序排序后计算哈希值, 任何后续修改都将与链上记录不一致。
            </p>
          </div>

          <div v-if="ip.invisibleWatermarkApplied" class="bg-r12-surface p-8 md:p-10">
            <div class="catalog-no text-r12-cobalt mb-4">— INVISIBLE WATERMARK —</div>
            <h3 class="font-r12-sans text-r12-h2 font-semibold text-r12-ink-primary mb-4">隐<span class="font-display-italic">水印</span></h3>
            <p class="text-xs text-r12-ink-primary/65 leading-relaxed">
              <strong class="text-r12-ink-primary">DWT-SVD 算法</strong>: 每张交付图片已嵌入隐形水印 (含版权方 ID + 购买方 ID + 时间戳)。
              <span class="text-r12-ink-primary/80">裁剪、压缩、调色后仍可提取</span>, 用于盗版溯源。
            </p>
            <p class="text-xs text-r12-ink-primary/65 leading-relaxed mt-3">
              上传图片至 <code class="font-r12-mono text-r12-cobalt">IBIren/verify</code> 可一键验证。
            </p>
          </div>
        </div>

        <div class="mt-6 p-6 bg-r12-canvas border-0.5 border-r12-line text-sm text-r12-ink-secondary leading-relaxed">
          <strong class="font-r12-sans text-r12-body font-medium text-r12-ink-primary">— 交付说明 —</strong>
          完整资产包 = 视觉矩阵 (三视图 + 表情 + 透明 PNG) + AI 核心 (LoRA + Prompt 说明书) +
          身份小传 (bio + 可选声音样本) + 合规文件。购买后通过 OSS 临时签名链下载, 单次链接 5 分钟有效。
        </div>
      </article>

      <!-- ============ 03 · 授权阶梯 ============ -->
      <article id="pricing" class="scroll-mt-24">
        <header class="grid md:grid-cols-12 gap-4 mb-10 md:mb-14 items-end">
          <div class="md:col-span-1 catalog-no text-r12-cobalt">— 03 —</div>
          <h2 class="md:col-span-6 text-r12-h1 font-semibold tracking-tight leading-tight text-r12-ink-primary leading-[0.95]">
            授权<span class="font-display-italic text-r12-cobalt">阶梯</span>
          </h2>
          <div class="md:col-span-4 md:col-start-9 text-right">
            <div class="catalog-no text-r12-ink-tertiary mb-1">BIDDING TIERS</div>
            <div class="font-r12-mono text-xs text-r12-ink-secondary">STEP UP TO LICENCE</div>
          </div>
        </header>

        <div class="grid lg:grid-cols-12 gap-px bg-line hairline border-r12-line">

          <!-- 左侧: 意向金 + 阶梯 (4 列) -->
          <div class="lg:col-span-5 bg-r12-ink-primary text-white p-8 md:p-10">
            <div class="catalog-no text-r12-cobalt/80 mb-3">— TIER 00 · DEPOSIT —</div>
            <div class="font-r12-sans text-r12-body font-medium text-white/70 mb-1">测试期意向金</div>
            <div class="font-r12-mono text-r12-mono-num-lg font-semibold tabular-nums text-r12-cobalt leading-none mb-2">{{ formatFen(ip.depositPriceFen) }}</div>
            <div class="text-xs text-white/55 mb-8 font-r12-mono">7 DAYS · WATERMARKED · NON-COMMERCIAL</div>

            <button
              @click="checkout('DEPOSIT_INTENT')"
              class="group w-full py-4 bg-r12-cobalt text-r12-ink-primary hover:bg-r12-canvas transition-colors duration-500 flex items-center justify-between px-6"
            >
              <span class="catalog-no text-r12-ink-secondary">PLACE INTENT</span>
              <span class="font-r12-sans text-r12-body font-medium">支付意向金 →</span>
            </button>

            <div class="mt-8 pt-6 hairline-t border-cream/15">
              <div class="catalog-no text-white/50 mb-3">— WHAT YOU GET —</div>
              <ul class="space-y-2 text-sm text-white/80">
                <li class="flex gap-2"><span class="text-r12-cobalt">—</span><span>7 天测试使用权</span></li>
                <li class="flex gap-2"><span class="text-r12-cobalt">—</span><span>带水印的非商用模型包</span></li>
                <li class="flex gap-2"><span class="text-r12-cobalt">—</span><span>锁定 30 天排他期</span></li>
                <li class="flex gap-2"><span class="text-r12-cobalt">—</span><span>版权下发后自动续接正式授权</span></li>
              </ul>
            </div>
          </div>

          <!-- 右侧: 4 阶梯 (7 列) -->
          <div class="lg:col-span-7 bg-r12-surface p-8 md:p-10">
            <div class="flex items-baseline justify-between mb-6 pb-4 hairline-b border-r12-line">
              <h3 class="catalog-no text-r12-ink-secondary">FORMAL LICENSING</h3>
              <span class="catalog-no text-r12-cobalt">04 TIERS</span>
            </div>

            <div class="space-y-px">
              <button
                v-for="(tier, idx) in licenseTiers"
                :key="tier.code"
                @click="tier.contactOnly ? null : checkout('FULL_LICENSE', tier.code)"
                :disabled="tier.contactOnly"
                :class="[
                  'group w-full p-5 border-0.5 text-left transition flex items-center justify-between gap-4 bg-r12-canvas',
                  tier.recommended
                    ? 'border-r12-cobalt hover:bg-r12-cobalt-soft'
                    : 'border-r12-line hover:border-r12-cobalt hover:bg-r12-surface',
                  tier.contactOnly && 'opacity-70 cursor-not-allowed hover:border-r12-line hover:bg-r12-canvas',
                ]"
              >
                <div class="flex items-center gap-5 min-w-0 flex-1">
                  <!-- 阶梯编号 -->
                  <div :class="[
                    'font-r12-mono text-r12-h1 font-semibold tabular-nums leading-none shrink-0',
                    tier.recommended ? 'text-r12-cobalt' : 'text-r12-ink-primary/25',
                  ]">
                    {{ String(idx + 1).padStart(2, '0') }}
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-2 flex-wrap">
                      <span class="text-r12-h3 font-medium text-r12-ink-primary">{{ tier.label }}</span>
                      <span v-if="tier.recommended" class="catalog-no text-r12-cobalt bg-r12-cobalt-soft px-2 py-0.5">★ RECOMMENDED</span>
                      <span v-if="tier.contactOnly" class="catalog-no text-r12-ink-tertiary">— CONTACT ONLY</span>
                    </div>
                    <div class="text-xs text-r12-ink-secondary mt-1 font-r12-mono">{{ tier.desc }}</div>
                  </div>
                </div>

                <div class="text-right shrink-0">
                  <div v-if="tier.contactOnly" class="font-display-italic text-lg text-r12-ink-secondary">面谈</div>
                  <div v-else class="font-r12-sans text-r12-h2 font-semibold text-r12-ink-primary group-hover:text-r12-cobalt transition">{{ formatFen(tier.priceFen) }}</div>
                </div>
              </button>
            </div>

            <p class="mt-6 pt-4 hairline-t border-r12-line/60 text-[11px] text-r12-ink-secondary leading-relaxed font-r12-mono">
              ※ 所有正式授权均含电子签授权书 + 完整资产包下载。
              阶梯价基于捏者设定起价, 具体可在商务洽谈阶段调整。
            </p>
          </div>
        </div>
      </article>

      <!-- ============ 底部 colophon ============ -->
      <div class="mt-20 pt-6 hairline-t border-r12-line grid grid-cols-12 gap-4">
        <div class="col-span-3 catalog-no text-r12-ink-tertiary">PLATE · {{ ip.code }}</div>
        <div class="col-span-6 col-start-4 text-r12-ink-secondary text-xs leading-relaxed">
          Set in Cormorant Garamond, Inter Tight & JetBrains Mono.
          Catalogued by IBIren Archive Department. © 2026 IBIren · All rights reserved.
        </div>
        <div class="col-span-3 col-start-10 text-right catalog-no text-r12-ink-tertiary">END · FIN</div>
      </div>

    </section>

  </div>
</template>