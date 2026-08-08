import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * # W4 D2 — 阿里云 MTS 转码 service
 *
 * 真实场景: 调 Aliyun Media Transcode Service SDK,提交转码作业 + 轮询结果
 * 当前阶段: mock 实现 — 同步返回 3 个比例的"伪转码" URL
 *
 * 凭据到位后: 改用 @alicloud/mts20140618 SDK,异步轮询 → webhook 回调
 * 替换点: 只需替换 transcode() 实现,接口签名保持不变
 */

export type TranscodeRatio = '9:16' | '16:9' | '1:1';

export const SUPPORTED_RATIOS: TranscodeRatio[] = ['9:16', '16:9', '1:1'];

export interface TranscodeInput {
  sourceUrl: string;
  ratios: TranscodeRatio[];
  /** 目标分辨率 — 不指定则按 ratio 选默认 (1080p / 1080p / 1080x1080) */
  resolution?: string;
}

export interface TranscodeOutputItem {
  ratio: TranscodeRatio;
  url: string;
  duration: number;
  fileSize: number;
}

export interface TranscodeOutput {
  jobId: string;
  items: TranscodeOutputItem[];
}

export interface IMtsService {
  transcode(input: TranscodeInput): Promise<TranscodeOutput>;
}

@Injectable()
export class MockMtsService implements IMtsService {
  private readonly logger = new Logger(MockMtsService.name);

  constructor(private readonly config: ConfigService) {}

  async transcode(input: TranscodeInput): Promise<TranscodeOutput> {
    const jobId = `mock-mts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const items: TranscodeOutputItem[] = input.ratios.map((ratio) => {
      const ext = input.sourceUrl.split('.').pop() ?? 'mp4';
      const base = input.sourceUrl.replace(/\.[^./]+$/, '');
      return {
        ratio,
        url: `${base}.${ratio.replace(':', 'x')}.${ext}`,
        duration: 30,
        fileSize: 5_000_000 + Math.floor(Math.random() * 5_000_000),
      };
    });
    this.logger.log(
      `[mock] transcode jobId=${jobId} ratios=${input.ratios.join(',')} → ${items.length} items`,
    );
    return { jobId, items };
  }
}

/**
 * 工厂 — 凭据到位后切真 driver
 * 切换点: env MTS_DRIVER=aliyun 时返回 AliyunMtsService (后续实现)
 */
@Injectable()
export class MtsServiceFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly mock: MockMtsService,
  ) {}

  resolve(): IMtsService {
    const driver = this.config.get<string>('MTS_DRIVER', 'mock');
    switch (driver) {
      case 'aliyun':
        // TODO: return new AliyunMtsService(this.config);
        this.logger.warn('MTS_DRIVER=aliyun 但 AliyunMtsService 尚未实现, 暂用 mock');
        return this.mock;
      case 'mock':
      default:
        return this.mock;
    }
  }

  private readonly logger = new Logger(MtsServiceFactory.name);
}

/**
 * 给 controller 用的 facade — 直接拿工厂的 driver
 */
@Injectable()
export class MtsService {
  private readonly logger = new Logger(MtsService.name);

  constructor(private readonly factory: MtsServiceFactory) {}

  transcode(input: TranscodeInput): Promise<TranscodeOutput> {
    return this.factory.resolve().transcode(input);
  }
}