import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { AssetType } from '@prisma/client';

// 仅这 3 种图片支持 AI 生成 (面部特写是版权登记核心,必须创作者亲手传)
export const AI_GENERATABLE_ASSET_TYPES = [
  AssetType.THREE_VIEW,
  AssetType.EXPRESSION_GRID,
  AssetType.TRANSPARENT_RENDER,
] as const;

// wan2.7-image-pro 实际支持的尺寸 (实测, 总像素需 ≥ 589824 且 ≤ 16777216)
export const ALLOWED_IMAGE_SIZES = [
  '1024*1024',
  '1280*720',
  '720*1280',
] as const;

export class GenerateImageDto {
  @IsString()
  ipId!: string;

  @IsEnum(AssetType)
  imageType!: AssetType; // THREE_VIEW | EXPRESSION_GRID | TRANSPARENT_RENDER

  /**
   * 输出尺寸, 可选. 不传则用 IMAGE_GEN_SIZES[imageType] 的默认值.
   * 白名单校验 — 不在白名单直接 400 拒绝, 防止前端瞎传触发 wan 端 400.
   */
  @IsOptional()
  @IsIn(ALLOWED_IMAGE_SIZES as unknown as string[])
  size?: string;

  // 暂不暴露给前端 (产品 MVP 简化), 留接口后续做 prompt 编辑器
  @IsOptional()
  @IsString()
  promptOverride?: string;
}