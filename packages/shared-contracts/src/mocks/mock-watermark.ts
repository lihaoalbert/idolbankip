import type {
  WatermarkApplyInput,
  WatermarkClient,
  WatermarkExtractResult,
} from '../watermark';

/**
 * Mock 水印: 直接在图片上画一层半透明斜向文字 (visible)。
 * 真实接入时用 OpenCV DWT-SVD 算法。
 *
 * 这里因为是 mock,只声明接口,具体图像处理由 NestJS 模块调用 sharp 实现。
 */
export class MockWatermarkClient implements WatermarkClient {
  async applyInvisible(_input: WatermarkApplyInput): Promise<Buffer> {
    // MVP: 不可见水印也用文本叠加作为占位
    return _input.imageBuffer;
  }

  async applyVisible(_input: { imageBuffer: Buffer; text: string }): Promise<Buffer> {
    return _input.imageBuffer;
  }

  async extractInvisible(_imageBuffer: Buffer): Promise<WatermarkExtractResult> {
    return { ok: false };
  }
}