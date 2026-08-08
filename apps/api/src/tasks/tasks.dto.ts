// #30 任务发布 / 接单 — DTO
// spec JSON 包含任务规格: { count, gender?, ageBuckets?, ethnicities?, styleTags?, scenarioTags? }
//
// 创作者接单时不需要传 body, 后端从 user.id + taskId 关联。
// admin 发布任务时:
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AgeBucket, Ethnicity, Gender } from '@prisma/client';

export class TaskSpecDto {
  // 期望产出 IP 数 (用于 admin 端显示"还需要 X 个"提示, 不强制创作者一定交多少)
  @IsInt() @Min(1) count!: number;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsArray() @IsEnum(AgeBucket, { each: true }) @ArrayMaxSize(4)
  ageBuckets?: AgeBucket[];
  @IsOptional() @IsArray() @IsEnum(Ethnicity, { each: true }) @ArrayMaxSize(6)
  ethnicities?: Ethnicity[];
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  styleTags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  scenarioTags?: string[];
}

export class CreateTaskDto {
  @IsString() @MinLength(3) @MaxLength(100) title!: string;
  @IsString() @MinLength(10) @MaxLength(5000) description!: string;
  @ValidateNested() @Type(() => TaskSpecDto) spec!: TaskSpecDto;
  @IsInt() @Min(1) budgetFen!: number;       // 总预算 (分), ≥ 1 元
  @IsOptional() @IsInt() @Min(1) perIpFen?: number;  // 单 IP 报酬 (分)
  @IsInt() @Min(1) maxAccepts!: number;      // 最多多少创作者接
  @IsDateString() deadlineAt!: string;       // ISO 字符串
}

export class UpdateTaskStatusDto {
  // 状态流转: OPEN → CLOSED / CANCELLED; CLOSED → COMPLETED
  @IsString() action!: 'CLOSE' | 'CANCEL' | 'COMPLETE';
}
