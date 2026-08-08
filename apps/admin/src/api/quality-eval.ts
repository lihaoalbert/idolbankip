/**
 * Admin Quality Eval API — 评分队列 + dashboard + 复审
 * 镜像 admin/quality-eval/* endpoints
 */
import { apiClient } from './client';

export type SabcGrade = 'S' | 'A' | 'B' | 'C';
export type EvalDecision = 'PASS' | 'REVIEW' | 'FAIL';

export interface QualityEvalQueueItem {
  id: string;
  briefId: string;
  deliverableId: string | null;
  trigger: string;
  triggeredBy: string;
  l1Score: number;
  l2Score: number;
  l3Score: number;
  l4Score: number;
  compositeScore: number;
  grade: SabcGrade;
  decision: EvalDecision;
  gateReason: string;
  commercialWarning: boolean;
  disclaimerVersion: string;
  appealedAt: string | null;
  appealReason: string | null;
  appealDecision: string | null;
  appealResponderId: string | null;
  appealSummary: string | null;
  createdAt: string;
}

export interface QualityEvalQueueResponse {
  items: QualityEvalQueueItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardStats {
  totalCount: number;
  last7dCount: number;
  byGrade: Record<string, number>;
  byDecision: Record<string, number>;
  appealPending: number;
}

export type RolloutMode = 'off' | 'shadow' | 'active';

export interface RolloutConfig {
  mode: RolloutMode;
  rolloutPct: number;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export const qualityEvalAdminApi = {
  queue: (q: {
    grade?: SabcGrade;
    decision?: EvalDecision;
    briefId?: string;
    trigger?: string;
    page?: number;
    pageSize?: number;
  }) => apiClient.get<QualityEvalQueueResponse>('/admin/quality-eval/queue', { params: q }).then((r) => r.data),

  dashboard: () => apiClient.get<DashboardStats>('/admin/quality-eval/dashboard').then((r) => r.data),

  get: (id: string) => apiClient.get<QualityEvalQueueItem>(`/admin/quality-eval/${id}`).then((r) => r.data),

  appealDecision: (id: string, body: {
    appealDecision: 'overridden' | 'confirmed';
    appealSummary?: string;
    newScores?: number[];
  }) => apiClient.post(`/admin/quality-eval/${id}/appeal-decision`, body).then((r) => r.data),

  getRollout: () => apiClient.get<RolloutConfig>('/admin/quality-eval/rollout').then((r) => r.data),

  updateRollout: (body: {
    mode?: RolloutMode;
    rolloutPct?: number;
    note?: string;
  }) => apiClient.put<RolloutConfig>('/admin/quality-eval/rollout', body).then((r) => r.data),
};