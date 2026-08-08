import { IsString } from 'class-validator';

export class RecognizeFaceDto {
  @IsString()
  fileId!: string;
}