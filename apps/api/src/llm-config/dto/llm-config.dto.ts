import { IsBoolean, IsIn, IsOptional, IsString, Length, MinLength } from 'class-validator';

const PROVIDERS = ['minimax', 'anthropic', 'openai', 'dashscope', 'custom'] as const;

export class CreateLlmConfigDto {
  @IsIn(PROVIDERS)
  provider!: string;

  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsString()
  @MinLength(8)
  baseUrl!: string;

  @IsString()
  @MinLength(2)
  model!: string;

  @IsString()
  @Length(8, 512)
  apiKey!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  setActive?: boolean;
}

export class UpdateLlmConfigDto {
  @IsOptional()
  @IsIn(PROVIDERS)
  provider?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  model?: string;

  @IsOptional()
  @IsString()
  @Length(8, 512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string;
}

export class SetActiveDto {
  @IsString()
  id!: string;
}

export class TestConnectionDto {
  @IsString()
  id!: string;
}