import { IsString, Length, MinLength, MaxLength } from 'class-validator';

export class AdminAcceptDto {
  @IsString()
  @Length(5, 50, { message: '受理号长度 5-50' })
  applicationNo!: string;
}

export class AdminCertifyDto {
  @IsString()
  @Length(5, 50, { message: '证书号长度 5-50' })
  certificateNo!: string;
}

export class AdminRejectDto {
  @IsString()
  @MinLength(5, { message: '拒绝原因至少 5 字' })
  @MaxLength(500, { message: '拒绝原因不超过 500 字' })
  reason!: string;
}