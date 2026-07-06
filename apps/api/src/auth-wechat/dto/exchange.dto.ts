import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WechatExchangeDto {
  @ApiProperty({ description: '微信回调 code, mock 模式可传 mock' })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  code!: string;

  @ApiProperty({ description: '/qr-url 返回的 state, 32 字节随机' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  state!: string;
}
