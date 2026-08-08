import { Injectable, Logger } from '@nestjs/common';
import { BaseAiDriver, GenerateInput, GenerateOutput } from './base.driver';
import { getToolConfig } from '../cost.config';

/**
 * 可灵 (快手) driver — mock 阶段
 * 真实接入:Kling Open Platform (https://api.klingai.com)
 */
@Injectable()
export class KlingDriver extends BaseAiDriver {
  readonly toolName = 'kling';
  private readonly logger = new Logger(KlingDriver.name);

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const cfg = getToolConfig(this.toolName)!;
    const dur = input.durationSec ?? cfg.defaultDurationSec;
    const costCents = Math.round(cfg.unitCostCents * dur);
    const start = Date.now();

    await new Promise((r) => setTimeout(r, Math.min(cfg.mockDurationMs, 600)));
    const durationMs = Date.now() - start;

    const outputUrl = `https://mock.ibi.ren/ai-tools/kling/${Date.now()}.mp4`;
    this.logger.log(`kling mock generate dur=${dur}s cost=${costCents}c`);

    return {
      outputUrl,
      costCents,
      durationMs,
      raw: {
        provider: 'kling',
        model: 'kling-v1',
        durationSec: dur,
        resolution: input.resolution ?? cfg.defaultResolution,
        mocked: true,
      },
    };
  }
}