// FaceBlueprint API client — Phase 1 Layered Prompt Generator
// 后端实现在 apps/api/src/blueprint/(stub,Phase B 换 Prisma)
//
// 为何不用 zod: stub 阶段形状随时会变,等 Phase B 落库后引入 zod schema 共享.

import { apiClient } from './client';

export const BLUEPRINT_LAYERS = [
  'L1_skeleton',
  'L2_softTissue',
  'L3_features',
  'L4_skin',
  'L5_hair',
  'L6_decoration',
  'L7_render',
  'L8_evaluation',
] as const;

export type LayerKey = (typeof BLUEPRINT_LAYERS)[number];

export interface Blueprint {
  id: string;
  ownerId: string;
  ipId: string | null;
  title: string | null;
  description: string | null;
  tags: string;
  version: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  layers: Record<LayerKey, Record<string, unknown> | null>;
}

export interface EvaluationScores {
  originality: number;
  consistency: number;
  aesthetics: number;
}

export interface EvaluationResult {
  id: string;
  scores: EvaluationScores;
  evaluated_at: string;
}

export const blueprintApi = {
  create(body?: { title?: string; description?: string; tags?: string; ownerId?: string }) {
    return apiClient.post<Blueprint>('/blueprint', body ?? {}).then((r) => r.data);
  },
  get(id: string) {
    return apiClient.get<Blueprint>(`/blueprint/${id}`).then((r) => r.data);
  },
  updateLayer(id: string, step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, data: Record<string, unknown>) {
    return apiClient
      .patch<Blueprint>(`/blueprint/${id}/step/${step}`, { data })
      .then((r) => r.data);
  },
  evaluate(id: string) {
    return apiClient
      .post<EvaluationResult>(`/blueprint/${id}/evaluate`)
      .then((r) => r.data);
  },
};

// 步骤号 → 层 key(前后端共用一套规则,跟后端 blueprint.service.ts BLUEPRINT_LAYERS 对齐)
export function stepToLayer(step: number): LayerKey | null {
  if (step < 1 || step > BLUEPRINT_LAYERS.length) return null;
  return BLUEPRINT_LAYERS[step - 1];
}