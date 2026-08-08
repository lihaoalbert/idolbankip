import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendPhoneCodeDto {
  @ApiProperty({ example: '13800000000', description: '国内 11 位手机号' })
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不对' })
  phone!: string;
}
