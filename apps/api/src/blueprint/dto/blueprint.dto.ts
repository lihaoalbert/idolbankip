import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBlueprintDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  tags?: string;
}

export class UpdateLayerDto {
  @IsObject()
  data!: Record<string, unknown>;
}