import { Injectable, Logger } from '@nestjs/common';
import { BaseAiDriver, GenerateInput, GenerateOutput } from './base.driver';
import { estimateCost, getToolConfig } from '../cost.config';

/**
 * Sora (OpenAI) driver — mock 阶段
 * 真实接入:调用 OpenAI Sora API (https://api.openai.com/v1/sora/generations)
 * 鉴权:OPENAI_API_KEY (从 ConfigService 拿,当前 driver 不读)
 */
@Injectable()
export class SoraDriver extends BaseAiDriver {
  readonly toolName = 'sora';
  private readonly logger = new Logger(SoraDriver.name);

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const cfg = getToolConfig(this.toolName)!;
    const dur = input.durationSec ?? cfg.defaultDurationSec;
    const costCents = Math.round(cfg.unitCostCents * dur);
    const start = Date.now();

    // mock: 模拟 API 调用耗时
    await new Promise((r) => setTimeout(r, Math.min(cfg.mockDurationMs, 800)));

    const durationMs = Date.now() - start;
    const outputUrl = `https://mock.ibi.ren/ai-tools/sora/${Date.now()}.mp4`;
    this.logger.log(`sora mock generate dur=${dur}s cost=${costCents}c output=${outputUrl}`);

    return {
      outputUrl,
      costCents,
      durationMs,
      raw: {
        provider: 'openai-sora',
        model: 'sora-1.0',
        durationSec: dur,
        resolution: input.resolution ?? cfg.defaultResolution,
        mocked: true,
      },
    };
  }
}