/**
 * AI 助手 API client
 *
 * 调用 POST /api/v1/assistant/chat。
 * 鉴权由 apiClient 拦截器自动加 Bearer token (见 api/client.ts)。
 *
 * 历史 messages 不需要后端持久化(plan 里明确"前端 localStorage") — 由 useAssistant composable 管理。
 *
 * W6-R1 Intent Router 升级:
 *   - 响应新增 intent? / intentParams? / requiresConfirmation? 三个可选字段
 *   - 老字段 (reply / suggestedActions) 必返, 完全向后兼容
 */

import { apiClient } from './client';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  history?: ChatHistoryItem[];
  routeContext?: {
    route?: string;
    query?: Record<string, string>;
  };
}

export interface SuggestedAction {
  label: string;
  href: string;
}

export type IntentType =
  | 'LIST_BRIEFS'
  | 'CREATE_BRIEF'
  | 'SHOW_BID'
  | 'PLACE_BID'
  | 'ACCEPT_BID'
  | 'OPEN_WORKSPACE'
  | 'SHOW_WORKSPACE_STATUS'
  | 'UPLOAD_DELIVERABLE'
  | 'CREATE_REVIEW'
  | 'UPLOAD_IP'
  | 'KYC_SUBMIT'
  | 'NAVIGATE'
  | 'ASK_CLARIFICATION';

export interface ChatResponse {
  reply: string;
  suggestedActions: SuggestedAction[];
  /** 12 个之一 / null(无意图) / undefined(FAQ 命中走老路) */
  intent?: IntentType | null;
  /** Zod 校验通过的 params (例如 PLACE_BID 的 {briefId, price, deliveryDays, proposal}) */
  intentParams?: Record<string, unknown>;
  /** 写操作意图必须 UI 卡片确认才能落库 (R2 弹卡片用) */
  requiresConfirmation?: boolean;
}

export async function chatAssistant(req: ChatRequest): Promise<ChatResponse> {
  const r = await apiClient.post<ChatResponse>('/assistant/chat', req);
  return r.data;
}