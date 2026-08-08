import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { LlmConfigService } from '../llm-config/llm-config.service';
import {
  BRIEF_CATEGORIZE_SYSTEM_PROMPT,
  BRIEF_DECOMPOSE_SYSTEM_PROMPT,
  BRIEF_PRICING_SYSTEM_PROMPT,
  buildBriefCategorizeUserPrompt,
  buildBriefDecomposeUserPrompt,
  buildBriefPricingUserPrompt,
} from './pricing-prompts';

export interface BriefDecomposeResult {
  category: string;
  platformSet: string[];
  count: number;
  duration: number;
  ips: number;
  complexity: 'low' | 'medium' | 'high';
}

export interface PricingTier {
  price: number;
  rationale: string;
}

export interface BriefPricingResult {
  essential: PricingTier;
  standard: PricingTier;
  premium: PricingTier;
  recommend: 'essential' | 'standard' | 'premium';
  reasoning: string;
}

export interface BriefCategorizeResult {
  category: string;
  confidence: number;
  subcategory: string;
}

/**
 * #30.7.1 Pricing 服务 — 调用 LLM 做 brief 拆解 / 报价 / 归类
 *
 * 复用 LlmConfigService 拿 active 配置(单 active + AES 解密 + env fallback)
 * 不重复实现 LLM 客户端创建, 但也不耦合 AiService(各自独立 fail-safe)
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(private readonly llmConfig: LlmConfigService) {}

  // ============= 1. brief 拆解 =============
  async decompose(input: {
    title: string;
    description?: string;
    declaredCategory?: string;
  }): Promise<BriefDecomposeResult> {
    const text = await this.callClaude(
      BRIEF_DECOMPOSE_SYSTEM_PROMPT,
      buildBriefDecomposeUserPrompt(input),
      512,
    );
    return this.parseAndValidate<BriefDecomposeResult>(text, 'decompose', (raw) => {
      const r = raw as any;
      return {
        category: r.category ?? input.declaredCategory ?? 'shortvideo',
        platformSet: Array.isArray(r.platformSet) ? r.platformSet : [],
        count: Number(r.count) || 1,
        duration: Number(r.duration) || 30,
        ips: Number(r.ips) || 1,
        complexity: ['low', 'medium', 'high'].includes(r.complexity) ? r.complexity : 'medium',
      };
    });
  }

  // ============= 2. brief 报价 =============
  async price(input: {
    spec: Record<string, any>;
    budgetHint?: { min: number; max: number };
  }): Promise<BriefPricingResult> {
    const text = await this.callClaude(
      BRIEF_PRICING_SYSTEM_PROMPT,
      buildBriefPricingUserPrompt(input),
      1024,
    );
    return this.parseAndValidate<BriefPricingResult>(text, 'price', (raw) => {
      const r = raw as any;
      const num = (v: any, fallback: number) =>
        Number.isFinite(Number(v)) ? Math.round(Number(v)) : fallback;
      const sanitizeTier = (t: any, fallback: number): PricingTier => ({
        price: num(t?.price, fallback),
        rationale: String(t?.rationale ?? '').slice(0, 200),
      });
      return {
        essential: sanitizeTier(r.essential, 800),
        standard: sanitizeTier(r.standard, 1700),
        premium: sanitizeTier(r.premium, 3000),
        recommend: ['essential', 'standard', 'premium'].includes(r.recommend)
          ? r.recommend
          : 'standard',
        reasoning: String(r.reasoning ?? '').slice(0, 500),
      };
    });
  }

  // ============= 3. brief 归类 =============
  async categorize(input: { title: string; description?: string }): Promise<BriefCategorizeResult> {
    const text = await this.callClaude(
      BRIEF_CATEGORIZE_SYSTEM_PROMPT,
      buildBriefCategorizeUserPrompt(input),
      256,
    );
    return this.parseAndValidate<BriefCategorizeResult>(text, 'categorize', (raw) => {
      const r = raw as any;
      const VALID_CATEGORIES = ['ad', 'shortvideo', 'livestream_clip', 'poster', '3d'];
      return {
        category: VALID_CATEGORIES.includes(r.category) ? r.category : 'shortvideo',
        confidence: Math.min(1, Math.max(0, Number(r.confidence) || 0.6)),
        subcategory: String(r.subcategory ?? '').slice(0, 50),
      };
    });
  }

  // ============= 内部: 调 Anthropic 客户端 =============
  private async callClaude(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> {
    let cfg;
    try {
      cfg = await this.llmConfig.getActive();
    } catch (e: any) {
      this.logger.error(`LLM 配置不可用: ${e?.message || e}`);
      throw new ServiceUnavailableException('AI 服务暂不可用, 请稍后再试');
    }
    const client = new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl });
    let text = '';
    try {
      const resp = await client.messages.create({
        model: cfg.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: [{ type: 'text', text: userPrompt }] }],
      });
      text = (resp.content[0] as any)?.text ?? '';
    } catch (e: any) {
      this.logger.error(`LLM API 失败: ${e?.message || e}`);
      throw new ServiceUnavailableException('AI 服务暂不可用, 请稍后再试');
    }
    return text;
  }

  // ============= 内部: 解析 + 校验 =============
  private parseAndValidate<T>(
    text: string,
    label: string,
    normalize: (raw: unknown) => T,
  ): T {
    const parsed = this.parseJson(text);
    if (!parsed) {
      this.logger.warn(`[pricing.${label}] AI 输出无法解析: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException('AI 返回格式异常, 请稍后再试');
    }
    return normalize(parsed);
  }

  private parseJson(text: string): unknown | null {
    // 兼容 ```json ... ``` 包裹
    const stripped = text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```\s*$/, '');
    try {
      return JSON.parse(stripped);
    } catch {
      // 找第一个 { 到最后一个 }
      const first = stripped.indexOf('{');
      const last = stripped.lastIndexOf('}');
      if (first >= 0 && last > first) {
        try {
          return JSON.parse(stripped.slice(first, last + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}