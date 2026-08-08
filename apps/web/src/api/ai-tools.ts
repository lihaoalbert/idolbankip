/**
 * AI 工具 API client — W6-R6 Tier 4 (RUN_VIDEO_GEN)
 *
 * 后端 controller (apps/api/src/ai-tools/ai-tools.controller.ts):
 *   POST /creator/workspaces/:workspaceId/generate          — 调用 AI 工具生成 (返 { record })
 *   GET  /creator/workspaces/:workspaceId/generations       — 列生成记录 (返 { items, total, totalCostCents })
 *   GET  /creator/workspaces/:workspaceId/tools/preflight    — 单次成本预估 (返 { estimate })
 *
 * 成本单位: costCents (人民币分), ¥ = costCents / 100。
 * 生成走 chat 触发时, executor 先 preflight 估成本, 超阈值 (VITE_MAX_AI_TOOL_COST_CNY) 拒绝。
 */
import { apiClient } from './client';

export type VideoToolName = 'sora' | 'kling' | 'jimeng' | 'runway';

export interface GenerationRecord {
  id: string;
  workspaceId: string;
  toolName: string;
  modelName: string;
  prompt: string;
  outputUrl: string | null;
  costCents: number;
  durationMs: number;
  status: 'success' | 'failed' | 'timeout';
  errorMsg: string | null;
  createdAt: string;
}

export interface GenerateVideoInput {
  toolName: VideoToolName;
  prompt: string;
  durationSec?: number;
  resolution?: string;
  imageCount?: number;
}

export interface CostEstimate {
  costCents: number;
  unit: string;
  durationSec: number;
  imageCount: number;
}

export const aiToolsApi = {
  /** 生成视频/图片 (POST /creator/workspaces/:workspaceId/generate) */
  async generateVideo(
    workspaceId: string,
    input: GenerateVideoInput,
  ): Promise<{ record: GenerationRecord }> {
    const r = await apiClient.post<{ record: GenerationRecord }>(
      `/creator/workspaces/${workspaceId}/generate`,
      input,
    );
    return r.data;
  },

  /** 单次调用成本预估 (GET /creator/workspaces/:workspaceId/tools/preflight) */
  async preflightVideo(
    workspaceId: string,
    toolName: VideoToolName,
    opts?: { durationSec?: number; imageCount?: number },
  ): Promise<{ estimate: CostEstimate }> {
    const r = await apiClient.get<{ estimate: CostEstimate }>(
      `/creator/workspaces/${workspaceId}/tools/preflight`,
      { params: { toolName, ...opts } },
    );
    return r.data;
  },

  /** 列生成记录 (GET /creator/workspaces/:workspaceId/generations) */
  async listGenerations(
    workspaceId: string,
    params?: { page?: number; size?: number; toolName?: string },
  ): Promise<{ items: GenerationRecord[]; total: number; totalCostCents: number }> {
    const r = await apiClient.get<{
      items: GenerationRecord[];
      total: number;
      totalCostCents: number;
    }>(`/creator/workspaces/${workspaceId}/generations`, { params });
    return r.data;
  },
};
