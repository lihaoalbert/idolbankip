import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WechatBindDto {
  @ApiProperty({ description: '扫码后拿到的微信 code, mock 模式可传 mock' })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  wechatCode!: string;

  @ApiProperty({ description: '32 字节 state, GET /qr-url 时拿, 区分 LOGIN/BIND 流程' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  state!: string;

  @ApiProperty({ required: false, description: '已登录用户 BIND 时可不传 phone; 新用户 LOGIN 必传' })
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不对' })
  phone?: string;

  @ApiProperty({ required: false, description: '手机验证码 (LOGIN 流程补手机号时必传)' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(8)
  phoneCode?: string;

  @ApiProperty({ required: false, description: 'displayName (LOGIN 流程补手机号时, 首次注册需要)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;

  @ApiProperty({ required: false, description: 'role (LOGIN 流程补手机号时, 首次注册需要)' })
  @IsOptional()
  @IsString()
  role?: string;
}
