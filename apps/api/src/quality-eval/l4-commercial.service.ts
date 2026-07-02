/**
 * L4 商业价值评估 — Claude Sonnet 4.x (主用), LLM 比对 brief 与 deliverable
 *
 * 评分维度 (中国短视频 / 品牌 / 电商场景):
 *  - hookStrength       Hook 强度 — 前 3 秒能不能抓人
 *  - messageCompleteness 信息传递完整性 — brief 核心诉求是否齐全
 *  - audienceMatch      目标人群匹配 — 是否符合 brief 描述的人群审美
 *  - ctaClarity         CTA 清晰度 — 行动号召是否明确 (短剧或品牌专属)
 *  - emotionalResonance 情感共鸣度 — 能否触动目标情感
 *  - brandFit           品牌调性契合 — 风格与 brief 品类是否对味
 *
 * 关联: docs/research/quality-eval-benchmark-2026.md §1 Layer 4 / §8.2
 *
 * 隐私:
 *  - briefDescription + deliverableDescription 都走 PII 脱敏
 */

import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { LlmConfigService } from '../llm-config/llm-config.service';
import { redactForClaude, redactPii } from '../common/pii-redactor';
import { clamp } from './score-formula';
import type { EvidenceClip, L4CommercialResult } from './types';

const L4_SYSTEM_PROMPT = `你是 ibi.ren 平台的 AI 商业价值评审员, 评估创作者交付物与 brief 需求的对齐度。
平台用户主要是广告主 / 短剧 / 品牌合作 / 电商等中国 AIGC 买家。

## 输入
- brief 描述 (需求方原始诉求)
- 创作者交付描述 (创作者填的)
- 最多 8 张关键帧缩略图 (按顺序)

## 输出 (严格按 schema, JSON only)
{
  "subScores": {
    "hookStrength":       <0-1, 前 3 秒抓人强度>,
    "messageCompleteness":<0-1, brief 核心诉求是否完整呈现>,
    "audienceMatch":      <0-1, 是否符合 brief 指定的目标人群>,
    "ctaClarity":         <0-1, CTA / 行动号召是否清晰>,
    "emotionalResonance": <0-1, 情感共鸣度>,
    "brandFit":           <0-1, 风格调性与 brief 品类是否契合>
  },
  "critique": "<80-200 字中文商业评估, 既说亮点又说不足>",
  "evidence": [
    {"text": "<30-80 字说明与 brief 哪条诉求对应, 对齐度如何>"},
    ...最多 4 条
  ]
}

## 评分规范
- 0.85+ = 优秀 (直接可用)
- 0.70+ = 良好 (微调可用)
- 0.60+ = 合格 (需补拍或局部重做)
- 0.50- = 待改进 (建议重做)
- ctaClarity 对纯展示类 (平面 / MV) 可给 0.50 中性, 不强求 CTA
- brandFit 主要看与目标品类的视觉语言是否对味 (国风 / 二次元 / 现代 / 复古 等)

## 重要禁忌
- 不输出 JSON 以外的任何文本
- 不直接复述 brief 文字
- 不引入不可见信息 (例: 不猜播放量 / 不猜转化率)
- 创作者描述仅供背景理解, 不当评分唯一依据`;

/** L4 prompt 更长 (brief + deliverable + system),max_tokens 给到 1.5k 才安全 */
const L4_MAX_TOKENS = 1500;

interface CommercialInput {
  briefId: string;
  briefDescription: string;
  deliverableDescription?: string;
  thumbnailUrls: string[];
}

type CacheKey = string;
type CachedClient = { client: Anthropic; model: string };

@Injectable()
export class L4CommercialService {
  private readonly logger = new Logger(L4CommercialService.name);
  private clientCache = new Map<CacheKey, CachedClient>();

  constructor(private readonly llmConfig: LlmConfigService) {}

  async score(input: CommercialInput): Promise<L4CommercialResult> {
    const emptyResult = (reason: string): L4CommercialResult => ({
      layer: 'L4',
      score: 0,
      decision: 'FAIL',
      subScores: {
        hookStrength: 0,
        messageCompleteness: 0,
        audienceMatch: 0,
        ctaClarity: 0,
        emotionalResonance: 0,
        brandFit: 0,
      },
      modelVersion: 'n/a',
      evidence: [{ note: reason }],
      critique: reason,
    });

    if (!input.briefDescription?.trim()) {
      return emptyResult('L4 brief 描述为空, 无法评估商业价值');
    }

    let cfg: { client: Anthropic; model: string; configId: string };
    try {
      cfg = await this.getClient();
    } catch (e) {
      this.logger.warn(`L4 client 不可用: ${(e as Error).message}`);
      return emptyResult(`LLM 服务未配置: ${(e as Error).message.slice(0, 100)}`);
    }

    const safe = redactForClaude({
      description: input.briefDescription,
      creatorNote: input.deliverableDescription,
    });
    const safeUrls = input.thumbnailUrls.slice(0, 6);

    const userContent: Anthropic.MessageParam['content'] = [
      { type: 'text', text: `== BRIEF 需求 ==\n${safe.description ?? redactPii(input.briefDescription)}\n\n== 创作者交付描述 ==\n${safe.creatorNote ?? '(无)'}\n\n` },
      ...safeUrls.map((url) => ({
        type: 'image' as const,
        source: { type: 'url' as const, url },
      })),
      { type: 'text', text: '按 schema 输出 JSON。' },
    ];

    let text = '';
    try {
      const resp = await cfg.client.messages.create({
        model: cfg.model,
        max_tokens: L4_MAX_TOKENS,
        system: L4_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });
      text = (resp.content[0] as any).text ?? '';
    } catch (e: any) {
      this.logger.error(`L4 Claude 失败: ${e?.message || e}`);
      // fallback 中性分,不阻塞主线
      return {
        layer: 'L4',
        score: 0.5,
        decision: 'REVIEW',
        subScores: {
          hookStrength: 0.5,
          messageCompleteness: 0.5,
          audienceMatch: 0.5,
          ctaClarity: 0.5,
          emotionalResonance: 0.5,
          brandFit: 0.5,
        },
        modelVersion: cfg.model,
        evidence: [{ note: `L4 评审失败, fallback 中性分: ${(e?.message || String(e)).slice(0, 100)}` }],
        critique: '商业价值评审暂时不可用, 暂用中性评分。',
      };
    }

    const parsed = parseJsonSafe(text);
    if (!parsed) {
      this.logger.warn(`L4 输出无法解析: ${text.slice(0, 200)}`);
      return {
        layer: 'L4',
        score: 0.5,
        decision: 'REVIEW',
        subScores: {
          hookStrength: 0.5,
          messageCompleteness: 0.5,
          audienceMatch: 0.5,
          ctaClarity: 0.5,
          emotionalResonance: 0.5,
          brandFit: 0.5,
        },
        modelVersion: cfg.model,
        evidence: [{ note: `L4 输出非 JSON, fallback 中性分` }],
        critique: text.slice(0, 200) || 'LLM 输出无法解析',
      };
    }

    const subScores = {
      hookStrength: clamp(this.num(parsed?.subScores?.hookStrength)),
      messageCompleteness: clamp(this.num(parsed?.subScores?.messageCompleteness)),
      audienceMatch: clamp(this.num(parsed?.subScores?.audienceMatch)),
      ctaClarity: clamp(this.num(parsed?.subScores?.ctaClarity)),
      emotionalResonance: clamp(this.num(parsed?.subScores?.emotionalResonance)),
      brandFit: clamp(this.num(parsed?.subScores?.brandFit)),
    };
    const score = clamp(
      (subScores.hookStrength +
        subScores.messageCompleteness +
        subScores.audienceMatch +
        subScores.ctaClarity +
        subScores.emotionalResonance +
        subScores.brandFit) /
        6,
    );

    const rawEvidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];
    const evidence: EvidenceClip[] = rawEvidence.slice(0, 4).map((e: any) => ({
      text: typeof e?.text === 'string' ? e.text : undefined,
    }));

    return {
      layer: 'L4',
      score,
      decision: score >= 0.7 ? 'PASS' : score >= 0.5 ? 'REVIEW' : 'FAIL',
      subScores,
      modelVersion: cfg.model,
      evidence,
      critique: typeof parsed.critique === 'string' ? parsed.critique.slice(0, 500) : '',
    };
  }

  private async getClient(): Promise<CachedClient & { configId: string }> {
    const cfg = await this.llmConfig.getActive();
    let cached = this.clientCache.get(cfg.configId);
    if (!cached) {
      cached = {
        client: new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl }),
        model: cfg.model,
      };
      this.clientCache.set(cfg.configId, cached);
    }
    return { ...cached, configId: cfg.configId };
  }

  private num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
}

function parseJsonSafe(text: string): any {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const obj = candidate.match(/\{[\s\S]*\}/);
    if (obj) {
      try { return JSON.parse(obj[0]); } catch { return null; }
    }
    return null;
  }
}
