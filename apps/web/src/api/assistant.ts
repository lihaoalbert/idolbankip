/**
 * AI 助手 API client
 *
 * 调用 POST /api/v1/assistant/chat — 后端只返回 { reply, suggestedActions }。
 * 鉴权由 apiClient 拦截器自动加 Bearer token (见 api/client.ts)。
 *
 * 历史 messages 不需要后端持久化(plan 里明确"前端 localStorage") — 由 useAssistant composable 管理。
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

export interface ChatResponse {
  reply: string;
  suggestedActions: SuggestedAction[];
}

export async function chatAssistant(req: ChatRequest): Promise<ChatResponse> {
  const r = await apiClient.post<ChatResponse>('/assistant/chat', req);
  return r.data;
}