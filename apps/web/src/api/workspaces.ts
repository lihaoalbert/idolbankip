/**
 * Workspace API client — W6-R6 三态写操作 (SUBMIT / APPROVE / REQUEST_REVISION)
 *
 * 后端 controller (apps/api/src/workspace/workspace.controller.ts):
 *   POST /creator/workspaces/:id/submit    — 创作者提交 (active/revision → submitted)
 *   POST /buyer/workspaces/:id/approve      — 买家通过 (submitted → approved)
 *   POST /buyer/workspaces/:id/revision     — 买家打回 (submitted → revision, revisionCount++)
 *
 * 三端点都返 { workspace }。requestRevision 后端不收 body — reason 只在聊天卡片展示。
 */
import { apiClient } from './client';

export interface Workspace {
  id: string;
  briefId: string;
  buyerId: string;
  creatorId: string;
  status: 'active' | 'submitted' | 'approved' | 'revision';
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
}

function unwrap(data: any): Workspace {
  return data?.workspace ?? data;
}

export const workspacesApi = {
  /** 创作者提交工作区 (POST /creator/workspaces/:id/submit) */
  async submit(id: string): Promise<Workspace> {
    const r = await apiClient.post<{ workspace?: Workspace } | Workspace>(
      `/creator/workspaces/${id}/submit`,
    );
    return unwrap(r.data);
  },

  /** 买家通过工作区 (POST /buyer/workspaces/:id/approve) */
  async approve(id: string): Promise<Workspace> {
    const r = await apiClient.post<{ workspace?: Workspace } | Workspace>(
      `/buyer/workspaces/${id}/approve`,
    );
    return unwrap(r.data);
  },

  /** 买家打回工作区 (POST /buyer/workspaces/:id/revision)
   * reason 仅前端卡片展示, 后端 endpoint 不收 body */
  async requestRevision(id: string, _reason?: string): Promise<Workspace> {
    const r = await apiClient.post<{ workspace?: Workspace } | Workspace>(
      `/buyer/workspaces/${id}/revision`,
    );
    return unwrap(r.data);
  },
};
