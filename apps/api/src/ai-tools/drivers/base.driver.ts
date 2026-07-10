/**
 * AI 工具 driver 抽象基类
 * W3 W2 — 4 个 AI 工具 (sora/kling/jimeng/runway) 接入统一接口
 *
 * mock 阶段:返回固定 outputUrl + 估算耗时
 * 真 Key 到位后:每个 driver 的 generate() 改成对应厂商 API
 */
export interface GenerateInput {
  prompt: string;
  durationSec?: number;
  resolution?: string;
  imageCount?: number;
}

export interface GenerateOutput {
  outputUrl: string;
  costCents: number;
  durationMs: number;
  /** 真实厂商返回的 metadata,记录到 AIGenerationRecord */
  raw?: Record<string, unknown>;
}

export abstract class BaseAiDriver {
  abstract readonly toolName: string;
  /** 调用外部 API(或 mock)生成 */
  abstract generate(input: GenerateInput): Promise<GenerateOutput>;
}