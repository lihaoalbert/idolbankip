/**
 * 阿里云通义万相 (DashScope / Model Studio 专用端点) — AI 图生成
 *
 * 用户提供的专用端点 (Bailian 部署) — 走标准 DashScope async API:
 *   1) POST /api/v1/services/aigc/text2image/image-synthesis   → task_id
 *   2) GET  /api/v1/tasks/{task_id}                            → 轮询到 SUCCEEDED
 *   3) 下载 results[0].url → Buffer
 *
 * 模型: wanx2.1-t2i-turbo (5-10s/张, ~¥0.08/张)
 *
 * 失败处理: 全部走 ServiceUnavailableException (503), 前端展示"AI 服务暂不可用"
 * 配置缺失: apiKey 为空 或 host 为空 → 视为未配置
 */
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DashScopeImageGenOpts {
  prompt: string;
  /** 输出尺寸, 默认 1024*1024 (square). 16:9 用 1280*720 */
  size?: string;
  /** 模型覆盖, 默认 wanx2.1-t2i-turbo */
  model?: string;
}

@Injectable()
export class DashScopeProvider {
  private readonly logger = new Logger(DashScopeProvider.name);
  private readonly apiKey: string;
  private readonly host: string;
  private readonly defaultModel: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('DASHSCOPE_API_KEY', '');
    this.host = config.get<string>('DASHSCOPE_HOST', '').replace(/\/+$/, '');
    this.defaultModel = config.get<string>('DASHSCOPE_MODEL', 'wanx2.1-t2i-turbo');
    if (!this.isConfigured()) {
      this.logger.warn('DASHSCOPE_API_KEY 或 DASHSCOPE_HOST 未配置, AI 图生成会 503');
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.host;
  }

  /**
   * 调通义万相生成一张图
   * 流程: 提交异步任务 → 轮询最多 60s → 下载结果
   * 返回: jpeg/png Buffer (MIME 由通义万相决定, 通常 image/jpeg)
   */
  async imageGen(opts: DashScopeImageGenOpts): Promise<{ buffer: Buffer; mime: string }> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('通义万相未配置 (DASHSCOPE_API_KEY / DASHSCOPE_HOST 缺失)');
    }
    const model = opts.model || this.defaultModel;
    const size = opts.size || '1024*1024';

    // 1. 提交任务
    const submitUrl = `${this.host}/api/v1/services/aigc/text2image/image-synthesis`;
    let taskId: string;
    try {
      const submitRes = await fetch(submitUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: { prompt: opts.prompt },
          parameters: { size, n: 1 },
        }),
      });
      if (!submitRes.ok) {
        const errText = await submitRes.text();
        this.logger.error(`DashScope submit HTTP ${submitRes.status}: ${errText.slice(0, 500)}`);
        throw new ServiceUnavailableException(`通义万相提交失败 (HTTP ${submitRes.status})`);
      }
      const submitJson: any = await submitRes.json();
      taskId = submitJson?.output?.task_id;
      if (!taskId) {
        this.logger.error(`DashScope submit no task_id: ${JSON.stringify(submitJson).slice(0, 500)}`);
        throw new ServiceUnavailableException('通义万相提交未返回 task_id');
      }
      this.logger.log(`imageGen submitted: model=${model} size=${size} task=${taskId}`);
    } catch (e: any) {
      if (e instanceof ServiceUnavailableException) throw e;
      this.logger.error(`DashScope submit 网络错误: ${e?.message || e}`);
      throw new ServiceUnavailableException('通义万相服务暂不可用');
    }

    // 2. 轮询直到 SUCCEEDED / FAILED, 最多 60s
    const pollUrl = `${this.host}/api/v1/tasks/${taskId}`;
    const deadline = Date.now() + 60_000;
    let imageUrl: string | null = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2_000));
      let pollJson: any;
      try {
        const pollRes = await fetch(pollUrl, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        if (!pollRes.ok) {
          this.logger.warn(`DashScope poll HTTP ${pollRes.status}, retrying...`);
          continue;
        }
        pollJson = await pollRes.json();
      } catch (e: any) {
        this.logger.warn(`DashScope poll 网络错误: ${e?.message || e}, retrying...`);
        continue;
      }
      const status = pollJson?.output?.task_status;
      if (status === 'SUCCEEDED') {
        imageUrl = pollJson?.output?.results?.[0]?.url ?? null;
        break;
      }
      if (status === 'FAILED') {
        this.logger.error(`DashScope task FAILED: ${JSON.stringify(pollJson).slice(0, 500)}`);
        throw new ServiceUnavailableException('通义万相生成失败 (内容审核/限流)');
      }
      // PENDING / RUNNING — 继续轮询
    }
    if (!imageUrl) {
      throw new ServiceUnavailableException('通义万相生成超时 (60s)');
    }

    // 3. 下载结果
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      this.logger.error(`DashScope 结果下载 HTTP ${imgRes.status}`);
      throw new ServiceUnavailableException(`通义万相结果下载失败 (HTTP ${imgRes.status})`);
    }
    const ab = await imgRes.arrayBuffer();
    const buffer = Buffer.from(ab);
    const mime = imgRes.headers.get('content-type') || 'image/jpeg';
    this.logger.log(`imageGen done: task=${taskId} size=${buffer.length}B mime=${mime}`);
    return { buffer, mime };
  }
}
