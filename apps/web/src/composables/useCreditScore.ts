/**
 * composables/useCreditScore — W5 E3 信用分调用封装
 *
 * 简单 inline cache(5 分钟 TTL),避免同一页面多次刷
 * 也避免重复调用同一用户的 /credit-score
 */
import { ref } from 'vue';
import { apiClient } from '@/api/client';

export interface CreditBreakdownRow {
  dimension: string;
  raw: number;
  weight: number;
  contribution: number;
}

export interface CreditMetrics {
  ratingAvg: number | null;
  ratingCount: number;
  completedAsCreator: number;
  completedAsBuyer: number;
  disputeCount: number;
  bidAcceptRate: number | null;
}

export interface CreditScore {
  userId: string;
  displayName: string;
  score: number;
  grade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  formulaVersion: number;
  breakdown: CreditBreakdownRow[];
  metrics: CreditMetrics;
  computedAt: string;
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: CreditScore; fetchedAt: number }>();

export const GRADE_LABEL_ZH: Record<CreditScore['grade'], string> = {
  EXCELLENT: '信用极佳',
  GOOD: '信用良好',
  FAIR: '信用一般',
  POOR: '信用欠佳',
};

export const GRADE_COLOR: Record<CreditScore['grade'], string> = {
  EXCELLENT: 'text-stamp-red bg-stamp-red/10',
  GOOD: 'text-success bg-success/10',
  FAIR: 'text-ink bg-ink/10',
  POOR: 'text-ink/50 bg-ink/5',
};

const DIMENSION_LABEL_ZH: Record<string, string> = {
  rating_avg: '评价均分',
  rating_count: '评价样本',
  completed_count: '已交付',
  completed_as_buyer_count: '已发布',
  dispute_count: '纠纷扣分',
  bid_accept_rate: '中标率',
};

export function dimensionLabel(dim: string): string {
  return DIMENSION_LABEL_ZH[dim] ?? dim;
}

export function useCreditScore() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const data = ref<CreditScore | null>(null);

  async function fetchScore(userId: string, asRole: 'creator' | 'buyer' = 'creator') {
    const key = `${userId}::${asRole}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      data.value = cached.data;
      return cached.data;
    }
    loading.value = true;
    error.value = null;
    try {
      const { data: res } = await apiClient.get<CreditScore>(
        `/users/${userId}/credit-score`,
        { params: { as: asRole } },
      );
      cache.set(key, { data: res, fetchedAt: Date.now() });
      data.value = res;
      return res;
    } catch (e: any) {
      error.value = e?.response?.data?.message || '加载信用分失败';
      return null;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, data, fetchScore };
}
