/**
 * 阿里云通义 wan2.x 图像生成 (DashScope multimodal-generation 端点)
 *
 * 走同步 API — 一次调用直接返回图片 URL, 不需要轮询:
 *   POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
 *   body: { model, input.messages[].content[].text, parameters.size, parameters.n }
 *   resp: { output.choices[0].message.content[].image } — URL
 *
 * 模型: wan2.7-image-pro (同步, 高质量, ~¥0.1/张)
 *
 * 为什么不走用户的 Bailian 专用端 (llm-kws2k62lct9sz57k.cn-beijing.maas.aliyuncs.com):
 * - 该端点只部署了文本 (qwen-plus 等), 不含图像生成的 multimodal-generation 路由
 * - 公网 dashscope.aliyuncs.com 才是阿里云官方推荐的统一端点
 * - 同一个 API key 两边通用, 文本走专用端, 图像走公网端
 *
 * 失败处理: 全部走 ServiceUnavailableException (503), 前端展示"AI 服务暂不可用"
 * 配置缺失: apiKey 为空 → 视为未配置
 */
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DashScopeImageGenOpts {
  prompt: string;
  /** 输出尺寸, 默认 1024*1024 (square). 16:9 用 1280*720 */
  size?: string;
  /** 模型覆盖, 默认 wan2.7-image-pro */
  model?: string;
}

@Injectable()
export class DashScopeProvider {
  private readonly logger = new Logger(DashScopeProvider.name);
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly defaultModel: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('DASHSCOPE_API_KEY', '');
    // 公网端点是 multimodal-generation — wan2.x 同步出图的唯一路径
    // 用户的 DASHSCOPE_HOST 是 Bailian 专用端 (只跑文本), 这里硬编码公网端
    this.endpoint = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
    this.defaultModel = config.get<string>('DASHSCOPE_MODEL', 'wan2.7-image-pro');
    if (!this.isConfigured()) {
      this.logger.warn('DASHSCOPE_API_KEY 未配置, AI 图生成会 503');
    } else {
      this.logger.log(`DashScope configured: endpoint=${this.endpoint} model=${this.defaultModel}`);
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * 调通义 wan2.x 生成一张图 (同步)
   * 返回: jpeg/png Buffer + MIME (由 DashScope 决定, 通常 image/png)
   */
  async imageGen(opts: DashScopeImageGenOpts): Promise<{ buffer: Buffer; mime: string }> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('通义万相未配置 (DASHSCOPE_API_KEY 缺失)');
    }
    const model = opts.model || this.defaultModel;
    const size = opts.size || '1024*1024';

    // 1. 同步提交 — 直接返回 image URL
    let imageUrl: string | null = null;
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: {
            messages: [
              { role: 'user', content: [{ text: opts.prompt }] },
            ],
          },
          parameters: { size, n: 1 },
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        this.logger.error(`DashScope HTTP ${res.status}: ${errText.slice(0, 500)}`);
        // 403 "synchronous calls" → API key 没开图生成权限
        const isImageScopeIssue = res.status === 403 && /synchronous calls|image|通义万相/i.test(errText);
        // 400 "url error" → 模型名错 / 端点错
        const isUrlError = res.status === 400 && /url error/i.test(errText);
        const msg = isImageScopeIssue
          ? '通义万相提交失败 (HTTP 403): API key 未开通图像生成权限, 请到阿里云百炼控制台 → API-Key 管理 → 给此 key 开通【通义万相】服务'
          : isUrlError
            ? '通义万相提交失败 (HTTP 400): 模型名或端点无效, 请检查 DASHSCOPE_MODEL 配置 (当前: ' + model + ')'
            : `通义万相提交失败 (HTTP ${res.status})`;
        throw new ServiceUnavailableException(msg);
      }
      const json: any = await res.json();
      // multimodal-generation 响应: output.choices[0].message.content[].image
      const content = json?.output?.choices?.[0]?.message?.content ?? [];
      const imgItem = Array.isArray(content) ? content.find((c: any) => c?.image) : null;
      imageUrl = imgItem?.image ?? null;
      if (!imageUrl) {
        this.logger.error(`DashScope no image in response: ${JSON.stringify(json).slice(0, 500)}`);
        throw new ServiceUnavailableException('通义万相未返回图片 (内容审核拒绝或响应格式异常)');
      }
      this.logger.log(`imageGen done: model=${model} size=${size} url=${imageUrl.slice(0, 80)}...`);
    } catch (e: any) {
      if (e instanceof ServiceUnavailableException) throw e;
      this.logger.error(`DashScope 网络错误: ${e?.message || e}`);
      throw new ServiceUnavailableException('通义万相服务暂不可用');
    }

    // 2. 下载结果
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      this.logger.error(`DashScope 结果下载 HTTP ${imgRes.status}`);
      throw new ServiceUnavailableException(`通义万相结果下载失败 (HTTP ${imgRes.status})`);
    }
    const ab = await imgRes.arrayBuffer();
    const buffer = Buffer.from(ab);
    const mime = imgRes.headers.get('content-type') || 'image/png';
    this.logger.log(`imageGen buffer: size=${buffer.length}B mime=${mime}`);
    return { buffer, mime };
  }
}