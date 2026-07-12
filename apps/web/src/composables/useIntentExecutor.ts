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
import { creatorDeliverableApi, buyerDeliverableApi } from '@/api/deliverables';
import { reviewApi } from '@/api/reviews';
import { workspacesApi } from '@/api/workspaces';
import { aiToolsApi, type VideoToolName } from '@/api/ai-tools';
import { blueprintApi } from '@/api/blueprint';
import { useBlueprintFeatureFlag } from '@/composables/useBlueprintFeatureFlag';
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
      generationRecordId?: string;
      toolName?: string;
    }
  | { kind: 'cancelled' }
  | { kind: 'no-op' }
  | { kind: 'error'; reason: string };

/** RUN_VIDEO_GEN 成本上限 (¥), 超过 executor 拒绝 — 放 env 便于调 */
const MAX_AI_TOOL_COST_CNY = Number(import.meta.env.VITE_MAX_AI_TOOL_COST_CNY ?? '5');

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

        case 'CLOSE_BRIEF': {
          // W6-R5: 买家撤回/关闭发包
          const briefId = pickString(params?.briefId);
          if (!briefId) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'briefId 缺失 — 需要告诉我哪个发包要关闭' };
          }
          await buyerBriefsApi.close(briefId);
          setIntentStatus(messageId, 'success', { briefId });
          return { kind: 'success', briefId };
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

        // ============ W6-R6 Tier 1: 6 写意图 ============
        case 'UPDATE_BRIEF': {
          const id = pickString(params?.id);
          if (!id) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'briefId 缺失 — 需要告诉我改哪个发包' };
          }
          // 只把 params 里实际出现的字段塞进 body, 避免空 PATCH / 覆盖成 undefined
          const body: Record<string, unknown> = {};
          const title = pickString(params?.title);
          const description = pickString(params?.description);
          const platformSet = pickStringArray(params?.platformSet);
          const budgetMin = pickNumber(params?.budgetMin);
          const budgetMax = pickNumber(params?.budgetMax);
          const packageTier = pickString(params?.packageTier);
          const deadlineAt = pickString(params?.deadlineAt);
          if (title !== undefined) body.title = title;
          if (description !== undefined) body.description = description;
          if (params?.platformSet !== undefined && platformSet.length > 0) body.platformSet = platformSet;
          if (budgetMin !== undefined) body.budgetMin = budgetMin;
          if (budgetMax !== undefined) body.budgetMax = budgetMax;
          if (packageTier !== undefined) body.packageTier = packageTier;
          if (deadlineAt !== undefined) body.deadlineAt = deadlineAt;

          if (Object.keys(body).length === 0) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: '没有可更新的字段 — 告诉我要改标题/预算/平台里的哪一项' };
          }
          await buyerBriefsApi.update(id, body);
          setIntentStatus(messageId, 'success', { briefId: id });
          return { kind: 'success', briefId: id };
        }

        case 'PUBLISH_BRIEF': {
          const id = pickString(params?.id);
          if (!id) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'briefId 缺失 — 需要告诉我发布哪个发包' };
          }
          await buyerBriefsApi.publish(id);
          setIntentStatus(messageId, 'success', { briefId: id });
          return { kind: 'success', briefId: id };
        }

        case 'WITHDRAW_BID': {
          const briefId = pickString(params?.briefId);
          const bidId = pickString(params?.bidId);
          if (!briefId || !bidId) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'briefId 或 bidId 缺失 — 撤回投标需要这两个 ID' };
          }
          const bid = await buyerBriefsApi.withdrawBid(briefId, bidId);
          setIntentStatus(messageId, 'success', { briefId });
          return { kind: 'success', briefId, bidId: bid.id };
        }

        case 'SUBMIT_WORKSPACE': {
          const id = pickString(params?.id) ?? pickString(params?.workspaceId);
          if (!id) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'workspaceId 缺失' };
          }
          await workspacesApi.submit(id);
          setIntentStatus(messageId, 'success', { workspaceId: id });
          return { kind: 'success', workspaceId: id };
        }

        case 'APPROVE_WORKSPACE': {
          const id = pickString(params?.id) ?? pickString(params?.workspaceId);
          if (!id) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'workspaceId 缺失' };
          }
          await workspacesApi.approve(id);
          setIntentStatus(messageId, 'success', { workspaceId: id });
          return { kind: 'success', workspaceId: id };
        }

        case 'REQUEST_REVISION': {
          const id = pickString(params?.id) ?? pickString(params?.workspaceId);
          if (!id) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'workspaceId 缺失' };
          }
          await workspacesApi.requestRevision(id, pickString(params?.reason));
          setIntentStatus(messageId, 'success', { workspaceId: id });
          return { kind: 'success', workspaceId: id };
        }

        case 'REVIEW_DELIVERABLE': {
          const deliverableId = pickString(params?.deliverableId);
          const decision = pickString(params?.decision);
          if (!deliverableId || (decision !== 'approved' && decision !== 'rejected')) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'params 缺失 (deliverableId + decision=approved|rejected)' };
          }
          const rejectedReason = pickString(params?.rejectedReason);
          const d = await buyerDeliverableApi.review(deliverableId, decision, rejectedReason);
          setIntentStatus(messageId, 'success', { deliverableId, workspaceId: d.workspaceId });
          return { kind: 'success', deliverableId, workspaceId: d.workspaceId };
        }

        // ============ W6-R6 Tier 4: 2 AI 工具调用 ============
        case 'RUN_VIDEO_GEN': {
          const workspaceId = pickString(params?.workspaceId);
          const toolName = pickString(params?.toolName) as VideoToolName | undefined;
          const prompt = pickString(params?.prompt);
          const durationSec = pickNumber(params?.durationSec);
          const resolution = pickString(params?.resolution);
          const imageCount = pickNumber(params?.imageCount);
          if (!workspaceId || !toolName || !prompt) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'params 缺失 (workspaceId/toolName/prompt)' };
          }

          // 1) 先 preflight 估成本, 超阈值拒绝 (防成本失控)
          try {
            const { estimate } = await aiToolsApi.preflightVideo(workspaceId, toolName, {
              durationSec,
              imageCount,
            });
            const cny = (estimate?.costCents ?? 0) / 100;
            if (cny > MAX_AI_TOOL_COST_CNY) {
              setIntentStatus(messageId, 'error');
              return {
                kind: 'error',
                reason: `预估成本 ¥${cny.toFixed(2)} 超过单次上限 ¥${MAX_AI_TOOL_COST_CNY.toFixed(2)}, 请缩短时长或减少数量`,
              };
            }
          } catch {
            /* preflight 失败不阻断 — 后端 generate 会再校验 */
          }

          // 2) 生成
          const { record } = await aiToolsApi.generateVideo(workspaceId, {
            toolName,
            prompt,
            durationSec,
            resolution,
            imageCount,
          });
          setIntentStatus(messageId, 'success', {
            workspaceId,
            generationRecordId: record.id,
          });
          return { kind: 'success', workspaceId, generationRecordId: record.id, toolName };
        }

        case 'RUN_BLUEPRINT_GEN': {
          const prompt = pickString(params?.prompt);
          if (!prompt) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'prompt 缺失 — 告诉我要生成什么样的脸/风格' };
          }
          const { enabled } = useBlueprintFeatureFlag();
          if (!enabled.value) {
            setIntentStatus(messageId, 'error');
            return { kind: 'error', reason: 'Blueprint Wizard 当前未启用' };
          }
          const title = pickString(params?.title) ?? prompt.slice(0, 60);
          const tags = pickStringArray(params?.tags);
          const bp = await blueprintApi.create({
            title,
            description: prompt,
            tags: tags.length > 0 ? tags.join(',') : undefined,
          });
          setIntentStatus(messageId, 'success', { generationRecordId: bp.id });
          return { kind: 'success', generationRecordId: bp.id };
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
