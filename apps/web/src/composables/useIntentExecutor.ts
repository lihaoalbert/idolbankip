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
import { useAuthStore } from '@/stores/auth';
import { buyerBriefsApi } from '@/api/briefs';
import { creatorDeliverableApi } from '@/api/deliverables';
import { reviewApi } from '@/api/reviews';
import { useAssistant } from '@/composables/useAssistant';
import type { IntentType } from '@/api/assistant';

export type ExecuteOutcome =
  | {
      kind: 'success';
      briefId?: string;
      workspaceId?: string;
      bidId?: string;
      deliverableId?: string;
      reviewId?: string;
    }
  | { kind: 'cancelled' }
  | { kind: 'no-op' }
  | { kind: 'error'; reason: string };

export function useIntentExecutor() {
  const router = useRouter();
  const auth = useAuthStore();
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
        // ============ Buyer 写 (R2) ============
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

        // ============ Creator 写 (R3) ============
        case 'PLACE_BID': {
          const briefId = pickString(params?.briefId);
          const price = pickNumber(params?.price);
          const deliveryDays = pickNumber(params?.deliveryDays);
          const proposal = pickString(params?.proposal);

          if (!briefId || !price || !deliveryDays || !proposal) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'params 缺失 (briefId/price/deliveryDays/proposal)' };
          }

          const bid = await buyerBriefsApi.placeBid(briefId, { price, deliveryDays, proposal });
          setIntentStatus(messageId, 'success', { briefId });
          return { kind: 'success', briefId, bidId: bid.id };
        }

        case 'UPLOAD_DELIVERABLE': {
          const workspaceId = pickString(params?.workspaceId);
          const type = pickString(params?.type);
          const platform = pickString(params?.platform);
          const url = pickString(params?.url);
          const thumbnailUrl = pickString(params?.thumbnailUrl);

          if (!workspaceId || !type || !platform || !url) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'params 缺失 (workspaceId/type/platform/url)' };
          }

          const d = await creatorDeliverableApi.create({
            workspaceId,
            type: type as any,
            platform,
            url,
            thumbnailUrl,
            spec: {},
          });
          setIntentStatus(messageId, 'success', { workspaceId });
          return { kind: 'success', workspaceId, deliverableId: d.id };
        }

        case 'CREATE_REVIEW': {
          const briefId = pickString(params?.briefId);
          const rating = pickNumber(params?.rating);
          const content = pickString(params?.content);
          const tags = pickStringArray(params?.tags);

          if (!briefId || !rating || !content) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'params 缺失 (briefId/rating/content)' };
          }

          // role 由调用方角色决定 — buyer 时 buyer_to_creator, creator 时 creator_to_buyer
          const role = auth.user?.roles?.includes('CREATOR') ? 'creator_to_buyer' : 'buyer_to_creator';
          if (role === 'buyer_to_creator' && !auth.user?.roles?.includes('BUYER')) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: '当前角色无法写 buyer 评价' };
          }

          const r = await reviewApi.create({ briefId, role, rating, content, tags });
          setIntentStatus(messageId, 'success', { briefId });
          return { kind: 'success', briefId, reviewId: r.id };
        }

        // ============ 只读 + 导航 (R2) ============
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

        // ============ 其它 — 既不是 buyer 也不是 creator 该处理的 ============
        case 'UPLOAD_IP':
        case 'KYC_SUBMIT':
          // 这俩是 creator 路径上的 (R3 后期接), 但通常在 buyer chat 不应出现
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
