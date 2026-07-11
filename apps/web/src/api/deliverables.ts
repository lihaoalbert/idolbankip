/**
 * Deliverable API client — 创作者上传交付物 + 买家审核
 *
 * R3 IntentCard UPLOAD_DELIVERABLE 用 POST /creator/workspaces/:wsId/deliverables。
 * 注意: spec 字段是 Record<string, unknown>, 创作者根据 type(video/image/...) 自己塞字段。
 */
import { apiClient } from './client';

export interface DeliverableInput {
  workspaceId: string;
  type: 'video' | 'image' | 'audio' | 'model_3d' | 'live2d';
  platform: string;
  url: string;
  thumbnailUrl?: string;
  spec?: Record<string, unknown>;
}

export interface Deliverable {
  id: string;
  workspaceId: string;
  creatorId: string;
  type: string;
  platform: string;
  url: string;
  thumbnailUrl: string | null;
  spec: Record<string, unknown>;
  status: 'pending_review' | 'approved' | 'rejected' | 'published';
  createdAt: string;
}

export const creatorDeliverableApi = {
  /** 创作者上传交付物 (POST /creator/workspaces/:workspaceId/deliverables) */
  async create(input: DeliverableInput): Promise<Deliverable> {
    const r = await apiClient.post<{ deliverable: Deliverable }>(
      `/creator/workspaces/${input.workspaceId}/deliverables`,
      {
        type: input.type,
        platform: input.platform,
        url: input.url,
        thumbnailUrl: input.thumbnailUrl,
        spec: input.spec ?? {},
      },
    );
    return r.data.deliverable;
  },

  /** 列某 workspace 的所有 deliverable */
  async list(workspaceId: string): Promise<{ items: Deliverable[]; total: number }> {
    const r = await apiClient.get<{ items: Deliverable[]; total: number }>(
      `/creator/workspaces/${workspaceId}/deliverables`,
    );
    return r.data;
  },
};
