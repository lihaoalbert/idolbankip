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

  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
  ) {}

  async chat(
    userId: string,
    userRoles: UserRole[],
    dto: ChatDto,
  ): Promise<ChatResult> {
    const userRole = this.pickPrimaryRole(userRoles);

    // FAQ 命中优先 — 节省 LLM 调用
    // W6-R2 修复: 业务动词优先 — 用户明显是写操作意图 (投标/发包/上传/接单...) 时
    // 不走 FAQ, 直接走 LLM 分类, 否则 FAQ 关键词把业务意图抢答
    if (userRole === 'CREATOR' || userRole === 'BUYER') {
      if (!isBusinessIntentMessage(dto.message)) {
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
    let intentParsed = parseIntent(parsed.intent, parsed.intentParams);

    // W6-R7 fallback: LLM 经常对 "打开形象库" 类纯查询只返 reply+actions 不挂 intent,
    //   强制按用户消息里的关键词兜底,让右屏 embed 能触发。OPEN_IP_LIBRARY DTO 全空,
    //   schema 一定过 — 不会引入误命中。
    if (!intentParsed) {
      const msg = userMessageText.trim();
      if (/形象库|IP\s*库|看\s*IP|搜\s*IP|筛选\s*IP|浏览.*IP|IP.*浏览|打开.*库|看.*库/.test(msg)) {
        intentParsed = parseIntent('OPEN_IP_LIBRARY', {});
      } else if (/上传.*新.*IP|新建.*IP|加个.*IP|录.*新.*IP|录个.*IP/.test(msg)) {
        intentParsed = parseIntent('UPLOAD_IP', {});
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
  ): Promise<ChatResult> {
    const userRole = this.pickPrimaryRole(userRoles);

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
    const systemPrompt = this.pickSystemPrompt(userRoles);
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

    const intentParsed = parseIntent(parsed.intent, parsed.intentParams);

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

  private isAllowedHref(href: string): boolean {
    if (CTA_WHITELIST.some((c) => c.href === href)) return true;
    if (CTA_DYNAMIC_PATTERNS.some((re) => re.test(href))) return true;
    return false;
  }
}