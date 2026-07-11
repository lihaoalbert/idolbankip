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

  /** 列发包 (GET /buyer/briefs?status=open|all) */
  async list(params?: { status?: 'open' | 'all'; page?: number; size?: number }): Promise<{
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
};
