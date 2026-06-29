import { IsArray, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatHistoryMessageDto {
  @IsString()
  @MaxLength(2000)
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class RouteContextDto {
  /** 前端当前路由, e.g. "/creator/onboard" — service 写到 audit 字段 */
  @IsOptional() @IsString() @MaxLength(200)
  route?: string;

  /**
   * 关键 query 参数, e.g. { ipCode: "IBI-2026-0001", orderId: "ckxxx" }。
   * 只用于拼 user 消息里的上下文行, 不落 audit (隐私)。
   */
  @IsOptional() @IsObject()
  query?: Record<string, string>;
}

export class ChatDto {
  /** 用户最新一条消息 — 必填, 长度 1~2000 */
  @IsString() @MaxLength(2000)
  message!: string;

  /** 历史消息(可选), 最多 20 条, 服务端做截断兜底 */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryMessageDto)
  history?: ChatHistoryMessageDto[];

  /** 路由上下文 — 用户当前在哪个页面 */
  @IsOptional() @ValidateNested() @Type(() => RouteContextDto)
  routeContext?: RouteContextDto;
}