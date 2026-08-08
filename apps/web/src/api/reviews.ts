/**
 * Review API client — 评价
 *
 * R3 IntentCard CREATE_REVIEW 用 POST /briefs/:briefId/reviews.
 * role: 'buyer_to_creator' | 'creator_to_buyer' — 由调用方身份决定
 */
import { apiClient } from './client';

export type ReviewRole = 'buyer_to_creator' | 'creator_to_buyer';

export interface CreateReviewPayload {
  briefId: string;
  role: ReviewRole;
  rating: number;
  content: string;
  tags?: string[];
}

export interface Review {
  id: string;
  briefId: string;
  reviewerId: string;
  revieweeId: string;
  role: ReviewRole;
  rating: number;
  content: string;
  tags: string[];
  createdAt: string;
}

export const reviewApi = {
  /** 写评价 (POST /briefs/:briefId/reviews) */
  async create(payload: CreateReviewPayload): Promise<Review> {
    const r = await apiClient.post<{ review: Review }>(
      `/briefs/${payload.briefId}/reviews`,
      {
        role: payload.role,
        rating: payload.rating,
        content: payload.content,
        tags: payload.tags,
      },
    );
    return r.data.review;
  },

  /** 列某 brief 的所有评价 */
  async listByBrief(briefId: string): Promise<{ items: Review[]; total: number }> {
    const r = await apiClient.get<{ items: Review[]; total: number }>(`/briefs/${briefId}/reviews`);
    return r.data;
  },
};
