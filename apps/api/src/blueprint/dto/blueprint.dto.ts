import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ===================== L1 骨骼 (8 项) =====================
// 颅型 + 脸型指数 + 颧骨 (2) + 下颌 (2) + 三庭 (2)
// 数字字段取值范围 0~1 (归一化,前端 slider 直读)
// 枚举字段:前端 select 强约束

export enum CraniumShape {
  LONG = 'long',     // 长颅
  MEDIUM = 'medium', // 中颅
  ROUND = 'round',   // 圆颅
  FLAT = 'flat',     // 扁颅
}

export enum JawAngle {
  SHARP = 'sharp',   // 锐角下颌
  MEDIUM = 'medium', // 中等
  SOFT = 'soft',     // 钝角
}

export class L1SkeletonDto {
  @IsEnum(CraniumShape)
  craniumShape!: CraniumShape;

  // 脸型指数 = 脸长 / 脸宽 (摄影测量常用 1.0~1.6)
  @IsNumber()
  @Min(1.0)
  @Max(1.6)
  faceIndex!: number;

  // 颧骨宽 (相对头宽, 0~1)
  @IsNumber()
  @Min(0)
  @Max(1)
  cheekboneWidth!: number;

  // 颧骨突出度 (0=平, 1=极突出)
  @IsNumber()
  @Min(0)
  @Max(1)
  cheekboneProminence!: number;

  // 下颌宽 (相对头宽, 0~1)
  @IsNumber()
  @Min(0)
  @Max(1)
  jawWidth!: number;

  @IsEnum(JawAngle)
  jawAngle!: JawAngle;

  // 三庭上 (额头发际线到眉心) 占比
  @IsNumber()
  @Min(0)
  @Max(1)
  upperThirdRatio!: number;

  // 三庭中 (眉心到鼻底) 占比 — 下停 = 1 - 上 - 中
  @IsNumber()
  @Min(0)
  @Max(1)
  midThirdRatio!: number;
}

// ===================== L2 软组织 (6 项) =====================
// 5 类常规 + 法令纹 (皱纹一项)
// 0~1 归一化

export class L2SoftTissueDto {
  // 皮下脂肪厚度 (0=瘦削, 1=饱满)
  @IsNumber()
  @Min(0)
  @Max(1)
  subcutaneousFat!: number;

  // 咬肌发达度 (影响下颌角附近轮廓)
  @IsNumber()
  @Min(0)
  @Max(1)
  masseter!: number;

  // 颊脂垫 (苹果肌饱满度)
  @IsNumber()
  @Min(0)
  @Max(1)
  buccalFat!: number;

  // 眼窝深度 (0=浅, 1=深陷)
  @IsNumber()
  @Min(0)
  @Max(1)
  eyeSocketDepth!: number;

  // 眉弓突出度 (0=平眉, 1=高眉骨)
  @IsNumber()
  @Min(0)
  @Max(1)
  browRidge!: number;

  // 法令纹深度 (0=无, 1=深)
  @IsNumber()
  @Min(0)
  @Max(1)
  nasolabialFold!: number;
}

// ===================== L3 五官定位 (12 项) =====================
// 眼(3) + 鼻(3) + 唇(2) + 耳(2) + 人中 + 下巴
// 数字字段 0~1 归一化,枚举字段强约束
// R5b 起纳入校验

export enum EyeShape {
  SINGLE = 'single',       // 单眼皮
  INNER = 'inner',         // 内双
  DOUBLE = 'double',       // 双眼皮
  PHOENIX = 'phoenix',     // 丹凤眼(眼尾上扬)
  ROUND = 'round',         // 圆眼
  NARROW = 'narrow',       // 细长眼
}

export enum NoseBridge {
  HIGH = 'high',           // 高鼻梁(欧美风)
  MEDIUM = 'medium',       // 中等
  LOW = 'low',             // 低鼻梁
}

export class L3FeaturesDto {
  // 眼距 (瞳距相对脸宽, 0=近, 1=远)
  @IsNumber()
  @Min(0)
  @Max(1)
  eyeDistance!: number;

  @IsEnum(EyeShape)
  eyeShape!: EyeShape;

  // 眼裂高度 (0=眯缝, 1=大眼)
  @IsNumber()
  @Min(0)
  @Max(1)
  eyeApertureHeight!: number;

  // 鼻长 (0=短鼻, 1=长鼻)
  @IsNumber()
  @Min(0)
  @Max(1)
  noseLength!: number;

  // 鼻宽 (鼻翼宽相对脸宽)
  @IsNumber()
  @Min(0)
  @Max(1)
  noseWidth!: number;

  @IsEnum(NoseBridge)
  noseBridge!: NoseBridge;

  // 唇宽 (嘴角间距相对脸宽)
  @IsNumber()
  @Min(0)
  @Max(1)
  lipWidth!: number;

  // 唇厚 (0=薄唇, 1=厚唇)
  @IsNumber()
  @Min(0)
  @Max(1)
  lipThickness!: number;

  // 耳位 (0=低位, 1=高位 — 影响视觉年龄)
  @IsNumber()
  @Min(0)
  @Max(1)
  earPosition!: number;

  // 耳大小 (相对脸宽)
  @IsNumber()
  @Min(0)
  @Max(1)
  earSize!: number;

  // 人中长度 (0=短, 1=长)
  @IsNumber()
  @Min(0)
  @Max(1)
  philtrumLength!: number;

  // 下巴突出度 (0=后缩, 1=前凸)
  @IsNumber()
  @Min(0)
  @Max(1)
  chinProtrusion!: number;
}

// ===================== L5 毛发 (8 项) =====================
// 发型(4 变种) + 发色(枚举) + 发际线 + 眉形 + 眉色 + 眉密度 + 睫毛 + 鬓角
// 数值 0~1;枚举约束;L3+L5 一起做矛盾组合校验(R5b.2)

export enum HairStyle {
  STRAIGHT_LONG = 'straight_long',     // 直长发
  STRAIGHT_SHORT = 'straight_short',   // 直短发
  WAVY = 'wavy',                       // 大波浪
  CURLY = 'curly',                     // 卷发
  PONYTAIL = 'ponytail',               // 马尾
  BOB = 'bob',                         // 齐肩短发
  BALD = 'bald',                       // 光头
}

export enum HairColor {
  BLACK = 'black',
  BROWN = 'brown',
  BLONDE = 'blonde',
  RED = 'red',
  SILVER = 'silver',
  GRAY = 'gray',
  HIGHLIGHT = 'highlight', // 挑染
}

export enum Hairline {
  HIGH = 'high',     // 高发际线
  MEDIUM = 'medium',
  LOW = 'low',       // 低发际线
  M_SHAPE = 'm_shape', // M 型发际线(地中海前兆,需矛盾校验)
}

export enum BrowShape {
  STRAIGHT = 'straight',     // 平直一字眉
  ARCHED = 'arched',         // 弓形
  UPWARD = 'upward',         // 上挑
  DOWNWARD = 'downward',     // 下垂(八眉)
  THICK = 'thick',           // 粗浓
  THIN = 'thin',             // 细眉
}

export enum BrowColor {
  BLACK = 'black',
  BROWN = 'brown',
  GRAY = 'gray',
  SAME_AS_HAIR = 'same_as_hair',
}

export enum LashStyle {
  LONG_DENSE = 'long_dense',
  SHORT_DENSE = 'short_dense',
  LONG_SPARSE = 'long_sparse',
  SHORT_SPARSE = 'short_sparse',
}

export class L5HairDto {
  @IsEnum(HairStyle)
  hairStyle!: HairStyle;

  @IsEnum(HairColor)
  hairColor!: HairColor;

  @IsEnum(Hairline)
  hairline!: Hairline;

  @IsEnum(BrowShape)
  browShape!: BrowShape;

  @IsEnum(BrowColor)
  browColor!: BrowColor;

  // 眉密度 (0=稀疏, 1=浓密)
  @IsNumber()
  @Min(0)
  @Max(1)
  browDensity!: number;

  @IsEnum(LashStyle)
  lashes!: LashStyle;

  // 鬓角长度 (0=无鬓角, 1=长鬓角连络腮胡)
  @IsNumber()
  @Min(0)
  @Max(1)
  sideburns!: number;
}

// ===================== L7 渲染 prompt 整合 (R6 实现) =====================
// R4 stub: 仅占位, R6 会扩展中英 + MJ/SD/jimeng/doubao 多平台
export class L7RenderDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  promptZh?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  promptEn?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platforms?: string[]; // ['mj', 'sd', 'jimeng', 'doubao']
}

// ===================== L8 评估 (R7 实现) =====================
// R4 stub: POST /evaluate 写入的字段
export class L8EvaluationDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  originality?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  consistency?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  aesthetics?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  evaluatedAt?: string;
}

// ===================== Meta DTO =====================

export class CreateBlueprintDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  tags?: string;
}

export class UpdateLayerDto {
  // L1/L2 必须是 class-validator 装饰过的 DTO;L7/L8 也是
  // 但 controller 端按 step 路由到不同 DTO 校验
  // 这里用 IsObject 兜底, 具体校验交给 service 层按 step 选 schema
  @IsObject()
  data!: Record<string, unknown>;
}