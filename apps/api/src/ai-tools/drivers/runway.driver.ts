import { Injectable, Logger } from '@nestjs/common';
import { BaseAiDriver, GenerateInput, GenerateOutput } from './base.driver';
import { getToolConfig } from '../cost.config';

/**
 * Runway Gen-3 driver — mock 阶段
 * 真实接入:Runway API (https://api.runwayml.com)
 */
@Injectable()
export class RunwayDriver extends BaseAiDriver {
  readonly toolName = 'runway';
  private readonly logger = new Logger(RunwayDriver.name);

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const cfg = getToolConfig(this.toolName)!;
    const dur = input.durationSec ?? cfg.defaultDurationSec;
    const costCents = Math.round(cfg.unitCostCents * dur);
    const start = Date.now();

    await new Promise((r) => setTimeout(r, Math.min(cfg.mockDurationMs, 900)));
    const durationMs = Date.now() - start;

    const outputUrl = `https://mock.ibi.ren/ai-tools/runway/${Date.now()}.mp4`;
    this.logger.log(`runway mock generate dur=${dur}s cost=${costCents}c`);

    return {
      outputUrl,
      costCents,
      durationMs,
      raw: {
        provider: 'runway',
        model: 'gen-3-alpha',
        durationSec: dur,
        resolution: input.resolution ?? cfg.defaultResolution,
        mocked: true,
      },
    };
  }
}