/**
 * #30.6.26 Admin LLM Provider Config API.
 * 镜像 backend apps/api/src/llm-config/llm-config.controller.ts.
 * 列表里不返 apiKey 明文, 只返 apiKeyLast4 + apiKeyMasked. 编辑时再传完整 key.
 */
import { apiClient } from './client';

export type LlmProvider = 'minimax' | 'anthropic' | 'openai' | 'dashscope' | 'custom';

export interface LlmConfigRow {
  id: string;
  provider: LlmProvider;
  displayName: string;
  baseUrl: string;
  model: string;
  apiKeyLast4: string;
  isActive: boolean;
  activeAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number;
  model: string;
  error?: string;
}

export const llmConfigApi = {
  list: () => apiClient.get<LlmConfigRow[]>('/admin/llm-config').then((r) => r.data),

  get: (id: string) => apiClient.get<LlmConfigRow>(`/admin/llm-config/${id}`).then((r) => r.data),

  create: (body: {
    provider: LlmProvider;
    displayName: string;
    baseUrl: string;
    model: string;
    apiKey: string;
    note?: string;
    setActive?: boolean;
  }) => apiClient.post<LlmConfigRow>('/admin/llm-config', body).then((r) => r.data),

  update: (
    id: string,
    body: {
      provider?: LlmProvider;
      displayName?: string;
      baseUrl?: string;
      model?: string;
      apiKey?: string;
      note?: string;
    },
  ) => apiClient.put<LlmConfigRow>(`/admin/llm-config/${id}`, body).then((r) => r.data),

  remove: (id: string) => apiClient.delete<{ ok: true }>(`/admin/llm-config/${id}`).then((r) => r.data),

  setActive: (id: string) =>
    apiClient.post<LlmConfigRow>('/admin/llm-config/set-active', { id }).then((r) => r.data),

  test: (id: string) =>
    apiClient.post<TestConnectionResult>('/admin/llm-config/test', { id }).then((r) => r.data),
};
