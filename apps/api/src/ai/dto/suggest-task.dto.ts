import { IsString, MaxLength, MinLength } from 'class-validator';

export class SuggestTaskDto {
  @IsString()
  @MinLength(5, { message: '描述至少 5 字' })
  @MaxLength(2000)
  description!: string;
}