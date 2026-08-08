/**
 * 买家发包 / 投标 API client
 *
 * W6-R2: IntentCard 弹 CREATE_BRIEF / LIST_BRIEFS / ACCEPT_BRIEFS 卡片时也用这里调接口。
 * 与 BriefNewPage.vue 共用同一组接口, 不为 chat 写第二份 API。
 *
 * API 路径 (NestJS controller 端 — apps/api/src/brief/brief.controller.ts + bid/bid.controller.ts):
 *   POST   /buyer/briefs                       — 新建发包 (CreateBriefDto)
 *   GET    /buyer/briefs?status=open|all       — 列出我自己的发包
 *   GET    /buyer/briefs/:id                   — 看发包详情
 *   PATCH  /buyer/briefs/:id                   — 改发包 (draft→bidding 状态机驱动)
 *   POST   /buyer/briefs/:briefId/bids/:bidId/accept — 接单 (BidController)
 *   GET    /buyer/briefs/:briefId/bids         — 列出某发包的所有投标
 */
import { apiClient } from './client';

export interface CreateBriefPayload {
  title: string;
  description?: string;
  category: string;
  platformSet: string[];
  ipIds: string[];
  budgetMin: number;
  budgetMax: number;
  packageTier: string;
  deadlineAt: string;
  attachments?: string[];
}

export interface BriefSummary {
  id: string;
  title: string;
  category: string;
  status: 'draft' | 'bidding' | 'in_progress' | 'delivered' | 'closed' | 'disputed';
  budgetMin: number;
  budgetMax: number;
  packageTier: string;
  deadlineAt: string;
  platformSet: string[];
  bidsCount?: number;
  createdAt: string;
}

export interface BriefDetail extends BriefSummary {
  description?: string;
  ipIds: string[];
  attachments?: string[];
  buyerId: string;
  updatedAt: string;
}

export interface BidSummary {
  id: string;
  briefId: string;
  creatorId: string;
  creatorName?: string;
  price: number;
  deliveryDays: number;
  proposal: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  createdAt: string;
}

export const buyerBriefsApi = {
  /** 创建发包 (POST /buyer/briefs) */
  async create(payload: CreateBriefPayload): Promise<BriefDetail> {
    const r = await apiClient.post<BriefDetail>('/buyer/briefs', payload);
    return r.data;
  },

  /** 列发包 (GET /buyer/briefs?status=bidding|draft|...)
 * 注: 这是**买家自己**的发包 (mypurchases) — 状态机枚举值
 */
  async list(params?: { status?: string; page?: number; size?: number }): Promise<{
    items: BriefSummary[];
    total: number;
    page: number;
    size: number;
  }> {
    const r = await apiClient.get<{
      items: BriefSummary[];
      total: number;
      page: number;
      size: number;
    }>('/buyer/briefs', { params });
    return r.data;
  },

  /** 发包详情 (GET /buyer/briefs/:id) */
  async get(id: string): Promise<BriefDetail> {
    const r = await apiClient.get<BriefDetail>(`/buyer/briefs/${id}`);
    return r.data;
  },

  /** 列某发包的投标 (GET /buyer/briefs/:briefId/bids) */
  async listBids(briefId: string): Promise<{ items: BidSummary[]; total: number }> {
    const r = await apiClient.get<{ items: BidSummary[]; total: number }>(
      `/buyer/briefs/${briefId}/bids`,
    );
    return r.data;
  },

  /** 接受投标 (POST /buyer/briefs/:briefId/bids/:bidId/accept) */
  async acceptBid(briefId: string, bidId: string): Promise<{ workspaceId: string }> {
    const r = await apiClient.post<{ workspaceId: string }>(
      `/buyer/briefs/${briefId}/bids/${bidId}/accept`,
    );
    return r.data;
  },

  /**
   * 关闭/撤回发包 (POST /buyer/briefs/:id/close)
   * W6-R5: 买家聊天意图 CLOSE_BRIEF 的执行入口
   * 服务端允许 draft/bidding/in_progress 状态关闭, 关闭后无法恢复
   */
  async close(id: string): Promise<{ id: string; status: string }> {
    const r = await apiClient.post<{ brief?: { id: string; status: string }; id?: string; status?: string }>(
      `/buyer/briefs/${id}/close`,
    );
    const data: any = r.data;
    return data?.brief ?? data;
  },

  /**
   * 更新发包 (PATCH /buyer/briefs/:id) — W6-R6 UPDATE_BRIEF
   * 只在 draft/bidding 状态可改; body 只含实际要改的字段 (避免空 PATCH)
   */
  async update(id: string, body: Partial<CreateBriefPayload>): Promise<BriefDetail> {
    const r = await apiClient.patch<{ brief?: BriefDetail } | BriefDetail>(
      `/buyer/briefs/${id}`,
      body,
    );
    const data: any = r.data;
    return data?.brief ?? data;
  },

  /** 发布发包 (POST /buyer/briefs/:id/publish) — W6-R6 PUBLISH_BRIEF, draft → bidding */
  async publish(id: string): Promise<{ id: string; status: string }> {
    const r = await apiClient.post<{ brief?: { id: string; status: string }; id?: string; status?: string }>(
      `/buyer/briefs/${id}/publish`,
    );
    const data: any = r.data;
    return data?.brief ?? data;
  },

  // ============ Creator 侧 ============

  /** 创作者浏览可抢单的 brief (GET /creator/briefs) */
  async listOpen(params?: { category?: string; page?: number; size?: number }): Promise<{
    items: BriefSummary[];
    total: number;
    page: number;
    size: number;
  }> {
    const r = await apiClient.get<{
      items: BriefSummary[];
      total: number;
      page: number;
      size: number;
    }>('/creator/briefs', { params });
    return r.data;
  },

  /** 创作者投标 (POST /creator/briefs/:briefId/bids) */
  async placeBid(
    briefId: string,
    body: { price: number; deliveryDays: number; proposal: string },
  ): Promise<BidSummary> {
    const r = await apiClient.post<{ bid?: BidSummary } | BidSummary>(
      `/creator/briefs/${briefId}/bids`,
      body,
    );
    const data: any = r.data;
    return data?.bid ?? data;
  },

  /** 创作者撤回投标 (POST /creator/briefs/:briefId/bids/:bidId/withdraw) — W6-R6 WITHDRAW_BID
   * 只有 pending 状态可撤; accepted 后服务端返 409 */
  async withdrawBid(briefId: string, bidId: string): Promise<BidSummary> {
    const r = await apiClient.post<{ bid?: BidSummary } | BidSummary>(
      `/creator/briefs/${briefId}/bids/${bidId}/withdraw`,
    );
    const data: any = r.data;
    return data?.bid ?? data;
  },
};
