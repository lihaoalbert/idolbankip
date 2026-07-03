import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QualityEvalQueueQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['S', 'A', 'B', 'C'])
  grade?: string;

  @IsOptional()
  @IsString()
  @IsIn(['PASS', 'FAIL', 'REVIEW'])
  decision?: string;

  @IsOptional()
  @IsString()
  briefId?: string;

  @IsOptional()
  @IsString()
  trigger?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class AppealDecisionDto {
  /** overridden (推翻原分) / confirmed (维持原分) */
  @IsString()
  @IsIn(['overridden', 'confirmed'])
  appealDecision!: 'overridden' | 'confirmed';

  /** 复审结果摘要 (overridden 时必填, 含调整后分数) */
  @IsOptional()
  @IsString()
  appealSummary?: string;

  /** 调整后评分 — 仅 overridden 时填, 范围 [0,1] */
  @IsOptional()
  @IsArray()
  newScores?: number[];
}
