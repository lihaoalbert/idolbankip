import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl } from 'class-validator';

export class RunQualityEvalDto {
  @IsString()
  briefId!: string;

  /** 可选 — 创作者交付物 ID; 若不传,纯评 brief */
  @IsOptional()
  @IsString()
  deliverableId?: string;

  /** 交付物文件 URL 列表 (OSS),用于 L1 (技术质量) */
  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMaxSize(10)
  deliverableUrls!: string[];

  /** 已抽帧的缩略图,最多 8 张,L2/L4 VLM 主用 */
  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMaxSize(8)
  thumbnailUrls!: string[];

  /** brief 描述 (用于 L4 商业价值比对) */
  @IsString()
  briefDescription!: string;

  /** 创作者交付物自述 — 可选 */
  @IsOptional()
  @IsString()
  deliverableDescription?: string;

  @IsOptional()
  @IsString()
  creatorNote?: string;

  /** 触发者 (默认 system; controller 从 req.user 覆写) */
  @IsOptional()
  @IsString()
  triggeredBy?: string;
}

export class AppealQualityEvalDto {
  @IsString()
  appealReason!: string;
}
