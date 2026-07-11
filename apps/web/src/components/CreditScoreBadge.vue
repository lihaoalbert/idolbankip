<!--
  CreditScoreBadge — W5 E3 信用分徽章

  Props:
    userId — 创作者 id
    asRole — 'creator' | 'buyer' (默认 creator)
    compact — true 时只显示分数 + grade chip
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import {
  GRADE_COLOR,
  GRADE_LABEL_ZH,
  type CreditScore,
  dimensionLabel,
  useCreditScore,
} from '@/composables/useCreditScore';

const props = withDefaults(
  defineProps<{
    userId: string;
    asRole?: 'creator' | 'buyer';
    compact?: boolean;
  }>(),
  { asRole: 'creator', compact: false },
);

const { fetchScore } = useCreditScore();
const score = ref<CreditScore | null>(null);
const loading = ref(false);

async function load() {
  if (!props.userId) return;
  loading.value = true;
  score.value = await fetchScore(props.userId, props.asRole);
  loading.value = false;
}

onMounted(load);
watch(
  () => props.userId,
  () => load(),
);
</script>

<template>
  <div v-if="loading && !score" class="text-[10px] text-ink/40">计算信用分…</div>
  <div v-else-if="score" class="text-xs">
    <div class="flex items-center gap-2">
      <span class="font-display text-lg text-stamp-red tabular-nums">{{ score.score }}</span>
      <span class="text-[10px] text-ink/50">/ 100</span>
      <span
        class="text-[10px] px-1.5 py-0.5 font-mono"
        :class="GRADE_COLOR[score.grade]"
      >
        {{ GRADE_LABEL_ZH[score.grade] }}
      </span>
    </div>
    <div v-if="!compact" class="mt-2 space-y-1">
      <div
        v-for="row in score.breakdown"
        :key="row.dimension"
        class="flex items-center gap-2 text-[10px]"
      >
        <span class="text-ink/60 w-20 shrink-0">{{ dimensionLabel(row.dimension) }}</span>
        <div class="flex-1 h-1 bg-ink/5 relative">
          <div
            class="absolute top-0 left-0 h-full"
            :class="row.weight >= 0 ? 'bg-stamp-red/60' : 'bg-ink/40'"
            :style="{ width: `${Math.min(100, Math.abs(row.weight) * 100)}%` }"
          />
          <div
            class="absolute top-0 left-0 h-full bg-stamp-red"
            :style="{ width: `${row.raw * Math.min(100, Math.abs(row.weight) * 100)}%` }"
          />
        </div>
        <span class="font-mono text-ink/50 w-12 text-right tabular-nums">
          {{ row.contribution >= 0 ? '+' : '' }}{{ (row.contribution * 100).toFixed(1) }}
        </span>
      </div>
    </div>
  </div>
  <div v-else class="text-[10px] text-ink/40">无信用分数据</div>
</template>
