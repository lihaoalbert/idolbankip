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