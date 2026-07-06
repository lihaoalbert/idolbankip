import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PhoneLoginDto {
  @ApiProperty({ example: '13800000000' })
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不对' })
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(8)
  code!: string;

  // 首次注册时必传 (无则返 needRegister: true)
  @ApiProperty({ required: false, example: 'BUYER' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiProperty({ required: false, example: '张三' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;
}
