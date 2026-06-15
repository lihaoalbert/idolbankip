export type WatermarkAlgorithm = 'DWT_SVD' | 'VISIBLE_TEXT';

export interface WatermarkApplyInput {
  imageBuffer: Buffer;
  payload: string; // creatorId + ipCode + timestamp
  algorithm: WatermarkAlgorithm;
}

export interface WatermarkExtractResult {
  ok: boolean;
  payload?: string;
  algorithm?: WatermarkAlgorithm;
}

export interface WatermarkClient {
  applyVisible(input: { imageBuffer: Buffer; text: string }): Promise<Buffer>;
  applyInvisible(input: WatermarkApplyInput): Promise<Buffer>;
  extractInvisible(imageBuffer: Buffer): Promise<WatermarkExtractResult>;
}

export const WATERMARK_CLIENT = Symbol('WATERMARK_CLIENT');