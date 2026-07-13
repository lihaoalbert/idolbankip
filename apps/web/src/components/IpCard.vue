<script setup lang="ts">
import { computed, ref } from 'vue';
import { ossUrl, formatFen } from '@/api/client';
import WatermarkOverlay from './WatermarkOverlay.vue';

const props = defineProps<{
  ip: {
    code: string;
    displayName: string;
    tagline?: string;
    thumbnailKey: string;
    styleTags: string;
    scenarioTags: string;
    gender: string;
    ageBucket: string;
    ethnicity?: string | null;
    depositPriceFen: number;
    fullLicensePriceFen: number;
    status: string;
    officialCertNo?: string;
    blockchainTxId?: string;
    blockchainHash?: string;
    publishedAt?: string;
  };
  watermarkText?: string;
}>();

const thumb = computed(() => props.ip.thumbnailKey ? ossUrl(props.ip.thumbnailKey) : '');
const styles = computed(() => props.ip.styleTags.split(',').filter(Boolean));
const scenarios = computed(() => props.ip.scenarioTags.split(',').filter(Boolean));
const isConditional = computed(() => props.ip.status === 'PUBLIC_INTENT');
const isOfficial = computed(() => props.ip.status === 'OFFICIAL_REGISTERED');

const shortHash = computed(() => {
  const h = props.ip.blockchainHash;
  if (!h) return null;
  return h.length > 10 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
});

const hover = ref(false);

// #32 enum 值大写 → 中文 label
const genderLabel = computed(() => ({
  FEMALE: '女', MALE: '男', NONBINARY: '无性别',
}[props.ip.gender] || props.ip.gender));

const ageLabel = computed(() => ({
  CHILD: '童颜', YOUNG: '青年', MIDDLE: '中年', ELDERLY: '银发',
}[props.ip.ageBucket] || props.ip.ageBucket));
</script>

<template>
  <RouterLink
    :to="`/ips/${ip.code}`"
    class="plate group relative block hairline border border-line dark:border-line/60 overflow-hidden"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <!-- R8.1: 印刷裁切标记四角 — 替代 SaaS shadow-glow -->
    <span class="cropmark cropmark-tl"></span>
    <span class="cropmark cropmark-tr"></span>
    <span class="cropmark cropmark-bl"></span>
    <span class="cropmark cropmark-br"></span>

    <div class="plate-frame relative aspect-square overflow-hidden">
      <img
        v-if="thumb"
        :src="thumb"
        :alt="ip.displayName"
        class="w-full h-full object-cover group-hover:scale-105 transition duration-slow no-pirate"
        draggable="false"
        @contextmenu.prevent
      />
      <div v-else class="w-full h-full bg-line flex items-center justify-center text-ink/30">
        无图
      </div>
      <WatermarkOverlay :text="watermarkText || `IBIren · ${ip.code} · guest`" density="medium" />

      <!-- 状态标签 — R8.0 状态色统一, R8.1 改直角 stamp -->
      <div class="absolute top-3 right-3 flex flex-col gap-1 items-end">
        <span v-if="isConditional" class="stamp !text-gold !border-gold">
          版权办理中
        </span>
        <span v-else-if="isOfficial" class="stamp !text-success !border-success">
          ✓ 已登记
        </span>
      </div>
    </div>

    <div class="px-4 py-3 hairline-t">
      <div class="flex items-baseline justify-between mb-1">
        <h3 class="font-display text-base font-semibold truncate">{{ ip.displayName }}</h3>
        <span class="catalog-no text-ink/40 dark:text-ink/30 ml-2 shrink-0">{{ ip.code }}</span>
      </div>
      <p v-if="ip.tagline" class="text-xs text-ink/60 dark:text-ink/50 line-clamp-2 mb-3 min-h-[2rem]">{{ ip.tagline }}</p>

      <div class="flex flex-wrap gap-1 mb-3">
        <span
          v-for="t in styles.slice(0, 3)"
          :key="t"
          class="px-1.5 py-0.5 text-[10px] bg-cream/60 dark:bg-surface-2 border border-line dark:border-line/50 rounded-r8-sm"
        >
          {{ t }}
        </span>
      </div>

      <div class="flex items-baseline justify-between pt-2 hairline-t">
        <div>
          <div class="catalog-no text-ink/40 dark:text-ink/30">意向金</div>
          <div class="text-sm font-semibold text-gold">{{ formatFen(ip.depositPriceFen) }}</div>
        </div>
        <div class="text-right">
          <div class="catalog-no text-ink/40 dark:text-ink/30">正式授权起</div>
          <div class="text-sm font-semibold">{{ formatFen(ip.fullLicensePriceFen) }}</div>
        </div>
      </div>
    </div>
  </RouterLink>
</template>