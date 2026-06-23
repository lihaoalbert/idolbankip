<script setup lang="ts">
/**
 * RadarChart — 纯 SVG 雷达图(无新依赖)
 *
 * Phase 1 用途:L8 评估的 3 维主分可视化(originality / consistency / aesthetics)
 * 输入: scores 数组(每项 0~10)
 * 输出: 3 轴雷达图,背景同心圆网格,数据多边形 + 数据点 + 轴标签 + 数字
 *
 * 计算逻辑委托给 radar-helpers.ts(便于纯函数单测)
 */
import { computed } from 'vue';
import {
  computeAxisEnds,
  computeDataPath,
  computeDataPoints,
  computeGridCircles,
  computeLabelPositions,
  computeAvgScore,
  scoreColor,
  type RadarScore,
} from './radar-helpers';

const props = withDefaults(
  defineProps<{
    scores: RadarScore[];
    size?: number; // 像素大小
    max?: number; // 数据最大值(默认 10)
  }>(),
  { size: 240, max: 10 },
);

const cx = computed(() => props.size / 2);
const cy = computed(() => props.size / 2);

const gridCircles = computed(() => computeGridCircles(props.size, props.max));
const axisEnds = computed(() => computeAxisEnds(props.size, props.scores));
const dataPoints = computed(() => computeDataPoints(props.size, props.max, props.scores));
const dataPath = computed(() => computeDataPath(dataPoints.value));
const labelPositions = computed(() => computeLabelPositions(props.size, props.scores));
const avgScore = computed(() => computeAvgScore(props.scores));
const avgColor = computed(() => scoreColor(avgScore.value));
</script>

<template>
  <div class="inline-flex flex-col items-center" data-testid="radar-chart">
    <svg
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      class="overflow-visible"
    >
      <!-- 网格圈 -->
      <g class="grid">
        <circle
          v-for="(g, i) in gridCircles"
          :key="`grid-${i}`"
          :cx="cx"
          :cy="cy"
          :r="g.r"
          fill="none"
          stroke="currentColor"
          stroke-width="0.5"
          stroke-dasharray="2 3"
          class="text-ink/15"
        />
        <text
          v-for="(g, i) in gridCircles"
          :key="`grid-label-${i}`"
          :x="cx + 3"
          :y="cy - g.r - 1"
          class="fill-ink/30 font-mono"
          font-size="9"
        >
          {{ g.label }}
        </text>
      </g>

      <!-- 轴线 -->
      <g class="axes">
        <line
          v-for="(end, i) in axisEnds"
          :key="`axis-${i}`"
          :x1="cx"
          :y1="cy"
          :x2="end.x"
          :y2="end.y"
          stroke="currentColor"
          stroke-width="0.5"
          class="text-ink/20"
        />
      </g>

      <!-- 数据多边形 -->
      <path
        v-if="dataPoints.length > 0"
        :d="dataPath"
        :fill="avgColor"
        fill-opacity="0.18"
        :stroke="avgColor"
        stroke-width="1.5"
        stroke-linejoin="round"
        data-testid="radar-polygon"
      />

      <!-- 数据点 -->
      <g class="data-points">
        <circle
          v-for="(p, i) in dataPoints"
          :key="`pt-${i}`"
          :cx="p.x"
          :cy="p.y"
          r="3"
          :fill="avgColor"
          stroke="white"
          stroke-width="1"
        />
      </g>

      <!-- 轴标签 + 数字 -->
      <g class="labels">
        <text
          v-for="(l, i) in labelPositions"
          :key="`lbl-${i}`"
          :x="l.x"
          :y="l.y"
          text-anchor="middle"
          dominant-baseline="middle"
          class="fill-ink/70"
          font-size="11"
        >
          <tspan :x="l.x" dy="0">{{ l.score.label }}</tspan>
          <tspan
            :x="l.x"
            dy="14"
            class="font-mono"
            :fill="avgColor"
            font-size="12"
            font-weight="600"
          >{{ l.score.value.toFixed(1) }}</tspan>
        </text>
      </g>
    </svg>

    <!-- 平均分 -->
    <div class="mt-1 text-center">
      <div class="text-xs text-ink/50">综合评分</div>
      <div
        class="font-mono text-2xl font-semibold"
        :style="{ color: avgColor }"
        data-testid="radar-avg"
      >
        {{ avgScore.toFixed(1) }}
      </div>
    </div>
  </div>
</template>
