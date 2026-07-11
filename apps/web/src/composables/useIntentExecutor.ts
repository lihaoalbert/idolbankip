/**
 * W6-R2 Intent Executor — 把 intent+intentParams 真正落到对应写接口
 *
 * 设计:
 *   - 单 composable, 任何含 intent 的消息气泡都能用
 *   - execute(messageId): 根据 message.intent + message.intentParams 路由执行
 *   - 写操作先调 setIntentStatus('executing'), 落库成功后 'success' + 跳目标页, 失败 'error'
 *   - 不直连数据库, 全部走 /api/v1/* JSON
 *
 * 支持 (R2 buyer 4 类):
 *   - CREATE_BRIEF   — POST /buyer/briefs, 成功后跳 /buyer/briefs/:id
 *   - LIST_BRIEFS    — GET  /buyer/briefs, 结果展示在 results pane (R2.5 不在这里, 这个 intent 不需要执行)
 *   - ACCEPT_BID     — POST /buyer/briefs/:briefId/bids/:bidId/accept, 成功后跳 /buyer/workspace/:workspaceId
 *   - ASK_CLARIFICATION — 不调接口, prompt.user 已经在 reply 里看到追问, 不需要执行
 *   - NAVIGATE       — 直接 router.push(route)
 *
 * 写操作的失败:
 *   - 网络 5xx/4xx: setIntentStatus('error', message: <err>)
 *   - 用户点 [取消] / 关闭卡片: setIntentStatus('cancelled')
 */

import { useRouter } from 'vue-router';
import { buyerBriefsApi } from '@/api/briefs';
import { useAssistant } from '@/composables/useAssistant';
import type { IntentType } from '@/api/assistant';

export type ExecuteOutcome =
  | { kind: 'success'; briefId?: string; workspaceId?: string }
  | { kind: 'cancelled' }
  | { kind: 'no-op' }
  | { kind: 'error'; reason: string };

export function useIntentExecutor() {
  const router = useRouter();
  const { setIntentStatus } = useAssistant();

  function pickNumber(v: unknown): number | undefined {
    return typeof v === 'number' ? v : undefined;
  }
  function pickString(v: unknown): string | undefined {
    return typeof v === 'string' ? v : undefined;
  }
  function pickStringArray(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  }

  async function execute(
    messageId: string,
    intent: IntentType | null | undefined,
    params: Record<string, unknown> | undefined,
  ): Promise<ExecuteOutcome> {
    if (!intent) return { kind: 'no-op' };

    setIntentStatus(messageId, 'executing');

    try {
      switch (intent) {
        case 'CREATE_BRIEF': {
          const title = pickString(params?.title);
          const category = pickString(params?.category);
          const platformSet = pickStringArray(params?.platformSet);
          const ipIds = pickStringArray(params?.ipIds);
          const packageTier = pickString(params?.packageTier);
          const deadlineAt = pickString(params?.deadlineAt);
          const budgetMin = pickNumber(params?.budgetMin) ?? 0;
          const budgetMax = pickNumber(params?.budgetMax) ?? 0;

          if (!title || !category || platformSet.length === 0 || !packageTier || !deadlineAt) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'params 缺失, 无法创建发包(请按 ASK_CLARIFICATION 追问补全)' };
          }

          const brief = await buyerBriefsApi.create({
            title,
            description: pickString(params?.description),
            category,
            platformSet,
            ipIds,
            budgetMin,
            budgetMax,
            packageTier,
            deadlineAt,
            attachments: pickStringArray(params?.attachments),
          });

          setIntentStatus(messageId, 'success', { briefId: brief.id });
          return { kind: 'success', briefId: brief.id };
        }

        case 'ACCEPT_BID': {
          const briefId = pickString(params?.briefId);
          const bidId = pickString(params?.bidId);
          if (!briefId || !bidId) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'briefId 或 bidId 缺失' };
          }
          const out = await buyerBriefsApi.acceptBid(briefId, bidId);
          setIntentStatus(messageId, 'success', {
            briefId,
            workspaceId: out.workspaceId,
          });
          return { kind: 'success', briefId, workspaceId: out.workspaceId };
        }

        case 'NAVIGATE': {
          const route = pickString(params?.route);
          if (!route) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'route 缺失' };
          }
          await router.push(route);
          setIntentStatus(messageId, 'success');
          return { kind: 'success' };
        }

        case 'LIST_BRIEFS':
        case 'SHOW_BID':
        case 'OPEN_WORKSPACE':
        case 'SHOW_WORKSPACE_STATUS':
          // R2 不执行只读 — 它们走 suggestedActions, 不走 intent 卡片执行
          setIntentStatus(messageId, 'cancelled');
          return { kind: 'no-op' };

        case 'ASK_CLARIFICATION':
          // 追问不调接口 — reply 已经有追问句, 用户直接在 input 里回答即可
          setIntentStatus(messageId, 'cancelled');
          return { kind: 'no-op' };

        case 'PLACE_BID':
        case 'UPLOAD_DELIVERABLE':
        case 'CREATE_REVIEW':
        case 'UPLOAD_IP':
        case 'KYC_SUBMIT':
          // R3 creator 才接 (PLACE_BID/UPLOAD_DELIVERABLE/CREATE_REVIEW/UPLOAD_IP/KYC_SUBMIT),
          // 在 buyer chat 里碰到这些 intent → 角色不匹配, 视为 cancelled
          setIntentStatus(messageId, 'cancelled');
          return { kind: 'no-op' };

        default:
          setIntentStatus(messageId, 'cancelled');
          return { kind: 'no-op' };
      }
    } catch (e: any) {
      const reason =
        e?.response?.data?.message ?? e?.message ?? '执行失败, 请稍后再试';
      setIntentStatus(messageId, 'error');
      return { kind: 'error', reason };
    }
  }

  function cancel(messageId: string) {
    setIntentStatus(messageId, 'cancelled');
  }

  return { execute, cancel };
}
