import { Injectable, Logger } from '@nestjs/common';
import { BaseAiDriver, GenerateInput, GenerateOutput } from './base.driver';
import { getToolConfig } from '../cost.config';

/**
 * 即梦 (字节) driver — mock 阶段
 * 真实接入:火山引擎即梦 API (https://www.volcengine.com/docs/85128)
 */
@Injectable()
export class JimengDriver extends BaseAiDriver {
  readonly toolName = 'jimeng';
  private readonly logger = new Logger(JimengDriver.name);

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const cfg = getToolConfig(this.toolName)!;
    const dur = input.durationSec ?? cfg.defaultDurationSec;
    const costCents = Math.round(cfg.unitCostCents * dur);
    const start = Date.now();

    await new Promise((r) => setTimeout(r, Math.min(cfg.mockDurationMs, 500)));
    const durationMs = Date.now() - start;

    const outputUrl = `https://mock.ibi.ren/ai-tools/jimeng/${Date.now()}.mp4`;
    this.logger.log(`jimeng mock generate dur=${dur}s cost=${costCents}c`);

    return {
      outputUrl,
      costCents,
      durationMs,
      raw: {
        provider: 'jimeng',
        model: 'jimeng-3.0',
        durationSec: dur,
        resolution: input.resolution ?? cfg.defaultResolution,
        mocked: true,
      },
    };
  }
}