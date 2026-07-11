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
import { Injectable, Logger } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
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
} from './intent-schemas';

const HISTORY_LIMIT = 20;

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
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
  ) {}

  async chat(
    userId: string,
    userRoles: UserRole[],
    dto: ChatDto,
  ): Promise<ChatResult> {
    const userRole = this.pickPrimaryRole(userRoles);

    // FAQ 命中优先 — 节省 LLM 调用
    if (userRole === 'CREATOR' || userRole === 'BUYER') {
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
    const systemPrompt = this.pickSystemPrompt(userRoles);
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

    // intent 解析 + 校验
    const intentParsed = parseIntent(parsed.intent, parsed.intentParams);

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
      },
    }).catch((e) => {
      this.logger.warn(`assistant audit write failed: ${e?.message ?? e}`);
    });
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

  private isAllowedHref(href: string): boolean {
    if (CTA_WHITELIST.some((c) => c.href === href)) return true;
    if (CTA_DYNAMIC_PATTERNS.some((re) => re.test(href))) return true;
    return false;
  }
}