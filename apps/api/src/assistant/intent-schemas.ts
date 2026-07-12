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
  MinLength,
  validateSync,
} from 'class-validator';

export type IntentType =
  | 'LIST_BRIEFS'
  | 'CREATE_BRIEF'
  | 'CLOSE_BRIEF'
  | 'SHOW_BID'
  | 'PLACE_BID'
  | 'ACCEPT_BID'
  | 'OPEN_WORKSPACE'
  | 'SHOW_WORKSPACE_STATUS'
  | 'UPLOAD_DELIVERABLE'
  | 'CREATE_REVIEW'
  | 'UPLOAD_IP'
  | 'OPEN_IP_LIBRARY'
  | 'KYC_SUBMIT'
  | 'NAVIGATE'
  | 'ASK_CLARIFICATION'
  // W6-R6 Tier 1 (6 写意图)
  | 'UPDATE_BRIEF'
  | 'PUBLISH_BRIEF'
  | 'WITHDRAW_BID'
  | 'SUBMIT_WORKSPACE'
  | 'APPROVE_WORKSPACE'
  | 'REQUEST_REVISION'
  | 'REVIEW_DELIVERABLE'
  // W6-R6 Tier 4 (2 AI 工具调用)
  | 'RUN_VIDEO_GEN'
  | 'RUN_BLUEPRINT_GEN';

export const INTENT_TYPES = [
  'LIST_BRIEFS',
  'CREATE_BRIEF',
  'CLOSE_BRIEF',
  'SHOW_BID',
  'PLACE_BID',
  'ACCEPT_BID',
  'OPEN_WORKSPACE',
  'SHOW_WORKSPACE_STATUS',
  'UPLOAD_DELIVERABLE',
  'CREATE_REVIEW',
  'UPLOAD_IP',
  'OPEN_IP_LIBRARY',
  'KYC_SUBMIT',
  'NAVIGATE',
  'ASK_CLARIFICATION',
  'UPDATE_BRIEF',
  'PUBLISH_BRIEF',
  'WITHDRAW_BID',
  'SUBMIT_WORKSPACE',
  'APPROVE_WORKSPACE',
  'REQUEST_REVISION',
  'REVIEW_DELIVERABLE',
  'RUN_VIDEO_GEN',
  'RUN_BLUEPRINT_GEN',
] as const;

/** 写操作意图必须 UI 卡片确认才能落库 */
export const REQUIRES_CONFIRMATION: Record<IntentType, boolean> = {
  LIST_BRIEFS: false,
  CREATE_BRIEF: true,
  CLOSE_BRIEF: true,
  SHOW_BID: false,
  PLACE_BID: true,
  ACCEPT_BID: true,
  OPEN_WORKSPACE: false,
  SHOW_WORKSPACE_STATUS: false,
  UPLOAD_DELIVERABLE: true,
  CREATE_REVIEW: true,
  UPLOAD_IP: true,
  OPEN_IP_LIBRARY: false,
  KYC_SUBMIT: true,
  NAVIGATE: false,
  ASK_CLARIFICATION: false,
  UPDATE_BRIEF: true,
  PUBLISH_BRIEF: true,
  WITHDRAW_BID: true,
  SUBMIT_WORKSPACE: true,
  APPROVE_WORKSPACE: true,
  REQUEST_REVISION: true,
  REVIEW_DELIVERABLE: true,
  RUN_VIDEO_GEN: true,
  RUN_BLUEPRINT_GEN: true,
};

/** 中文标签 — 给前端 chip 显示 + 审计可读 */
export const INTENT_LABELS: Record<IntentType, string> = {
  LIST_BRIEFS: '列出可接发包',
  CREATE_BRIEF: '创建发包',
  CLOSE_BRIEF: '关闭/撤回发包',
  SHOW_BID: '查看投标详情',
  PLACE_BID: '提交投标',
  ACCEPT_BID: '接受投标',
  OPEN_WORKSPACE: '打开工作区',
  SHOW_WORKSPACE_STATUS: '查看工作区状态',
  UPLOAD_DELIVERABLE: '上传交付物',
  CREATE_REVIEW: '写评价',
  UPLOAD_IP: '上传 IP',
  OPEN_IP_LIBRARY: '打开形象库',
  KYC_SUBMIT: '提交实名',
  NAVIGATE: '跳转页面',
  ASK_CLARIFICATION: '追问澄清',
  UPDATE_BRIEF: '更新发包',
  PUBLISH_BRIEF: '发布发包',
  WITHDRAW_BID: '撤回投标',
  SUBMIT_WORKSPACE: '提交工作区',
  APPROVE_WORKSPACE: '通过工作区',
  REQUEST_REVISION: '要求修改',
  REVIEW_DELIVERABLE: '审批交付物',
  RUN_VIDEO_GEN: '生成视频/图片',
  RUN_BLUEPRINT_GEN: '生成蓝图',
};

// =============================================================
// 12 个 Param DTO — class-validator 校验
// =============================================================

export class ListBriefsParams {
  @IsOptional() @IsIn(['open', 'all'])
  status?: 'open' | 'all';
}

/** W6-R2.1.5 buyer CREATE_BRIEF intent — 买家发包。
 * 与 brief.controller 的 CreateBriefDto 字段对齐 (subset, 关键字段 LLM 必须填,
 * 缺任一 → Zod 校验失败 → intent=null, 走 ASK_CLARIFICATION)。
 */
export class CreateBriefParams {
  @IsString() @MinLength(5) @MaxLength(100)
  title!: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsString() @MaxLength(30)
  category!: string;

  @IsArray() @IsString({ each: true })
  platformSet!: string[];

  @IsArray() @IsString({ each: true })
  ipIds!: string[];

  @IsNumber() @Min(0) @Max(1_000_000)
  budgetMin!: number;

  @IsNumber() @Min(0) @Max(1_000_000)
  budgetMax!: number;

  @IsString() @MaxLength(20)
  packageTier!: string;

  @IsString() @MaxLength(30)
  deadlineAt!: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  attachments?: string[];
}

/** W6-R5: 买家撤回/关闭已发的 brief。
 * briefId 必填 (用户口头提"撤回我刚发的 brief 标题 XX" → LLM 需要 ID 或 ASK_CLARIFICATION 追问);
 * reason 可选, 仅用于审计/后续设计跟进, 不强制落库。
 */
export class CloseBriefParams {
  @IsString() @MaxLength(64)
  briefId!: string;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
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
  // W6-R7: 全部字段 optional — 用户说"上传新 IP"时不必硬要齐 3 个必填,
  //   IntentCard 触发右屏 ?embed=upload-ip 后由 IpWizard 表单自己 collect,
  //   这里 LLM 只抽它能从用户话里直接拿到的字段(名称/性别/风格)。
  @IsOptional() @IsString() @MaxLength(100)
  displayName?: string;

  @IsOptional() @IsString() @MaxLength(50)
  category?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(200)
  tagline?: string;

  @IsOptional() @IsIn(['FEMALE', 'MALE', 'NONBINARY'])
  gender?: 'FEMALE' | 'MALE' | 'NONBINARY';

  @IsOptional() @IsIn(['CHILD', 'YOUNG', 'MIDDLE', 'ELDERLY'])
  ageBucket?: 'CHILD' | 'YOUNG' | 'MIDDLE' | 'ELDERLY';

  @IsOptional() @IsIn(['EAST_ASIAN', 'SOUTHEAST_ASIAN', 'SOUTH_ASIAN', 'AFRICAN', 'EUROPEAN', 'MIXED'])
  ethnicity?: 'EAST_ASIAN' | 'SOUTHEAST_ASIAN' | 'SOUTH_ASIAN' | 'AFRICAN' | 'EUROPEAN' | 'MIXED';

  @IsOptional() @IsArray() @IsString({ each: true })
  styleTags?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  scenarioTags?: string[];
}

/** W6-R7: OPEN_IP_LIBRARY — 打开形象库浏览/筛选界面, 仅展示不写。
 * 不需 params (filters 走前端组件状态); schema 留空但保留 enum 项方便 IntentCard 渲染 */
export class OpenIpLibraryParams {}

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

// =============================================================
// W6-R6 Tier 1 + Tier 4 — 9 个新 intent 的 Param DTO (8 个类)
// =============================================================

/** UPDATE_BRIEF — 买家改发包。id 必填, 其余全 optional。
 * parseIntent 后额外校验: 至少有一个可更新字段 (见 hasAnyUpdateField), 全空 → intent=null。
 * 与 brief.controller 的 UpdateBriefDto 字段对齐。 */
export class UpdateBriefParams {
  @IsString() @MaxLength(64)
  id!: string;

  @IsOptional() @IsString() @MinLength(5) @MaxLength(100)
  title?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  platformSet?: string[];

  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000)
  budgetMin?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000)
  budgetMax?: number;

  @IsOptional() @IsString() @MaxLength(20)
  packageTier?: string;

  @IsOptional() @IsString() @MaxLength(30)
  deadlineAt?: string;
}

/** PUBLISH_BRIEF — 买家把 draft 发布到 bidding。只需 brief id。 */
export class BriefIdOnlyParams {
  @IsString() @MaxLength(64)
  id!: string;
}

/** WITHDRAW_BID — 创作者撤回自己的投标。 */
export class WithdrawBidParams {
  @IsString() @MaxLength(64)
  briefId!: string;

  @IsString() @MaxLength(64)
  bidId!: string;
}

/** SUBMIT_WORKSPACE (creator) / APPROVE_WORKSPACE (buyer) 共用 — 只需 workspace id。 */
export class WorkspaceIdParams {
  @IsString() @MaxLength(64)
  id!: string;
}

/** REQUEST_REVISION — 买家打回工作区。reason 仅用于聊天卡片展示 (后端 endpoint 不收 body)。 */
export class RequestRevisionParams {
  @IsString() @MaxLength(64)
  id!: string;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

/** REVIEW_DELIVERABLE — 买家审批交付物, decision 二选一。rejected 时可带原因。 */
export class ReviewDeliverableParams {
  @IsString() @MaxLength(64)
  deliverableId!: string;

  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsOptional() @IsString() @MaxLength(500)
  rejectedReason?: string;
}

/** RUN_VIDEO_GEN — 聊天触发 AI 视频/图片生成 (sora/kling/jimeng/runway 四选一, 同 endpoint)。 */
export class RunVideoGenParams {
  @IsString() @MaxLength(64)
  workspaceId!: string;

  @IsIn(['sora', 'kling', 'jimeng', 'runway'])
  toolName!: 'sora' | 'kling' | 'jimeng' | 'runway';

  @IsString() @MinLength(5) @MaxLength(5000)
  prompt!: string;

  @IsOptional() @IsNumber() @Min(1) @Max(600)
  durationSec?: number;

  @IsOptional() @IsString() @MaxLength(30)
  resolution?: string;

  @IsOptional() @IsInt() @Min(1) @Max(20)
  imageCount?: number;
}

/** RUN_BLUEPRINT_GEN — 聊天触发 Face Blueprint Wizard 创建。 */
export class RunBlueprintGenParams {
  @IsString() @MinLength(5) @MaxLength(2000)
  prompt!: string;

  @IsOptional() @IsString() @MaxLength(100)
  title?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];
}

const SCHEMA_BY_INTENT: Record<IntentType, any> = {
  LIST_BRIEFS: ListBriefsParams,
  CREATE_BRIEF: CreateBriefParams,
  CLOSE_BRIEF: CloseBriefParams,
  SHOW_BID: ShowBidParams,
  PLACE_BID: PlaceBidParams,
  ACCEPT_BID: AcceptBidParams,
  OPEN_WORKSPACE: OpenWorkspaceParams,
  SHOW_WORKSPACE_STATUS: ShowWorkspaceStatusParams,
  UPLOAD_DELIVERABLE: UploadDeliverableParams,
  CREATE_REVIEW: CreateReviewParams,
  UPLOAD_IP: UploadIpParams,
  OPEN_IP_LIBRARY: OpenIpLibraryParams,
  KYC_SUBMIT: KycSubmitParams,
  NAVIGATE: NavigateParams,
  ASK_CLARIFICATION: AskClarificationParams,
  UPDATE_BRIEF: UpdateBriefParams,
  PUBLISH_BRIEF: BriefIdOnlyParams,
  WITHDRAW_BID: WithdrawBidParams,
  SUBMIT_WORKSPACE: WorkspaceIdParams,
  APPROVE_WORKSPACE: WorkspaceIdParams,
  REQUEST_REVISION: RequestRevisionParams,
  REVIEW_DELIVERABLE: ReviewDeliverableParams,
  RUN_VIDEO_GEN: RunVideoGenParams,
  RUN_BLUEPRINT_GEN: RunBlueprintGenParams,
};

/** UPDATE_BRIEF 至少要给一个可更新字段, 否则 PATCH 空 body 没意义。 */
const UPDATE_BRIEF_FIELDS = [
  'title',
  'description',
  'platformSet',
  'budgetMin',
  'budgetMax',
  'packageTier',
  'deadlineAt',
] as const;

function hasAnyUpdateField(params: Record<string, unknown>): boolean {
  return UPDATE_BRIEF_FIELDS.some((f) => params[f] !== undefined && params[f] !== null);
}

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
  // W6-R7 fix: class-validator 在空 DTO 类 (OpenIpLibraryParams {} / 类似未来新增空 schema)
  //   上永远返 1 个 'unknownValue' 错 (没字段可校验), 误杀只读 intent。空类直接放行 —
  //   校验装饰器为 0 时 validation 本就无意义
  const realErrors = errors.filter(
    (e) => !(e.constraints && Object.keys(e.constraints).length === 1 && e.constraints.unknownValue),
  );
  if (realErrors.length > 0) return null;

  // UPDATE_BRIEF 特判: 只给了 id 没给任何可改字段 → PATCH 空 body 无意义, 逼 LLM 追问
  if (intent === 'UPDATE_BRIEF' && !hasAnyUpdateField(paramsObj)) return null;

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

// =============================================================
// 业务意图优先级 (W6-R2) — FAQ 抢答修复
// =============================================================

/**
 * FAQ 关键词太宽 (e.g. "投标" 命中 creator-bid FAQ), 把所有业务意图抢走.
 *
 * 修复: 在 FAQ match 前先扫"业务动词 + 写操作意图", 命中 → 跳过 FAQ 走 LLM
 *
 * 命中规则 (任一):
 *   - 消息开头/包含 写操作意图词 (我要/帮我/提交/创建/上传/接单/接受/写个)
 *   - 写操作动词 (投标/发包/接单/接受/上传/写评价/提交KYC/写好评/打款)
 *   - 消息里有 ID 形态 (cuid/IP code/brief id)
 *
 * 返回 true → service 跳过 FAQ, 直接走 LLM 分类
 */
const WRITE_VERBS = [
  '投标', '发包', '接单', '接受', '上传', '写评价', '写好评', '写个评价',
  '提交 KYC', '提交KYC', '提交实名', '付款', '退款', '签合同',
  '撤回', '撤回发包', '关闭发包', '关闭任务', '撤回任务', '取消发包',
  // W6-R6 Tier 1
  '更新发包', '改一下发包', '修改发包', '改发包', '发布发包', '发布这个',
  '撤回投标', '撤回 bid', '撤回我的投标', '撤回报价',
  '提交工作区', '提交工作台', '把工作区交', '交上去',
  '通过工作区', '批准工作区', '通过工作台',
  '打回', '要求修改', '让他改', '返修',
  '审批交付物', '通过交付物', '驳回交付物', '通过这个视频', '驳回',
  // W6-R6 Tier 4 AI 工具
  '生成视频', '生成图片', '生成一段', '建个蓝图', '起个蓝图', '做个蓝图',
  '跑 sora', '跑sora', '跑 kling', '跑kling', '跑 runway', '跑runway',
  '跑 jimeng', '跑jimeng', '用 sora', '用sora', '用可灵', '用即梦',
  // W6-R7 — IP 上传 / 形象库浏览
  '上传 IP', '上传新 IP', '上传新IP', '上传新的 IP', '上传一个 IP', '新建 IP', '新建一个 IP',
  '加个 IP', '录个 IP', '录个新形象',
  '打开形象库', '看形象库', '搜形象库', '筛选形象库', '查 IP', '看 IP 库',
];
const INTENT_PREFIX = ['我要', '帮我', '帮我把', '请帮我', '能否帮我', '可以帮我', '麻烦帮我'];

export function isBusinessIntentMessage(message: string): boolean {
  const m = message.trim();
  if (!m) return false;

  // 1. 写操作动词直接命中
  for (const v of WRITE_VERBS) {
    if (m.includes(v)) return true;
  }

  // 2. 意图前缀 + 任意业务词
  for (const p of INTENT_PREFIX) {
    if (m.startsWith(p)) return true;
  }

  // 3. 消息含 ID 形态 (cuid 是 cm[a-z0-9]{20,30}, IP code 是 IBI-2026-NNNN, brief id 同 cuid)
  if (/\bIBI-\d{4}-\d{4,}\b/.test(m)) return true;
  if (/\bcm[a-z0-9]{20,}\b/i.test(m)) return true;
  // 短 id 形态 (用户口头说"brief abc123") - 至少 4 位字母数字
  if (/(?:brief|bid|workspace|ws|订单|发包|投标)[-_ ]?([a-z0-9]{4,})/i.test(m)) return true;

  return false;
}