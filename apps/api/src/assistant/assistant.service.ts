/**
 * AI 助手 — POST /assistant/chat 主入口
 *
 * W6-R1 Intent Router 升级:
 *   - 不只返 reply + suggestedActions, 还返 intent + intentParams + requiresConfirmation
 *   - R1 只产出意图 (LLM 分析), 不真调写接口 (R2 前端消费这些字段弹卡片)
 *
 * 流程:
 *   1. FAQ 命中 → 返原结构 (intent=undefined, FAQ 走 reply+actions 老路)
 *   2. 注入检测 → 命中返 OOS (intent=null)
 *   3. 调 LLM (temperature=0, maxTokens=600) 拿 JSON {reply, intent, intentParams, requires_confirmation, actions}
 *   4. parseAndSanitize:
 *      - JSON 失败 → friendly fallback (intent=null)
 *      - OOS 标记 ([OOS]) → OUT_OF_SCOPE_REPLY (intent=null)
 *      - actions.href 白名单校验 (老规则)
 *   5. parseIntent(intent, intentParams):
 *      - intent 不在白名单 → intent=null
 *      - params 校验失败 → intent=null
 *      - 通过 → 写到 ChatResult
 *   6. 写 AssistantCallLog (含 intent + requiresConfirmation)
 *
 * 边界: 助手不调任何写接口 — R1 纯分析; 写操作由前端拿 intent 后弹卡片确认再调
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ChatDto } from './dto/chat.dto';
import { hasRole, UserRole } from '../common/util/roles.util';
import {
  CREATOR_SYSTEM_PROMPT,
  BUYER_SYSTEM_PROMPT,
  CTA_DYNAMIC_PATTERNS,
  CTA_WHITELIST,
  OUT_OF_SCOPE_REPLY,
} from './prompts';
import { matchFaq } from './faq';
import {
  IntentType,
  parseIntent,
  looksLikeInjection,
  tryParseLlmJson,
  isBusinessIntentMessage,
} from './intent-schemas';

const HISTORY_LIMIT = 20;

/** R9.1: 多轮 slot 累积状态 — 当用户首次进 CREATE_BRIEF 流程但字段不全时,
 *  LLM 选 ASK_CLARIFICATION, 服务端把已抽到的 partial slots 存起来,
 *  下轮 user 给齐字段 → merge 进新 intentParams → parseIntent 通过 → 弹卡片。
 *  TTL 30 分钟, 复合 key (`${userId}:${sessionId}`) 跨账号隔离。 */
const SESSION_TTL_MS = 30 * 60 * 1000;

/** 哪些 intent 是"需要累积 slot 才能提交"的 — 仅对这些 intent 维护 pending state。
 *  其它 intent (LIST_BRIEFS/NAVIGATE/ANSWER/...) 单轮就完成, 不需要状态。 */
const SLOT_ACCUMULATING_INTENTS: ReadonlySet<IntentType> = new Set<IntentType>([
  'CREATE_BRIEF',
  'UPDATE_BRIEF',
  'UPLOAD_IP',
  'PLACE_BID',
  'RUN_VIDEO_GEN',
  'RUN_BLUEPRINT_GEN',
]);

interface PendingIntentState {
  intent: IntentType;
  slots: Record<string, unknown>;
  expiresAt: number;
}

export interface SuggestedAction {
  label: string;
  href: string;
}

export interface ChatResult {
  reply: string;
  suggestedActions: SuggestedAction[];
  /** 12 个 IntentType 之一 / null(无意图)/ undefined(FAQ 命中) */
  intent?: IntentType | null;
  intentParams?: Record<string, unknown>;
  /** 写操作意图必须 UI 卡片确认才能落库 */
  requiresConfirmation?: boolean;
  /** W6-R7: 聊天附件快照 — 上传 OSS 后给前端回填 chip / 下载入口 */
  attachments?: ChatAttachment[];
}

export interface ChatAttachment {
  /** 前端缓存 key — 不可靠,刷新失效 */
  ossKey: string;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  /** public 桶直传 URL — 给前端展示 + LLM 引用 */
  publicUrl: string;
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  /** R9.1: 多轮 slot 累积内存表 — key = `${userId}:${sessionId}`。
   *  MVP 用内存, 进程重启丢状态 (TTL 30 分钟够用); 真上线再换 Redis。
   *  加 composite key 防止跨账号状态污染。 */
  private readonly sessions = new Map<string, PendingIntentState>();

  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
  ) {}

  /** R9.1: composite session key — 同 userId 换 sessionId 视作新会话。 */
  private getSessionKey(userId: string, sessionId: string | undefined): string | null {
    if (!sessionId || sessionId.length === 0 || sessionId.length > 64) return null;
    return `${userId}:${sessionId}`;
  }

  /** R9.1: 每轮 chat 入口扫一遍 — 清掉过期 pending state, 防内存泄漏。 */
  private sweepExpiredSessions(now: number = Date.now()): void {
    for (const [k, v] of this.sessions.entries()) {
      if (v.expiresAt <= now) this.sessions.delete(k);
    }
  }

  /** R9.1: 取 pending state + 续约 TTL。 */
  private getPendingState(key: string | null): PendingIntentState | null {
    if (!key) return null;
    const state = this.sessions.get(key);
    if (!state) return null;
    if (state.expiresAt <= Date.now()) {
      this.sessions.delete(key);
      return null;
    }
    // 续约 — 命中即把 TTL 推后, 保证活跃会话不丢
    state.expiresAt = Date.now() + SESSION_TTL_MS;
    return state;
  }

  /** R9.1: merge pending.slots 到新 params (新值覆盖) — 用于多轮累积。 */
  private mergeSlots(
    pending: PendingIntentState | null,
    intent: IntentType,
    newParams: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!pending || pending.intent !== intent) return newParams;
    const merged: Record<string, unknown> = { ...pending.slots };
    for (const [k, v] of Object.entries(newParams)) {
      if (v !== undefined && v !== null) merged[k] = v;
    }
    return merged;
  }

  /** R9.1: 写/清 pending state。 */
  private setPendingState(key: string | null, intent: IntentType, slots: Record<string, unknown>): void {
    if (!key) return;
    this.sessions.set(key, { intent, slots, expiresAt: Date.now() + SESSION_TTL_MS });
  }
  private clearPendingState(key: string | null): void {
    if (!key) return;
    this.sessions.delete(key);
  }

  /** R9.1 fix: 从用户消息里的写操作动词, 推断可能的 slot-accumulating intent。
   *  用作 ASK_CLARIFICATION → pending state 的兜底 (LLM 没识别, 但写动词很明确)。
   *  优先级: 发包 > 投标 > 上传 IP > 跑视频 > 跑蓝图 > 改发包。 */
  private inferIntentFromMessage(message: string, role: string | null): IntentType | null {
    const m = message.trim();
    if (!m) return null;
    // buyer 默认 CREATE_BRIEF (高频写操作)
    if (/发包|我要发|新建发包|发个包|发一个包/.test(m)) return 'CREATE_BRIEF';
    if (/改发包|修改发包|更新发包|编辑发包/.test(m)) return 'UPDATE_BRIEF';
    // creator 默认 UPLOAD_IP
    if (/上传.*IP|上传新.*IP|新建.*IP|录.*新.*IP|加个.*IP|录个.*IP/.test(m)) return 'UPLOAD_IP';
    if (/投标|抢单|接单|投个标|我要投/.test(m)) return 'PLACE_BID';
    if (/跑.*视频|生成.*视频|跑.*sora|跑.*kling|跑.*runway|跑.*jimeng/.test(m)) return 'RUN_VIDEO_GEN';
    if (/建.*蓝图|起.*蓝图|做.*蓝图|跑.*蓝图|生成.*蓝图/.test(m)) return 'RUN_BLUEPRINT_GEN';
    return null;
  }

  /** R9.1 fix: 正则兜底抽取 CREATE_BRIEF 字段 — LLM 没返 JSON 时用。
   *  返回 null = 抽不到任何关键字段, 不强行 merge。
   *  返回 slots = 至少有一个字段, 让 parseIntent 二次校验。
   *  不解析时间 (deadlineAt) — 留给 LLM/前端, 因为 "7 天后" 这类语义日期解析复杂。 */
  private regexExtractBriefSlots(msg: string): Record<string, unknown> | null {
    const slots: Record<string, unknown> = {};

    // 标题 — "标题 X" / "标题是 X" / "标题: X" / "标题 X" (宽松, 允许无分隔符)
    const titleMatch = msg.match(/标题[是为：:]?\s*([^,，。;；\n]{2,100})/);
    if (titleMatch) slots.title = titleMatch[1].trim();

    // 类别 — "类别 X" / "品类 X" / "类型 X" / "类目 X" (宽松, 允许无分隔符)
    const catMatch = msg.match(/(?:类别|品类|类型|类目)[是为：:]?\s*(\w+)/);
    if (catMatch) slots.category = catMatch[1].trim();

    // 套餐 — "档位 X" / "套餐 X" / "走 X 套餐"
    const pkgMatch = msg.match(/(?:档位|套餐|走)[是为：:]?\s*(essential|standard|premium)/i);
    if (pkgMatch) slots.packageTier = pkgMatch[1].toLowerCase();

    // 预算 — "预算 5000-8000" / "预算 5000 ~ 8000" / "5000-8000元"
    const budgetMatch = msg.match(/预算[是为：:]?\s*(\d{2,7})\s*[-~到至]\s*(\d{2,7})/);
    if (budgetMatch) {
      slots.budgetMin = Number(budgetMatch[1]);
      slots.budgetMax = Number(budgetMatch[2]);
    }

    // 平台 — "平台抖音快手" / "投放平台 抖音 + 快手" / "平台: 抖音" (宽松, 允许无分隔符)
    const platMatch = msg.match(/(?:投放)?平台[是为：:]?\s*([^\n,]+)/);
    if (platMatch) {
      const raw = platMatch[1];
      // 中文 → 枚举值映射 (粗匹配, 多个常见平台)
      const map: Record<string, string> = {
        '抖音': 'douyin',
        '快手': 'kuaishou',
        '小红书': 'xiaohongshu',
        '视频号': 'shipinhao',
        '微信': 'weixin',
        'B站': 'bilibili',
        'b站': 'bilibili',
        '淘宝': 'taobao',
        '京东': 'jd',
      };
      const platforms = new Set<string>();
      for (const [zh, en] of Object.entries(map)) {
        if (raw.includes(zh)) platforms.add(en);
      }
      if (platforms.size > 0) slots.platformSet = Array.from(platforms);
    }

    // 截止时间 — "14 天后" / "7天后" / "今天 +7d" / ISO 字符串
    // 解析为具体 ISO 时间, 满足 IsString 校验, parseIntent 不强校验格式
    const daysMatch = msg.match(/(\d{1,3})\s*天后/);
    if (daysMatch) {
      const d = new Date(Date.now() + Number(daysMatch[1]) * 86_400_000);
      slots.deadlineAt = d.toISOString();
    } else if (/(?:今天|今晚)|today/i.test(msg)) {
      slots.deadlineAt = new Date().toISOString();
    }

    // 至少要有一个字段才算"能尝试 merge"
    return Object.keys(slots).length > 0 ? slots : null;
  }

  async chat(
    userId: string,
    userRoles: UserRole[],
    dto: ChatDto,
  ): Promise<ChatResult> {
    const userRole = this.pickPrimaryRole(userRoles);

    // R9.1: 多轮 slot 累积 — sweep + 取 pending state
    this.sweepExpiredSessions();
    const sessionKey = this.getSessionKey(userId, dto.sessionId);
    const pending = this.getPendingState(sessionKey);

    // FAQ 命中优先 — 节省 LLM 调用
    // W6-R2 修复: 业务动词优先 — 用户明显是写操作意图 (投标/发包/上传/接单...) 时
    // 不走 FAQ, 直接走 LLM 分类, 否则 FAQ 关键词把业务意图抢答
    // R9.1 修复: pending intent 优先 — 用户在多轮 slot 累积中 (上一轮 ASK_CLARIFICATION)
    // 时, FAQ 关键词 (如"套餐") 容易误命中 IP 授权档位 FAQ, 打断发包流。
    //   只要 pending 命中, 直接绕过 FAQ, 把新消息当 slot 增量喂给 LLM。
    const skipFaqForPendingSession = pending != null;
    if (
      !skipFaqForPendingSession &&
      (userRole === 'CREATOR' || userRole === 'BUYER') &&
      !isBusinessIntentMessage(dto.message)
    ) {
      const faqHit = matchFaq(dto.message, userRole === 'CREATOR' ? 'creator' : 'buyer');
      if (faqHit) {
        const t0 = Date.now();
        const safeActions = faqHit.entry.actions.filter((a) => this.isAllowedHref(a.href));
        await this.prisma.assistantCallLog.create({
          data: {
            userId,
            userRole,
            route: dto.routeContext?.route ?? null,
            promptText: dto.message.slice(0, 8000),
            responseText: faqHit.entry.answer.slice(0, 8000),
            model: `faq:${faqHit.entry.id}`,
            latencyMs: Date.now() - t0,
          },
        }).catch(() => {});
        this.logger.log(
          `assistant FAQ hit: id=${faqHit.entry.id} score=${faqHit.score} user=${userId} role=${userRole}`,
        );
        return {
          reply: faqHit.entry.answer,
          suggestedActions: safeActions,
          intent: undefined, // FAQ 不挂 intent
        };
      }
    }

    // 注入检测 — 服务端兜底
    if (looksLikeInjection(dto.message)) {
      const t0 = Date.now();
      this.logger.warn(`assistant injection blocked: user=${userId} msg=${dto.message.slice(0, 100)}`);
      await this.prisma.assistantCallLog.create({
        data: {
          userId,
          userRole,
          route: dto.routeContext?.route ?? null,
          promptText: dto.message.slice(0, 8000),
          responseText: OUT_OF_SCOPE_REPLY,
          model: 'injection-blocked',
          latencyMs: Date.now() - t0,
        },
      }).catch(() => {});
      return {
        reply: OUT_OF_SCOPE_REPLY,
        suggestedActions: [{ label: '联系商务', href: '/contact' }],
        intent: null,
        requiresConfirmation: false,
      };
    }

    // 调 LLM (temperature=0 让分类稳定)
    const systemPrompt = this.appendPendingHint(this.pickSystemPrompt(userRoles), pending);
    const userMessageText = this.composeUserMessage(dto);

    const historyMsgs = (dto.history ?? [])
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...historyMsgs,
      { role: 'user', content: userMessageText },
    ];

    const t0 = Date.now();
    let text: string;
    let model: string;
    let latencyMs: number;
    try {
      const r = await this.ai.chat({
        systemPrompt,
        messages,
        maxTokens: 600, // reply(150) + intent+params(450)
        temperature: 0, // W6-R1 分类稳定
      });
      text = r.text;
      model = r.model;
      latencyMs = r.latencyMs;
    } catch (e) {
      const fallback = 'AI 助手暂时无法回答(LLM 服务未配置或不可用)。请稍后再试, 或邮件 admin@ibi.ren。';
      const isUnavailable = e instanceof ServiceUnavailableException;
      this.logger.warn(`assistant fallback (LLM unavailable=${isUnavailable}): ${e?.message ?? e}`);
      latencyMs = Date.now() - t0;
      model = 'fallback';
      await this.prisma.assistantCallLog.create({
        data: {
          userId,
          userRole,
          route: dto.routeContext?.route ?? null,
          promptText: userMessageText.slice(0, 8000),
          responseText: fallback,
          model,
          latencyMs,
          intent: null,
          requiresConfirmation: false,
        },
      }).catch(() => {});
      return {
        reply: fallback,
        suggestedActions: [{ label: '联系商务', href: '/contact' }],
        intent: null,
        requiresConfirmation: false,
      };
    }

    const parsed = tryParseLlmJson(text);
    if (!parsed || typeof parsed.reply !== 'string') {
      this.logger.warn(`assistant LLM 输出无法解析: ${text.slice(0, 200)}`);

      // R9.1 fix: LLM 没返 JSON, 但 pending CREATE_BRIEF 还在等字段 — 走正则兜底,
      //   别直接返 OOS (会打断多轮 slot 累积)。
      let regexFallbackParsed: ReturnType<typeof parseIntent> = null;
      let regexFallbackReply: string | null = null;
      if (pending && pending.intent === 'CREATE_BRIEF') {
        const regexSlots = this.regexExtractBriefSlots(dto.message);
        if (regexSlots) {
          const merged = this.mergeSlots(pending, 'CREATE_BRIEF', regexSlots);
          regexFallbackParsed = parseIntent('CREATE_BRIEF', merged);
          if (regexFallbackParsed) {
            // LLM 的文本也用作回复 (摘出"攒得差不多了"那种自然语言)
            const llmText = text.trim().slice(0, 500);
            regexFallbackReply =
              llmText || `我帮你拼一下发包: ${JSON.stringify(regexSlots)} — 核对下要不要确认提交?`;
            this.logger.log(
              `assistant slot regex fallback merged (no-llm-json): session=${sessionKey} filled=${Object.keys(regexSlots).join(',')}`,
            );
          }
        }
      }

      if (!regexFallbackParsed) {
        await this.writeAudit({
          userId,
          userRole,
          route: dto.routeContext?.route ?? null,
          promptText: userMessageText,
          responseText: OUT_OF_SCOPE_REPLY,
          model,
          latencyMs: Date.now() - t0,
          intent: null,
          requiresConfirmation: false,
        });
        return {
          reply: OUT_OF_SCOPE_REPLY,
          suggestedActions: [],
          intent: null,
          requiresConfirmation: false,
        };
      }
      // 正则兜底成功 — 走完整 return 路径 (带 intent+reply), 跳过剩余的 LLM 解析
      await this.writeAudit({
        userId,
        userRole,
        route: dto.routeContext?.route ?? null,
        promptText: userMessageText,
        responseText: regexFallbackReply ?? '',
        model: `${model}+regex-fallback`,
        latencyMs: Date.now() - t0,
        intent: regexFallbackParsed.intent,
        requiresConfirmation: regexFallbackParsed.requiresConfirmation,
      });
      // 解析成功 → 清 pending
      if (pending && pending.intent === regexFallbackParsed.intent) {
        this.clearPendingState(sessionKey);
      }
      return {
        reply: regexFallbackReply ?? '',
        suggestedActions: [],
        intent: regexFallbackParsed.intent,
        intentParams: regexFallbackParsed.intentParams,
        requiresConfirmation: regexFallbackParsed.requiresConfirmation,
      };
    }

    // reply 处理 + OOS 标记
    let reply = parsed.reply.trim();
    if (reply === '[OOS]') {
      reply = OUT_OF_SCOPE_REPLY;
    }

    // actions 白名单校验 (老规则)
    const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];
    const suggestedActions: SuggestedAction[] = [];
    for (const a of rawActions) {
      if (!a || typeof a.label !== 'string' || typeof a.href !== 'string') continue;
      const label = a.label.trim().slice(0, 30);
      const href = a.href.trim();
      if (!this.isAllowedHref(href)) {
        this.logger.warn(`assistant OOB href dropped: ${href}`);
        continue;
      }
      suggestedActions.push({ label, href });
      if (suggestedActions.length >= 3) break;
    }

    // intent 解析 + 校验 — R9.1 多轮 slot 累积合并
    let intentParsed = parseIntent(parsed.intent, parsed.intentParams);

    // R9.1: 若 LLM 选的是 slot 累积型 intent, 且有 pending state (上轮 ASK_CLARIFICATION 留下的)
    //   → 把 pending.slots merge 进 params, 重跑 parseIntent。LLM 重抽可能漏字段, merge 后能补齐。
    const llmIntent =
      typeof parsed.intent === 'string' && (parsed.intent as IntentType) in ({} as Record<IntentType, unknown>)
        ? (parsed.intent as IntentType)
        : null;
    if (
      intentParsed === null &&
      llmIntent !== null &&
      SLOT_ACCUMULATING_INTENTS.has(llmIntent) &&
      pending !== null &&
      pending.intent === llmIntent
    ) {
      const merged = this.mergeSlots(pending, llmIntent, parsed.intentParams ?? {});
      intentParsed = parseIntent(llmIntent, merged);
      if (intentParsed !== null) {
        this.logger.log(`assistant slot merge succeeded: session=${sessionKey} intent=${llmIntent}`);
      }
    }

    // R9.1: 第一次进 slot-accumulating intent 但字段不全 → save pending state 等下轮
    //   (只有 llmIntent 是 slot 累积型且 parseIntent 失败时, 才存; 其它 intent 不污染状态)
    // R9.1 fix: 即便 LLM 返 intentParams={} (LLM 选了 CREATE_BRIEF 但啥都没填),
    //   也要存 pending state — 否则下轮 FAQ 会把"套餐"抢答打断发包流。
    if (
      intentParsed === null &&
      llmIntent !== null &&
      SLOT_ACCUMULATING_INTENTS.has(llmIntent) &&
      (pending === null || pending.intent === llmIntent)
    ) {
      const slots: Record<string, unknown> = { ...(pending && pending.intent === llmIntent ? pending.slots : {}) };
      for (const [k, v] of Object.entries(parsed.intentParams ?? {})) {
        if (v !== undefined && v !== null) slots[k] = v;
      }
      this.setPendingState(sessionKey, llmIntent, slots);
      this.logger.log(
        `assistant slot pending saved: session=${sessionKey} intent=${llmIntent} filled=${Object.keys(slots).join(',') || '(empty)'}`,
      );
    }

    // R9.1: 解析成功 → 清掉 pending state (一次成功的提交走完即清, 避免污染下个对话)
    if (intentParsed !== null && pending !== null && pending.intent === intentParsed.intent) {
      this.clearPendingState(sessionKey);
    }

    // R9.1 fix: 当 LLM 返 ASK_CLARIFICATION (ASK_CLARIFICATION 通过 parseIntent,
    //   intentParsed 非 null, 上面那段不会存 pending),
    //   但用户消息里有写操作动词 → 推断用户想进入对应的 slot-accumulating intent,
    //   主动存一个 pending state, 让下轮 FAQ 关键词被 bypass。
    //   例: "帮我发包" → LLM 选 ASK_CLARIFICATION → 我们存 CREATE_BRIEF pending
    //       下轮 "standard 套餐 预算 5000" 合并 slots → parseIntent 通过 → 弹卡
    // R9.1 fix: 不管 LLM 返什么 intent, 只要用户消息里有写操作动词且没 pending,
    //   就存一个 slot-accumulating pending state, 让下轮 FAQ 关键词被 bypass。
    //   例: "帮我发包" → LLM 可能返 ASK_CLARIFICATION / CREATE_BRIEF(空) / ANSWER,
    //       只要包含"发包"动词, 我们存 CREATE_BRIEF pending。
    if (pending === null) {
      const inferredIntent = this.inferIntentFromMessage(dto.message, userRole);
      if (inferredIntent && SLOT_ACCUMULATING_INTENTS.has(inferredIntent)) {
        this.setPendingState(sessionKey, inferredIntent, {});
        this.logger.log(
          `assistant slot pending inferred: session=${sessionKey} intent=${inferredIntent} (msg="${dto.message.slice(0, 40)}")`,
        );
      }
    }

    // W6-R7 fallback: LLM 经常对 "打开形象库" 类纯查询只返 reply+actions 不挂 intent,
    //   强制按用户消息里的关键词兜底,让右屏 embed 能触发。OPEN_IP_LIBRARY DTO 全空,
    //   schema 一定过 — 不会引入误命中。
    if (!intentParsed) {
      const msg = userMessageText.trim();
      if (/形象库|IP\s*库|看\s*IP|搜\s*IP|筛选\s*IP|浏览.*IP|IP.*浏览|打开.*库|看.*库/.test(msg)) {
        intentParsed = parseIntent('OPEN_IP_LIBRARY', {});
      } else if (/上传.*新.*IP|新建.*IP|加个.*IP|录.*新.*IP|录个.*IP/.test(msg)) {
        intentParsed = parseIntent('UPLOAD_IP', {});
      } else if (pending && pending.intent === 'CREATE_BRIEF') {
        // R9.1 fix: pending CREATE_BRIEF + LLM 没返 JSON 时, 走正则兜底抽取字段
        const regexSlots = this.regexExtractBriefSlots(msg);
        if (regexSlots) {
          const merged = this.mergeSlots(pending, 'CREATE_BRIEF', regexSlots);
          intentParsed = parseIntent('CREATE_BRIEF', merged);
          if (intentParsed) {
            this.logger.log(`assistant slot regex fallback merged: session=${sessionKey} filled=${Object.keys(regexSlots).join(',')}`);
          }
        }
      }
    }

    await this.writeAudit({
      userId,
      userRole,
      route: dto.routeContext?.route ?? null,
      promptText: userMessageText,
      responseText: reply,
      model,
      latencyMs: Date.now() - t0,
      intent: intentParsed?.intent ?? null,
      requiresConfirmation: intentParsed?.requiresConfirmation ?? false,
    });

    if (parsed.intent && !intentParsed) {
      this.logger.warn(
        `assistant intent dropped (Zod fail): intent=${parsed.intent} params=${JSON.stringify(parsed.intentParams).slice(0, 200)}`,
      );
    }

    return {
      reply,
      suggestedActions,
      intent: intentParsed?.intent ?? null,
      intentParams: intentParsed?.intentParams,
      requiresConfirmation: intentParsed?.requiresConfirmation,
    };
  }

  // =============== private helpers ===============

  private async writeAudit(args: {
    userId: string;
    userRole: string;
    route: string | null;
    promptText: string;
    responseText: string;
    model: string;
    latencyMs: number;
    intent: string | null;
    requiresConfirmation: boolean;
    attachments?: ChatAttachment[];
  }) {
    await this.prisma.assistantCallLog.create({
      data: {
        userId: args.userId,
        userRole: args.userRole,
        route: args.route,
        promptText: args.promptText.slice(0, 8000),
        responseText: args.responseText.slice(0, 8000),
        model: args.model,
        latencyMs: args.latencyMs,
        intent: args.intent,
        requiresConfirmation: args.requiresConfirmation,
        attachments: args.attachments && args.attachments.length > 0 ? (args.attachments as any) : undefined,
      },
    }).catch((e) => {
      this.logger.warn(`assistant audit write failed: ${e?.message ?? e}`);
    });
  }

  /**
   * W6-R7: 多模态 chat — 接收 multipart 上传的 files, 落 OSS public 桶, 喂给 LLM 多模态 messages
   *
   * 设计:
   *   - 任何类型都先落 OSS (public 桶, 1 月缓存) — 给前端展示 + LLM 引用
   *   - 仅 image/* 类型转 base64 进 LLM content blocks; 其它类型只挂到 context metadata
   *   - 历史消息保持字符串 (assistant 历史回包一定是文本)
   *   - 限流更严: 10/min vs chat 20/min
   *
   * 失败语义: 抛 BadRequest (文件超限) / ServiceUnavailable (LLM down)。
   */
  async chatWithAttachments(
    userId: string,
    userRoles: UserRole[],
    text: string,
    files: Express.Multer.File[],
    history?: ChatDto['history'],
    routeContext?: ChatDto['routeContext'],
    sessionId?: string,
  ): Promise<ChatResult> {
    const userRole = this.pickPrimaryRole(userRoles);

    // R9.1: 多模态路径也走 session 状态 — 创作者上传头像时 UPLOAD_IP 也是 slot 累积型
    this.sweepExpiredSessions();
    const sessionKey = this.getSessionKey(userId, sessionId);
    const pending = this.getPendingState(sessionKey);

    // 0. 文件 mime 校验 + 大小硬限制 (FileInterceptor 已设 50MB, 这里双保险)
    const allowedExts = /\.(jpe?g|png|webp|pdf|docx|txt)$/i;
    const imageMime: Array<'image/jpeg' | 'image/png' | 'image/webp'> = ['image/jpeg', 'image/png', 'image/webp'];
    const persisted: ChatAttachment[] = [];
    const imageBlocks: Array<{ type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } }> = [];

    for (const f of files) {
      const safeName = (f.originalname ?? 'file').replace(/[\\/\0]/g, '_').slice(-200);
      if (!allowedExts.test(safeName)) {
        throw new BadRequestException(`不支持的文件扩展名: ${safeName}`);
      }
      if (f.size > 50 * 1024 * 1024) {
        throw new BadRequestException(`文件过大: ${safeName}`);
      }
      const ts = Date.now();
      const key = `chat-attachments/${userId}/${ts}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
      const mime = (f.mimetype ?? 'application/octet-stream').toLowerCase();
      const publicUrl = await this.upload.uploadPublic(key, f.buffer, mime === 'application/octet-stream' ? 'image/jpeg' : mime);
      persisted.push({
        ossKey: key,
        mimeType: mime,
        filename: safeName,
        sizeBytes: f.size,
        publicUrl,
      });
      // 仅 image/* 走多模态 LLM (Anthropic Claude vision 仅接受 image)
      const baseMime = imageMime.find((m) => m === mime);
      if (baseMime) {
        imageBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: baseMime, data: f.buffer.toString('base64') },
        });
      }
    }

    // 1. 注入检测 (跟 chat 一致 — 附件也可能夹带)
    if (looksLikeInjection(text)) {
      await this.writeAudit({
        userId,
        userRole,
        route: routeContext?.route ?? null,
        promptText: text,
        responseText: OUT_OF_SCOPE_REPLY,
        model: 'injection-blocked',
        latencyMs: 0,
        intent: null,
        requiresConfirmation: false,
        attachments: persisted,
      });
      return {
        reply: OUT_OF_SCOPE_REPLY,
        suggestedActions: [{ label: '联系商务', href: '/contact' }],
        intent: null,
        requiresConfirmation: false,
        attachments: persisted,
      };
    }

    // 2. 拼多模态 messages
    const systemPrompt = this.appendPendingHint(this.pickSystemPrompt(userRoles), pending);
    const historyMsgs = (history ?? []).slice(-HISTORY_LIMIT).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // 当前 user 消息 — 多模态: text + 附件清单 (文本) + image blocks
    const attachmentSummary = persisted
      .map((a, i) => `[附件${i + 1}: ${a.filename} (${a.mimeType}, ${Math.round(a.sizeBytes / 1024)}KB)](${a.publicUrl})`)
      .join('\n');
    const userText = [text, attachmentSummary].filter(Boolean).join('\n\n');
    const contentBlocks: Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } }> = [
      { type: 'text', text: userText },
      ...imageBlocks,
    ];

    // 拼路由上下文到 userText 末尾 (跟 chat 一致)
    if (routeContext?.route) {
      contentBlocks.unshift({ type: 'text', text: `[用户当前路由: ${routeContext.route}]` });
    }

    const messages: Array<any> = [
      ...historyMsgs,
      { role: 'user', content: contentBlocks },
    ];

    // 3. 调 LLM
    const t0 = Date.now();
    let text2: string;
    let model: string;
    let latencyMs: number;
    try {
      const r = await this.ai.chatMultiModal({
        systemPrompt,
        messages: messages as any,
        maxTokens: 600,
        temperature: 0,
      });
      text2 = r.text;
      model = r.model;
      latencyMs = r.latencyMs;
    } catch (e) {
      const fallback = 'AI 助手暂时无法回答(LLM 服务未配置或不可用)。请稍后再试, 或邮件 admin@ibi.ren。';
      const isUnavailable = e instanceof ServiceUnavailableException;
      this.logger.warn(`assistant multimodal fallback (LLM unavailable=${isUnavailable}): ${e?.message ?? e}`);
      latencyMs = Date.now() - t0;
      model = 'fallback';
      await this.writeAudit({
        userId,
        userRole,
        route: routeContext?.route ?? null,
        promptText: userText,
        responseText: fallback,
        model,
        latencyMs,
        intent: null,
        requiresConfirmation: false,
        attachments: persisted,
      });
      return {
        reply: fallback,
        suggestedActions: [{ label: '联系商务', href: '/contact' }],
        intent: null,
        requiresConfirmation: false,
        attachments: persisted,
      };
    }

    // 4. parse intent + 校验 + audit
    const parsed = tryParseLlmJson(text2);
    if (!parsed || typeof parsed.reply !== 'string') {
      this.logger.warn(`assistant multimodal LLM 输出无法解析: ${text2.slice(0, 200)}`);
      await this.writeAudit({
        userId,
        userRole,
        route: routeContext?.route ?? null,
        promptText: userText,
        responseText: OUT_OF_SCOPE_REPLY,
        model,
        latencyMs: Date.now() - t0,
        intent: null,
        requiresConfirmation: false,
        attachments: persisted,
      });
      return {
        reply: OUT_OF_SCOPE_REPLY,
        suggestedActions: [],
        intent: null,
        requiresConfirmation: false,
        attachments: persisted,
      };
    }

    let reply = parsed.reply.trim();
    if (reply === '[OOS]') reply = OUT_OF_SCOPE_REPLY;

    const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];
    const suggestedActions: SuggestedAction[] = [];
    for (const a of rawActions) {
      if (!a || typeof a.label !== 'string' || typeof a.href !== 'string') continue;
      const label = a.label.trim().slice(0, 30);
      const href = a.href.trim();
      if (!this.isAllowedHref(href)) {
        this.logger.warn(`assistant multimodal OOB href dropped: ${href}`);
        continue;
      }
      suggestedActions.push({ label, href });
      if (suggestedActions.length >= 3) break;
    }

    let intentParsed = parseIntent(parsed.intent, parsed.intentParams);

    // R9.1: 多模态路径同样支持 slot 累积合并
    const llmIntentM =
      typeof parsed.intent === 'string' && (parsed.intent as IntentType) in ({} as Record<IntentType, unknown>)
        ? (parsed.intent as IntentType)
        : null;
    if (
      intentParsed === null &&
      llmIntentM !== null &&
      SLOT_ACCUMULATING_INTENTS.has(llmIntentM) &&
      pending !== null &&
      pending.intent === llmIntentM
    ) {
      const merged = this.mergeSlots(pending, llmIntentM, parsed.intentParams ?? {});
      intentParsed = parseIntent(llmIntentM, merged);
      if (intentParsed !== null) {
        this.logger.log(`assistant multimodal slot merge succeeded: session=${sessionKey} intent=${llmIntentM}`);
      }
    }
    if (
      intentParsed === null &&
      llmIntentM !== null &&
      SLOT_ACCUMULATING_INTENTS.has(llmIntentM) &&
      (parsed.intentParams && Object.keys(parsed.intentParams).length > 0)
    ) {
      const slots: Record<string, unknown> = { ...(pending && pending.intent === llmIntentM ? pending.slots : {}) };
      for (const [k, v] of Object.entries(parsed.intentParams ?? {})) {
        if (v !== undefined && v !== null) slots[k] = v;
      }
      this.setPendingState(sessionKey, llmIntentM, slots);
    }
    if (intentParsed !== null && pending !== null && pending.intent === intentParsed.intent) {
      this.clearPendingState(sessionKey);
    }

    // W6-R7 fallback (multimodal 路径): 仅在文本非空时启用, 否则纯附件会无端命中
    if (!intentParsed && text.trim().length > 0) {
      const msg = text.trim();
      if (/形象库|IP\s*库|看\s*IP|搜\s*IP|筛选\s*IP|浏览.*IP|IP.*浏览|打开.*库|看.*库/.test(msg)) {
        intentParsed = parseIntent('OPEN_IP_LIBRARY', {});
      } else if (/上传.*新.*IP|新建.*IP|加个.*IP|录.*新.*IP|录个.*IP/.test(msg)) {
        intentParsed = parseIntent('UPLOAD_IP', {});
      }
    }

    await this.writeAudit({
      userId,
      userRole,
      route: routeContext?.route ?? null,
      promptText: userText,
      responseText: reply,
      model,
      latencyMs: Date.now() - t0,
      intent: intentParsed?.intent ?? null,
      requiresConfirmation: intentParsed?.requiresConfirmation ?? false,
      attachments: persisted,
    });

    if (parsed.intent && !intentParsed) {
      this.logger.warn(
        `assistant multimodal intent dropped (Zod fail): intent=${parsed.intent} params=${JSON.stringify(parsed.intentParams).slice(0, 200)}`,
      );
    }

    return {
      reply,
      suggestedActions,
      intent: intentParsed?.intent ?? null,
      intentParams: intentParsed?.intentParams,
      requiresConfirmation: intentParsed?.requiresConfirmation,
      attachments: persisted,
    };
  }

  private pickSystemPrompt(roles: UserRole[]): string {
    if (hasRole(roles, 'CREATOR')) return CREATOR_SYSTEM_PROMPT;
    if (hasRole(roles, 'BUYER')) return BUYER_SYSTEM_PROMPT;
    return BUYER_SYSTEM_PROMPT;
  }

  private pickPrimaryRole(roles: UserRole[]): string {
    if (hasRole(roles, 'CREATOR')) return 'CREATOR';
    if (hasRole(roles, 'BUYER')) return 'BUYER';
    if (hasRole(roles, 'ADMIN')) return 'ADMIN';
    return 'BUYER';
  }

  private composeUserMessage(dto: ChatDto): string {
    const lines: string[] = [dto.message];
    if (dto.routeContext?.route) {
      lines.push(`\n[用户当前路由: ${dto.routeContext.route}]`);
    }
    if (dto.routeContext?.query && Object.keys(dto.routeContext.query).length > 0) {
      const q = Object.entries(dto.routeContext.query)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      lines.push(`[页面 query: ${q}]`);
    }
    return lines.join('\n');
  }

  /** R9.1 fix: 在 LLM 输入里加 pending intent 提示, 让 LLM 知道用户在多轮 slot 累积中。
   *  这是软约束, 硬约束在 mergeSlots + parseIntent (代码层合并)。 */
  private appendPendingHint(systemOrUser: string, pending: PendingIntentState | null): string {
    if (!pending) return systemOrUser;
    const filledKeys = Object.keys(pending.slots).join(',') || '(空)';
    return (
      systemOrUser +
      `\n\n[R9.1 hint: 用户正在 ${pending.intent} 多轮累积中, 已填字段: ${filledKeys}。` +
      `本次只补充/确认缺失字段, 不要再换 intent。]`
    );
  }

  private isAllowedHref(href: string): boolean {
    if (CTA_WHITELIST.some((c) => c.href === href)) return true;
    if (CTA_DYNAMIC_PATTERNS.some((re) => re.test(href))) return true;
    return false;
  }
}