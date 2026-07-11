/**
 * W6-R1 Intent Router — intent 枚举 + 参数 schema
 *
 * 12 个 intent 覆盖 buyer/creator 主流程。每个有自己的 param schema (class-validator,
 * 跟项目其它 DTO 一致, 不引新包)。
 *
 * 设计要点:
 *  1. IntentType 字面量联合 — 编译期穷尽, 加新 intent 必须改这里
 *  2. parseIntent(raw): 严格校验, 失败返 { intent: null } (fallback, 不抛)
 *  3. REQUIRES_CONFIRMATION 映射表 — 前端 import 同一份决定要不要弹卡片
 *  4. 注入检测正则 — assistant.service.chat 调用前先过这里
 *
 * 为什么不用 zod: 项目其它 DTO 全是 class-validator, 统一风格。
 */
import { plainToInstance } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  validateSync,
} from 'class-validator';

export type IntentType =
  | 'LIST_BRIEFS'
  | 'SHOW_BID'
  | 'PLACE_BID'
  | 'ACCEPT_BID'
  | 'OPEN_WORKSPACE'
  | 'SHOW_WORKSPACE_STATUS'
  | 'UPLOAD_DELIVERABLE'
  | 'CREATE_REVIEW'
  | 'UPLOAD_IP'
  | 'KYC_SUBMIT'
  | 'NAVIGATE'
  | 'ASK_CLARIFICATION';

export const INTENT_TYPES = [
  'LIST_BRIEFS',
  'SHOW_BID',
  'PLACE_BID',
  'ACCEPT_BID',
  'OPEN_WORKSPACE',
  'SHOW_WORKSPACE_STATUS',
  'UPLOAD_DELIVERABLE',
  'CREATE_REVIEW',
  'UPLOAD_IP',
  'KYC_SUBMIT',
  'NAVIGATE',
  'ASK_CLARIFICATION',
] as const;

/** 写操作意图必须 UI 卡片确认才能落库 */
export const REQUIRES_CONFIRMATION: Record<IntentType, boolean> = {
  LIST_BRIEFS: false,
  SHOW_BID: false,
  PLACE_BID: true,
  ACCEPT_BID: true,
  OPEN_WORKSPACE: false,
  SHOW_WORKSPACE_STATUS: false,
  UPLOAD_DELIVERABLE: true,
  CREATE_REVIEW: true,
  UPLOAD_IP: true,
  KYC_SUBMIT: true,
  NAVIGATE: false,
  ASK_CLARIFICATION: false,
};

/** 中文标签 — 给前端 chip 显示 + 审计可读 */
export const INTENT_LABELS: Record<IntentType, string> = {
  LIST_BRIEFS: '列出可接发包',
  SHOW_BID: '查看投标详情',
  PLACE_BID: '提交投标',
  ACCEPT_BID: '接受投标',
  OPEN_WORKSPACE: '打开工作区',
  SHOW_WORKSPACE_STATUS: '查看工作区状态',
  UPLOAD_DELIVERABLE: '上传交付物',
  CREATE_REVIEW: '写评价',
  UPLOAD_IP: '上传 IP',
  KYC_SUBMIT: '提交实名',
  NAVIGATE: '跳转页面',
  ASK_CLARIFICATION: '追问澄清',
};

// =============================================================
// 12 个 Param DTO — class-validator 校验
// =============================================================

export class ListBriefsParams {
  @IsOptional() @IsIn(['open', 'all'])
  status?: 'open' | 'all';
}

export class IdOnlyParams {
  @IsString() @MaxLength(64)
  id!: string;
}

export class ShowBidParams {
  @IsString() @MaxLength(64)
  bidId!: string;
}

export class PlaceBidParams {
  @IsString() @MaxLength(64)
  briefId!: string;

  @IsNumber() @Min(1) @Max(1_000_000)
  price!: number;

  @IsInt() @Min(1) @Max(365)
  deliveryDays!: number;

  @IsString() @MaxLength(2000)
  proposal!: string;
}

export class AcceptBidParams {
  @IsString() @MaxLength(64)
  briefId!: string;

  @IsString() @MaxLength(64)
  bidId!: string;
}

export class OpenWorkspaceParams {
  @IsString() @MaxLength(64)
  workspaceId!: string;
}

export class ShowWorkspaceStatusParams {
  @IsString() @MaxLength(64)
  workspaceId!: string;
}

export class UploadDeliverableParams {
  @IsString() @MaxLength(64)
  workspaceId!: string;

  @IsString() @MaxLength(32)
  type!: string;

  @IsString() @MaxLength(32)
  platform!: string;

  @IsString() @MaxLength(500)
  url!: string;

  @IsOptional() @IsString() @MaxLength(500)
  thumbnailUrl?: string;
}

export class CreateReviewParams {
  @IsString() @MaxLength(64)
  briefId!: string;

  @IsInt() @Min(1) @Max(5)
  rating!: number;

  @IsString() @MaxLength(2000)
  content!: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];
}

export class UploadIpParams {
  @IsString() @MaxLength(100)
  displayName!: string;

  @IsString() @MaxLength(50)
  category!: string;

  @IsString() @MaxLength(2000)
  description!: string;
}

export class KycSubmitParams {
  @IsString() @MaxLength(100)
  realName!: string;

  @IsString() @MaxLength(50)
  idNumber!: string;
}

export class NavigateParams {
  @IsString() @MaxLength(200)
  route!: string;
}

export class AskClarificationParams {
  @IsString() @MaxLength(500)
  question!: string;
}

const SCHEMA_BY_INTENT: Record<IntentType, any> = {
  LIST_BRIEFS: ListBriefsParams,
  SHOW_BID: ShowBidParams,
  PLACE_BID: PlaceBidParams,
  ACCEPT_BID: AcceptBidParams,
  OPEN_WORKSPACE: OpenWorkspaceParams,
  SHOW_WORKSPACE_STATUS: ShowWorkspaceStatusParams,
  UPLOAD_DELIVERABLE: UploadDeliverableParams,
  CREATE_REVIEW: CreateReviewParams,
  UPLOAD_IP: UploadIpParams,
  KYC_SUBMIT: KycSubmitParams,
  NAVIGATE: NavigateParams,
  ASK_CLARIFICATION: AskClarificationParams,
};

// =============================================================
// 解析器
// =============================================================

export interface ParsedIntent {
  intent: IntentType;
  intentParams: Record<string, unknown>;
  requiresConfirmation: boolean;
}

/**
 * 严格解析 LLM 返回的 intent + intentParams。
 *
 * 失败 (intent 非法 / params 校验不通过 / 缺字段):
 *   → 返 null, 调方走 fallback (只返 reply, 不挂 intent chip)
 *
 * 注意: LLM 可能 null intent 或缺 intentParams — 都视为无意图, 返 null。
 */
export function parseIntent(
  rawIntent: unknown,
  rawParams: unknown,
): ParsedIntent | null {
  if (typeof rawIntent !== 'string') return null;
  if (!(INTENT_TYPES as readonly string[]).includes(rawIntent)) return null;

  const intent = rawIntent as IntentType;
  const paramsObj = isPlainObject(rawParams) ? rawParams : {};

  const DtoClass = SCHEMA_BY_INTENT[intent];
  const instance = plainToInstance(DtoClass, paramsObj, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(instance as object, {
    whitelist: false,
    forbidNonWhitelisted: false,
  });
  if (errors.length > 0) return null;

  // 序列化 (拿真实赋值的字段, 不是 raw)
  const serialized: Record<string, unknown> = {};
  for (const k of Object.keys(paramsObj)) {
    serialized[k] = (instance as any)[k];
  }

  return {
    intent,
    intentParams: serialized,
    requiresConfirmation: REQUIRES_CONFIRMATION[intent],
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// =============================================================
// 注入检测 — 服务端兜底, prompt 内也有声明
// =============================================================

/**
 * 检测用户消息里是否有 prompt injection 痕迹。
 * 命中 → 视作越界, intent=null, reply=OUT_OF_SCOPE_REPLY。
 *
 * 注意: 这是兜底层, 不替代 LLM 自身的理解; 主要挡明显的 ignore/forget 类攻击。
 */
const INJECTION_RE =
  /\b(ignore|forget|disregard|override|bypass)\s+(previous|above|prior|all|the)\b/i;

const ADMIN_PROBE_RE = /\b(打印|告诉我|暴露|泄露).*(密码|secret|admin\s*password)/i;

export function looksLikeInjection(message: string): boolean {
  return INJECTION_RE.test(message) || ADMIN_PROBE_RE.test(message);
}

/**
 * LLM 整体输出 JSON 解析 — 同 assistant.service.parseAndSanitize 思路,
 * 但更宽松: 接受 { reply, intent, intentParams, ... } 这种结构
 */
export function tryParseLlmJson(text: string): any {
  let trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) trimmed = fence[1].trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const obj = trimmed.match(/\{[\s\S]*\}/);
    if (obj) {
      try {
        return JSON.parse(obj[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}