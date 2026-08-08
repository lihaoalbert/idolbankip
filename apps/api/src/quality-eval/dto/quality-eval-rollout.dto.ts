/**
 * QualityEvalRollout DTO — W2.5 D13-D14 A/B 切流 admin 配置
 */
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateQualityEvalRolloutDto {
  @IsOptional()
  @IsIn(['off', 'shadow', 'active'])
  mode?: 'off' | 'shadow' | 'active';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPct?: number;

  @IsOptional()
  @IsString()
  note?: string;
}