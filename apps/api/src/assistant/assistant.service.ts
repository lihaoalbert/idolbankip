/**
 * AI 助手 — 只读型 service
 *
 * 流程:
 *   1. 拼装 system prompt (按 user 主角色 CREATOR/BUYER 选)
 *   2. 拼 user messages: history(可选, 截断最近 20 条) + 当前 message (含 routeContext)
 *   3. 调 AiService.chat() 拿 raw text
 *   4. 解析 JSON 提取 {reply, actions}; 失败/超界 → 走 fallback (OUT_OF_SCOPE_REPLY 或空 actions)
 *   5. 校验 actions.href 在白名单(assistant.prompts.ts); 不在白名单 → 丢弃
 *   6. 写 AssistantCallLog (审计)
 *   7. 返回 {reply, suggestedActions}
 *
 * 边界: 助手不能调任何写接口 (this class 完全不调 prisma 写业务表, 只写 audit 表)。
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

const HISTORY_LIMIT = 20; // 前端传再多, 这里也只取最近 20 条

export interface SuggestedAction {
  label: string;
  href: string;
}

export interface ChatResult {
  reply: string;
  suggestedActions: SuggestedAction[];
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 主入口 — POST /assistant/chat
   * 失败语义:
   *   - 解析/越界: 不抛错, 走 fallback (降级 reply + 空 actions), 不给用户 5xx
   *   - LLM 不可用: 让 AiService.chat 抛 ServiceUnavailableException (Nest 包 503)
   */
  async chat(
    userId: string,
    userRoles: UserRole[],
    dto: ChatDto,
  ): Promise<ChatResult> {
    const systemPrompt = this.pickSystemPrompt(userRoles);
    const userMessageText = this.composeUserMessage(dto);

    // history 截断最近 20 条, 并转换为 LLM 期望的 {role, content}
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
        maxTokens: 1024,
      });
      text = r.text;
      model = r.model;
      latencyMs = r.latencyMs;
    } catch (e) {
      // LLM 不可用 (DB 无 active provider + env 也无 key) — 降级为固定回复 + admin 联系 CTA
      // 不抛 5xx 给前端 (UX 更稳), 但要写 audit 记录降级事件
      const fallback = 'AI 助手暂时无法回答(LLM 服务未配置或不可用)。请稍后再试, 或邮件 admin@ibi.ren。';
      const isUnavailable = e instanceof ServiceUnavailableException;
      this.logger.warn(`assistant fallback (LLM unavailable=${isUnavailable}): ${e?.message ?? e}`);
      latencyMs = Date.now() - t0;
      model = 'fallback';
      await this.prisma.assistantCallLog.create({
        data: {
          userId,
          userRole: this.pickPrimaryRole(userRoles),
          route: dto.routeContext?.route ?? null,
          promptText: userMessageText.slice(0, 8000),
          responseText: fallback,
          model,
          latencyMs,
        },
      }).catch(() => {});
      return {
        reply: fallback,
        suggestedActions: [{ label: '联系商务', href: '/contact' }],
      };
    }
    const totalLatencyMs = Date.now() - t0;

    const { reply, suggestedActions, oos } = this.parseAndSanitize(text);

    // 写审计 — 落 prompt/response 全文 + 模型 + 延迟
    // userRole 取主角色 (创作者/采购者优先), 兜底 'BUYER'
    const userRole = this.pickPrimaryRole(userRoles);

    await this.prisma.assistantCallLog.create({
      data: {
        userId,
        userRole,
        route: dto.routeContext?.route ?? null,
        promptText: userMessageText.slice(0, 8000), // 截断防爆
        responseText: reply.slice(0, 8000),
        model,
        latencyMs: totalLatencyMs,
      },
    }).catch((e) => {
      // 审计写失败不影响主流程 — 但要 warn, admin 后续排查
      this.logger.warn(`assistant audit write failed: ${e?.message ?? e}`);
    });

    if (oos) {
      this.logger.log(`assistant OOS: user=${userId} role=${userRole} route=${dto.routeContext?.route ?? '-'}`);
    }

    return { reply, suggestedActions };
  }

  // =============== private helpers ===============

  private pickSystemPrompt(roles: UserRole[]): string {
    // 双角色用户优先按"上次操作的页面"判断 — 但 MVP 简化: CREATOR > BUYER > ADMIN
    if (hasRole(roles, 'CREATOR')) return CREATOR_SYSTEM_PROMPT;
    if (hasRole(roles, 'BUYER')) return BUYER_SYSTEM_PROMPT;
    // ADMIN 不在第一版覆盖范围, 走 BUYER prompt (宽松兜底), 实际不应该到这
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

  /**
   * 解析 LLM 输出 + 白名单校验 + OOS 检测
   * - 解析失败 → fallback (空 actions, 用 OUT_OF_SCOPE_REPLY)
   * - reply === '[OOS]' → 替换为 OUT_OF_SCOPE_REPLY
   * - actions.href 不在白名单 → 丢弃该项
   */
  private parseAndSanitize(text: string): { reply: string; suggestedActions: SuggestedAction[]; oos: boolean } {
    const parsed = this.tryParseJson(text);
    if (!parsed || typeof parsed.reply !== 'string') {
      this.logger.warn(`assistant LLM 输出无法解析: ${text.slice(0, 200)}`);
      return { reply: OUT_OF_SCOPE_REPLY, suggestedActions: [], oos: false };
    }

    let reply = parsed.reply.trim();
    let oos = false;
    if (reply === '[OOS]') {
      reply = OUT_OF_SCOPE_REPLY;
      oos = true;
    }

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
      if (suggestedActions.length >= 3) break; // 最多 3 个
    }

    return { reply, suggestedActions, oos };
  }

  private isAllowedHref(href: string): boolean {
    // 1) 精确匹配静态白名单
    if (CTA_WHITELIST.some((c) => c.href === href)) return true;
    // 2) 动态路径正则匹配
    if (CTA_DYNAMIC_PATTERNS.some((re) => re.test(href))) return true;
    return false;
  }

  private tryParseJson(text: string): any {
    let trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fence) trimmed = fence[1].trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const obj = trimmed.match(/\{[\s\S]*\}/);
      if (obj) {
        try { return JSON.parse(obj[0]); } catch { /* fallthrough */ }
      }
      return null;
    }
  }
}