import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AssetType } from '@prisma/client';

// 仅这 3 种图片支持 AI 生成 (面部特写是版权登记核心,必须创作者亲手传)
export const AI_GENERATABLE_ASSET_TYPES = [
  AssetType.THREE_VIEW,
  AssetType.EXPRESSION_GRID,
  AssetType.TRANSPARENT_RENDER,
] as const;

export class GenerateImageDto {
  @IsString()
  ipId!: string;

  @IsEnum(AssetType)
  imageType!: AssetType; // THREE_VIEW | EXPRESSION_GRID | TRANSPARENT_RENDER

  // 暂不暴露给前端 (产品 MVP 简化), 留接口后续做 prompt 编辑器
  @IsOptional()
  @IsString()
  promptOverride?: string;
}