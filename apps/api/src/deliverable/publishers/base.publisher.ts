/**
 * # W4 D3 — 多平台发布 adapter (mock)
 *
 * 抽象 IPublisher 接口 + 3 个 mock 实现 + PublisherFactory
 * 真实场景: 调抖音/视频号/小红书开放平台 SDK,提交视频 + 轮询审核状态
 * 当前阶段: mock — 立即返一个 platform URL
 *
 * 凭据到位后: 在 PublisherFactory 加 AliyunMtsService / DouyinOpenApi 等真 driver
 * 切换点: 只需替换 publish() 实现,接口签名不变
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PublishInput {
  videoUrl: string;
  title: string;
  description?: string;
  tags?: string[];
}

export interface PublishOutput {
  platformUrl: string;
  publishedAt: Date;
  rawResponse?: Record<string, unknown>;
}

export interface IPublisher {
  readonly platform: string;
  publish(input: PublishInput): Promise<PublishOutput>;
}

@Injectable()
export abstract class BaseMockPublisher implements IPublisher {
  abstract readonly platform: string;
  protected readonly logger = new Logger(this.constructor.name);

  async publish(input: PublishInput): Promise<PublishOutput> {
    const id = Math.random().toString(36).slice(2, 10);
    const platformUrl = `https://mock-${this.platform}.ibi.ren/${id}`;
    this.logger.log(
      `[mock] published video=${input.videoUrl} → ${platformUrl}`,
    );
    return {
      platformUrl,
      publishedAt: new Date(),
      rawResponse: {
        mock: true,
        platform: this.platform,
        videoUrl: input.videoUrl,
        title: input.title,
      },
    };
  }
}

@Injectable()
export class DouyinPublisher extends BaseMockPublisher {
  readonly platform = 'douyin';
}

@Injectable()
export class WechatPublisher extends BaseMockPublisher {
  readonly platform = 'wechat';
}

@Injectable()
export class XiaohongshuPublisher extends BaseMockPublisher {
  readonly platform = 'xiaohongshu';
}

/**
 * 工厂 — 按 platform 找对应 publisher
 * 切换点: 凭据到位后,alibaba/openapi 实现类也注册到这里
 */
@Injectable()
export class PublisherFactory {
  private readonly logger = new Logger(PublisherFactory.name);
  private readonly registry = new Map<string, IPublisher>();

  constructor(
    private readonly config: ConfigService,
    douyin: DouyinPublisher,
    wechat: WechatPublisher,
    xiaohongshu: XiaohongshuPublisher,
  ) {
    this.registry.set(douyin.platform, douyin);
    this.registry.set(wechat.platform, wechat);
    this.registry.set(xiaohongshu.platform, xiaohongshu);
  }

  resolve(platform: string): IPublisher {
    const p = this.registry.get(platform);
    if (!p) {
      throw new Error(
        `platform ${platform} 暂不支持 (已注册: ${Array.from(this.registry.keys()).join(', ')})`,
      );
    }
    return p;
  }
}

/**
 * Facade — 给 DeliverableService 用
 */
@Injectable()
export class PublisherService {
  constructor(private readonly factory: PublisherFactory) {}

  publish(platform: string, input: PublishInput): Promise<PublishOutput> {
    return this.factory.resolve(platform).publish(input);
  }
}