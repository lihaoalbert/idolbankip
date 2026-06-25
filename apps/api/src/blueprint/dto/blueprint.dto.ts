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

// Phase C Beta 加 (Q3):SchematicFace 性别驱动轮廓(下颌/眉弓/喉结)
export enum Gender {
  FEMALE = 'female',
  MALE = 'male',
}

export class L1SkeletonDto {
  // 旧数据无 gender,设 optional 兼容;前端 L1_DEFAULTS 默认 female
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

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

// ===================== L4 皮肤 (6 项) =====================
// 肤色 (Fitzpatrick scale) + 肤质 + 雀斑/痣/皱纹/毛孔
// 数字 0~1 归一化,枚举约束
// R6 接入校验

export enum SkinTone {
  FAIR = 'fair',       // 1型:瓷白
  LIGHT = 'light',     // 2型:自然白
  MEDIUM = 'medium',   // 3型:自然色
  OLIVE = 'olive',     // 3.5型:黄调
  TAN = 'tan',         // 4型:小麦
  BROWN = 'brown',     // 5型:古铜
  DARK = 'dark',       // 6型:深棕
}

export enum SkinTexture {
  SMOOTH = 'smooth',   // 婴儿肌/磨皮
  NORMAL = 'normal',   // 标准
  ROUGH = 'rough',     // 粗糙
  MATTE = 'matte',     // 哑光(出油少)
  OILY = 'oily',       // 油光
}

export class L4SkinDto {
  @IsEnum(SkinTone)
  skinTone!: SkinTone;

  @IsEnum(SkinTexture)
  skinTexture!: SkinTexture;

  // 雀斑密度 (0=无,1=满脸)
  @IsNumber()
  @Min(0)
  @Max(1)
  freckles!: number;

  // 痣数量 (0=无,1=多)
  @IsNumber()
  @Min(0)
  @Max(1)
  moles!: number;

  // 皱纹/细纹 (0=光滑,1=深纹)
  @IsNumber()
  @Min(0)
  @Max(1)
  wrinkles!: number;

  // 毛孔 (0=细腻,1=粗大)
  @IsNumber()
  @Min(0)
  @Max(1)
  pores!: number;
}

// ===================== L6 修饰 (6 项) =====================
// 妆容强度 + 唇色 + 腮红/眼影 + 装饰 + 面部彩绘
// 跟 L1~L5 配合成"最终形象"

export enum MakeupLevel {
  NONE = 'none',
  NATURAL = 'natural', // 素颜感
  LIGHT = 'light',     // 淡妆
  HEAVY = 'heavy',     // 浓妆
  COSTUME = 'costume', // 戏妆/Cos
}

export enum LipColor {
  NATURAL = 'natural',
  RED = 'red',         // 正红
  PINK = 'pink',
  ORANGE = 'orange',
  NUDE = 'nude',
  DARK = 'dark',       // 暗红/姨妈色
}

export enum Accessory {
  NONE = 'none',
  EARRINGS = 'earrings',
  NECKLACE = 'necklace',
  HEADBAND = 'headband',
  MASK = 'mask',
  GLASSES = 'glasses',
}

export class L6DecorationDto {
  @IsEnum(MakeupLevel)
  makeup!: MakeupLevel;

  @IsEnum(LipColor)
  lipColor!: LipColor;

  // 腮红 (0=无,1=重)
  @IsNumber()
  @Min(0)
  @Max(1)
  blush!: number;

  // 眼影 (0=裸眼,1=重眼影)
  @IsNumber()
  @Min(0)
  @Max(1)
  eyeshadow!: number;

  @IsEnum(Accessory)
  accessory!: Accessory;

  // 面部彩绘 (戏曲/Cos 风格,0=无,1=满)
  @IsNumber()
  @Min(0)
  @Max(1)
  facePaint!: number;
}

// ===================== L7 渲染 prompt 整合 (R6 实现) =====================
// L7 是"计算层" — 用户只 PATCH platforms,service 自动从 L1~L6 拼中英 prompt
// promptZh / promptEn 字段由 service 写入,前端通常 GET 才能看到(POST/PATCH 后也会随响应返回)

export class L7RenderDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platforms?: string[]; // ['mj', 'sd', 'jimeng', 'doubao']

  // 下面是 service 计算写入的字段,PATCH 时可选传(覆盖模式)
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
  variants?: string[]; // 各平台变体:['mj:'+..., 'sd:'+..., ...]
}

// ===================== L8 评估 (R7 实现) =====================
// 三大主分 + 8 维 sub-score + 时间戳
// R4 stub → R7 改:由 evaluator 自动算并写回,前端通常 GET 才能看到
// 但 PATCH 仍允许覆盖(高级用户手动调分)
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
  @IsObject()
  subScores?: {
    L1_complexity?: number;
    L2_expressiveness?: number;
    L3_distinctiveness?: number;
    L4_skin_realism?: number;
    L5_hair_coverage?: number;
    L6_decoration_completeness?: number;
    L7_prompt_quality?: number;
    L8_contradiction_bonus?: number;
  };

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

// ===================== Track B: 参考图反向拆解 =====================
// POST /blueprint/from-image 接收的 body
// imageBase64 接受 data:image/jpeg;base64,... 或裸 base64(去掉前缀)
export class CreateBlueprintFromImageDto {
  @IsString()
  imageBase64!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}