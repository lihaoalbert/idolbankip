<script setup lang="ts">
import { computed } from 'vue';
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
    visualAgeBucket: string;
    depositPriceFen: number;
    fullLicensePriceFen: number;
    status: string;
    officialCertNo?: string;
    blockchainTxId?: string;
  };
  watermarkText?: string;
}>();

const thumb = computed(() => ossUrl(props.ip.thumbnailKey));
const styles = computed(() => props.ip.styleTags.split(',').filter(Boolean));
const scenarios = computed(() => props.ip.scenarioTags.split(',').filter(Boolean));
const isConditional = computed(() => props.ip.status === 'PUBLIC_INTENT');
</script>

<template>
  <RouterLink
    :to="`/ips/${ip.code}`"
    class="group relative block rounded-2xl overflow-hidden border border-line bg-white shadow-soft hover:shadow-glow transition"
  >
    <div class="relative aspect-square overflow-hidden">
      <img
        v-if="thumb"
        :src="thumb"
        :alt="ip.displayName"
        class="w-full h-full object-cover group-hover:scale-105 transition no-pirate"
        draggable="false"
        @contextmenu.prevent
      />
      <div v-else class="w-full h-full bg-line flex items-center justify-center text-ink/30">
        无图
      </div>
      <WatermarkOverlay :text="watermarkText || `ibi.ren · ${ip.code} · guest`" density="medium" />

      <div v-if="isConditional" class="absolute top-3 right-3 px-2 py-0.5 bg-gold/95 text-ink text-[10px] rounded-full font-medium">
        版权办理中
      </div>
      <div v-else-if="ip.officialCertNo" class="absolute top-3 right-3 px-2 py-0.5 bg-success/90 text-white text-[10px] rounded-full font-medium">
        已登记
      </div>
    </div>

    <div class="p-4">
      <div class="flex items-baseline justify-between mb-1">
        <h3 class="font-display text-base font-semibold truncate">{{ ip.displayName }}</h3>
        <span class="text-[10px] text-ink/40 font-mono">{{ ip.code }}</span>
      </div>
      <p v-if="ip.tagline" class="text-xs text-ink/60 line-clamp-2 mb-3 min-h-[2rem]">{{ ip.tagline }}</p>

      <div class="flex flex-wrap gap-1 mb-3">
        <span
          v-for="t in styles.slice(0, 3)"
          :key="t"
          class="px-1.5 py-0.5 text-[10px] bg-cream border border-line rounded"
        >
          {{ t }}
        </span>
      </div>

      <div class="flex items-baseline justify-between pt-2 border-t border-line">
        <div>
          <div class="text-[10px] text-ink/40">意向金</div>
          <div class="text-sm font-semibold text-gold">{{ formatFen(ip.depositPriceFen) }}</div>
        </div>
        <div class="text-right">
          <div class="text-[10px] text-ink/40">正式授权起</div>
          <div class="text-sm font-semibold">{{ formatFen(ip.fullLicensePriceFen) }}</div>
        </div>
      </div>
    </div>
  </RouterLink>
</template>