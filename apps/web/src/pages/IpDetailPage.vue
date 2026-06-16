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

onMounted(fetchDetail);
</script>

<template>
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
    <!-- 盲盒式 Hero -->
    <section class="relative aspect-[4/3] md:aspect-[16/9] rounded-3xl overflow-hidden bg-gradient-to-br from-cream to-gold/20 mb-8">
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
      <div class="absolute top-4 left-4 px-3 py-1 bg-ink/80 text-cream text-xs rounded-full backdrop-blur">
        {{ ip.status === 'PUBLIC_INTENT' ? '版权办理中 · 已存证' : '已登记 · 可全量商用' }}
      </div>
      <div class="absolute bottom-4 left-4 right-4 flex items-end justify-between text-white">
        <div>
          <h1 class="font-display text-4xl md:text-5xl drop-shadow-lg">{{ ip.displayName }}</h1>
          <p v-if="ip.tagline" class="text-sm mt-2 text-white/90 max-w-xl drop-shadow">{{ ip.tagline }}</p>
        </div>
        <div class="text-xs font-mono text-white/80">{{ ip.code }}</div>
      </div>
    </section>

    <!-- 附条件提示 -->
    <div
      v-if="ip.status === 'PUBLIC_INTENT'"
      class="mb-8 p-4 bg-gold/15 border border-gold/40 rounded-2xl text-sm"
    >
      <div class="font-medium mb-1">⚠️ 该形象版权正在权威机构登记中</div>
      <div class="text-ink/70">
        平台已将该形象的关键元数据通过区块链时间戳存证（编号 <code class="font-mono">{{ ip.blockchainTxId }}</code>）。
        版权下发前支付意向金即锁定排他期,期间若发生第三方主张权利纠纷,平台承诺全额退款或免费更换等值 IP。
      </div>
    </div>

    <!-- 资产包清单 -->
    <section class="grid lg:grid-cols-3 gap-8">
      <div class="lg:col-span-2">
        <h2 class="font-display text-xl mb-4">资产包清单</h2>
        <div class="space-y-2">
          <div
            v-for="f in files"
            :key="f.id"
            class="flex items-center justify-between p-4 bg-white border border-line rounded-xl"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-cream flex items-center justify-center text-xs font-mono">
                {{ f.assetType.slice(0, 3) }}
              </div>
              <div>
                <div class="text-sm font-medium">{{ f.displayName }}</div>
                <div class="text-xs text-ink/50">{{ assetTypeLabel(f.assetType) }} · {{ formatSize(f.sizeBytes) }}</div>
              </div>
            </div>
            <div class="flex items-center gap-2 text-xs text-ink/40">
              <span>🔒</span>
              <span>购买后解锁</span>
            </div>
          </div>
        </div>

        <div class="mt-8 p-4 bg-cream/60 rounded-2xl text-sm text-ink/70 leading-relaxed">
          <strong class="text-ink">交付说明</strong>：
          完整资产包 = 视觉矩阵（三视图 + 表情 + 透明 PNG） + AI 核心（LoRA + Prompt 说明书） +
          身份小传（bio + 可选声音样本）+ 合规文件。购买后通过 OSS 临时签名链下载，单次链接 5 分钟有效。
        </div>
      </div>

      <!-- 阶梯定价 -->
      <aside class="lg:sticky lg:top-20 self-start">
        <div class="p-6 bg-ink text-cream rounded-2xl">
          <div class="text-xs text-cream/60 mb-2">测试期意向金</div>
          <div class="font-display text-4xl text-gold mb-1">{{ formatFen(ip.depositPriceFen) }}</div>
          <div class="text-xs text-cream/60 mb-6">7 天测试使用权 · 带水印 · 不可商用</div>
          <button
            @click="checkout('DEPOSIT_INTENT')"
            class="w-full py-3 bg-gold text-ink rounded-full font-medium hover:bg-cream transition mb-2"
          >支付意向金</button>

          <div class="my-6 border-t border-cream/10" />

          <div class="text-xs text-cream/60 mb-2">正式版权授权 · 起价</div>
          <div class="font-display text-3xl mb-1">{{ formatFen(ip.fullLicensePriceFen) }}</div>
          <div class="text-xs text-cream/60 mb-4">包含电子签授权书 + 全套资产包</div>

          <div class="space-y-2 text-sm">
            <button
              @click="checkout('FULL_LICENSE', 'SINGLE_DRAMA')"
              class="w-full py-2 text-left px-4 border border-cream/20 rounded-full hover:border-gold hover:text-gold transition"
            >
              单部短剧
            </button>
            <button
              @click="checkout('FULL_LICENSE', 'THREE_YEAR_WEB')"
              class="w-full py-2 text-left px-4 border border-cream/20 rounded-full hover:border-gold hover:text-gold transition"
            >
              全网 3 年商用
            </button>
            <button
              @click="checkout('FULL_LICENSE', 'BUYOUT_EXCLUSIVE')"
              class="w-full py-2 text-left px-4 border border-cream/20 rounded-full hover:border-gold hover:text-gold transition"
            >
              终身独家买断（联系商务）
            </button>
          </div>
        </div>
      </aside>
    </section>
  </div>
</template>

<script lang="ts">
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

function formatSize(bytes: string | number): string {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
</script>