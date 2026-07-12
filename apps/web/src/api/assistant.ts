/**
 * AI 助手 API client
 *
 * 调用 POST /api/v1/assistant/chat + /assistant/chat-with-attachments (W6-R7)。
 * 鉴权由 apiClient 拦截器自动加 Bearer token (见 api/client.ts)。
 *
 * 历史 messages 不需要后端持久化(plan 里明确"前端 localStorage") — 由 useAssistant composable 管理。
 *
 * W6-R1 Intent Router 升级:
 *   - 响应新增 intent? / intentParams? / requiresConfirmation? 三个可选字段
 *   - 老字段 (reply / suggestedActions) 必返, 完全向后兼容
 *
 * W6-R7:
 *   - 新增 OPEN_IP_LIBRARY intent
 *   - UPLOAD_IP params 扩 (tagline/gender/ageBucket/ethnicity/styleTags/scenarioTags 可选)
 *   - 新增 chatWithAttachments() — multipart/form-data 上传文件 + 多模态 LLM
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
  | 'CLOSE_BRIEF'
  | 'SHOW_BID'
  | 'PLACE_BID'
  | 'ACCEPT_BID'
  | 'OPEN_WORKSPACE'
  | 'SHOW_WORKSPACE_STATUS'
  | 'UPLOAD_DELIVERABLE'
  | 'CREATE_REVIEW'
  | 'UPLOAD_IP'
  | 'OPEN_IP_LIBRARY'
  | 'KYC_SUBMIT'
  | 'NAVIGATE'
  | 'ASK_CLARIFICATION'
  // W6-R6 Tier 1 (6 写意图) + Tier 4 (2 AI 工具)
  // ⚠ must stay in sync with backend apps/api/src/assistant/intent-schemas.ts IntentType
  | 'UPDATE_BRIEF'
  | 'PUBLISH_BRIEF'
  | 'WITHDRAW_BID'
  | 'SUBMIT_WORKSPACE'
  | 'APPROVE_WORKSPACE'
  | 'REQUEST_REVISION'
  | 'REVIEW_DELIVERABLE'
  | 'RUN_VIDEO_GEN'
  | 'RUN_BLUEPRINT_GEN';

export interface ChatResponse {
  reply: string;
  suggestedActions: SuggestedAction[];
  /** 25 个之一 / null(无意图) / undefined(FAQ 命中走老路) */
  intent?: IntentType | null;
  /** Zod 校验通过的 params (例如 PLACE_BID 的 {briefId, price, deliveryDays, proposal}) */
  intentParams?: Record<string, unknown>;
  /** 写操作意图必须 UI 卡片确认才能落库 (R2 弹卡片用) */
  requiresConfirmation?: boolean;
  /** W6-R7: 聊天附件快照 — 上传 OSS 后回填, 展示在 chat 气泡 */
  attachments?: ChatAttachment[];
}

export interface ChatAttachment {
  ossKey: string;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  publicUrl: string;
}

export async function chatAssistant(req: ChatRequest): Promise<ChatResponse> {
  const r = await apiClient.post<ChatResponse>('/assistant/chat', req);
  return r.data;
}

/**
 * W6-R7: 多模态 chat — multipart/form-data 上传 files + 文字 message
 *
 * 用法:
 *   await chatWithAttachments({
 *     message: '看看这张脸帮我写人物小传',
 *     files: [fileInput.files[0]],
 *     history: [...],
 *     routeContext: { route: '/creator/chat' },
 *   })
 *
 * 限制: 最多 5 文件, 单文件 50MB (后端 FileInterceptor 限制)
 */
export async function chatWithAttachments(req: {
  message: string;
  files: File[];
  history?: ChatHistoryItem[];
  routeContext?: ChatRequest['routeContext'];
}): Promise<ChatResponse> {
  const form = new FormData();
  form.append('message', req.message);
  if (req.history) form.append('historyRaw', JSON.stringify(req.history));
  if (req.routeContext) form.append('routeContextRaw', JSON.stringify(req.routeContext));
  for (const f of req.files) {
    form.append('files', f, f.name);
  }
  const r = await apiClient.post<ChatResponse>('/assistant/chat-with-attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60_000, // 多模态 + 多文件 → 放宽到 60s
  });
  return r.data;
}