import { Injectable, BadRequestException, NotFoundException, UnprocessableEntityException, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  L1SkeletonDto,
  L2SoftTissueDto,
  L3FeaturesDto,
  L4SkinDto,
  L5HairDto,
  L6DecorationDto,
  L7RenderDto,
  L8EvaluationDto,
} from './dto/blueprint.dto';
import {
  detectContradictions,
  type Contradiction,
} from './contradictions';
import { buildPrompts } from './prompt-builder';
import { evaluate as runEvaluation, type EvaluationResult } from './evaluator/mock-evaluator';
import { DashScopeProvider } from '../ai/dashscope.provider';
import { UploadService } from '../upload/upload.service';

export const BLUEPRINT_LAYERS = [
  'L1_skeleton',
  'L2_softTissue',
  'L3_features',
  'L4_skin',
  'L5_hair',
  'L6_decoration',
  'L7_render',
  'L8_evaluation',
] as const;

export type LayerKey = (typeof BLUEPRINT_LAYERS)[number];

// 按 step 路由到 DTO 类的映射
// L3/L5 R5b 起接入校验,L4/L6 R6 接入
const STEP_VALIDATORS: Record<number, new () => unknown> = {
  1: L1SkeletonDto as new () => unknown,
  2: L2SoftTissueDto as new () => unknown,
  3: L3FeaturesDto as new () => unknown,
  4: L4SkinDto as new () => unknown,
  5: L5HairDto as new () => unknown,
  6: L6DecorationDto as new () => unknown,
  7: L7RenderDto as new () => unknown,
  8: L8EvaluationDto as new () => unknown,
};

export interface BlueprintEntity {
  id: string;
  ownerId: string;
  ipId: string | null;
  title: string | null;
  description: string | null;
  tags: string;
  version: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  layers: Record<LayerKey, Record<string, unknown> | null>;
}

export interface CreateBlueprintInput {
  ownerId: string;
  title?: string;
  description?: string;
  tags?: string;
}

export interface UpdateLayerInput {
  data: Record<string, unknown>;
}

export interface EvaluationScores {
  originality: number;
  consistency: number;
  aesthetics: number;
}

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `fb_test_${String(idCounter).padStart(3, '0')}`;
}

/**
 * Stub 实现 — 内存 Map
 * Phase B Round 4 接入 L1/L2 class-validator 校验
 * Phase B 后续轮换 PrismaService + FaceBlueprint 模型
 */
@Injectable()
export class BlueprintService {
  private readonly store = new Map<string, BlueprintEntity>();

  constructor(
    private readonly dashscope: DashScopeProvider,
    private readonly upload: UploadService,
  ) {}

  create(input: CreateBlueprintInput): BlueprintEntity {
    const now = new Date().toISOString();
    const id = nextId();
    const layers = Object.fromEntries(
      BLUEPRINT_LAYERS.map((k) => [k, null]),
    ) as Record<LayerKey, null>;
    const entity: BlueprintEntity = {
      id,
      ownerId: input.ownerId,
      ipId: null,
      title: input.title ?? null,
      description: input.description ?? null,
      tags: input.tags ?? '',
      version: 1,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      layers,
    };
    this.store.set(id, entity);
    return entity;
  }

  getById(id: string): BlueprintEntity {
    const entity = this.store.get(id);
    if (!entity) {
      throw new NotFoundException({
        error: {
          code: 'blueprint_not_found',
          message: `Blueprint ${id} 不存在`,
          request_id: null,
        },
      });
    }
    return entity;
  }

  /**
   * 校验指定 step 的数据是否符合该层 zod schema
   * 失败抛 BadRequestException,带 field errors
   */
  private async validateLayerData(
    step: number,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const Validator = STEP_VALIDATORS[step];
    if (!Validator) {
      // 该 step 暂无 DTO (L4/L6 留 R6),透传
      return data;
    }
    const instance = plainToInstance(Validator as new () => any, data, {
      enableImplicitConversion: false,
    });
    const errors = await validate(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    if (errors.length > 0) {
      const fieldErrors = errors.flatMap((e) =>
        Object.values(e.constraints ?? {}).map((msg) => ({
          field: e.property,
          message: msg,
        })),
      );
      throw new BadRequestException({
        error: {
          code: 'invalid_layer_data',
          message: `Step ${step} 数据校验失败`,
          fields: fieldErrors,
          request_id: null,
        },
      });
    }
    // 重新序列化,丢弃装饰器未覆盖的额外字段 (whitelist 已经在 validate 里执行,但保留原顺序)
    return JSON.parse(JSON.stringify(instance));
  }

  async updateLayer(
    id: string,
    layer: LayerKey,
    step: number,
    input: UpdateLayerInput,
  ): Promise<BlueprintEntity & { contradictions: Contradiction[] }> {
    const entity = this.getById(id);
    const validated = await this.validateLayerData(step, input.data);

    // L7 计算层:从 L1~L6 自动生成 prompt,合并用户传的 platforms
    if (step === 7) {
      const userData = validated as { platforms?: string[]; promptZh?: string; promptEn?: string; variants?: string[] };
      const platforms = (userData.platforms ?? ['mj', 'sd', 'jimeng', 'doubao']) as any;
      const built = buildPrompts(entity.layers as any, platforms);
      entity.layers[layer] = {
        platforms: built.variants.map((v) => v.platform),
        promptZh: built.promptZh,
        promptEn: built.promptEn,
        variants: built.variants.map((v) => `${v.platform}:${v.prompt}`),
      };
    } else {
      entity.layers[layer] = validated;
    }

    entity.updatedAt = new Date().toISOString();
    entity.version += 1;
    return {
      ...entity,
      contradictions: detectContradictions(entity.layers as any),
    };
  }

  /**
   * L8 mock 评分 — Phase 1 占位
   * 真实 Phase 3 接入 FLAME / 3DMM 反推 + embedding 原创度
   *
   * R7 起:委托 evaluator/mock-evaluator.ts(8 维 sub-score → 3 维主分)
   * 持久化到 entity.layers.L8_evaluation,后续 GET /blueprint/:id 能看到
   */
  evaluate(id: string): {
    id: string;
    scores: EvaluationScores;
    evaluated_at: string;
    contradictions: Contradiction[];
    sub_scores: EvaluationResult['subScores'];
  } {
    const entity = this.getById(id);
    const result = runEvaluation(entity.layers as any);
    // 持久化到 L8 层(权威记录最近一次评估)
    entity.layers.L8_evaluation = {
      originality: result.scores.originality,
      consistency: result.scores.consistency,
      aesthetics: result.scores.aesthetics,
      subScores: result.subScores,
      evaluatedAt: result.evaluatedAt,
    };
    entity.updatedAt = new Date().toISOString();
    entity.version += 1;
    return {
      id: entity.id,
      scores: result.scores,
      evaluated_at: result.evaluatedAt,
      contradictions: result.contradictions,
      sub_scores: result.subScores,
    };
  }

  // ===================== Track B: 参考图反向拆解 =====================

  private readonly trackBLogger = new Logger('BlueprintService:TrackB');

  /**
   * Track B:从一张参考图创建 Blueprint 并自动反推 L1-L6 46 字段
   *
   * 链路:base64 → OSS 存(便于 Vision 引用 URL)→ Qwen-VL 反推 → 严格 schema 校验
   *      → 逐层 PATCH 写入 + 标记 _inferred:true → 返回全量
   *
   * 失败语义:
   * - 图片过大 / 格式错 → BadRequestException 400
   * - Vision API 调用失败 / JSON 解析失败 / 字段不合法 → UnprocessableEntityException 422
   * - 绝不返回"半成品 blueprint",要错就整错
   */
  async createFromImage(input: {
    ownerId: string;
    imageBase64: string;
    title?: string;
  }): Promise<BlueprintEntity & { inferredFields: number }> {
    // 1. 解码 base64
    const stripped = input.imageBase64.replace(/^data:image\/\w+;base64,/, '').trim();
    if (!stripped) {
      throw new BadRequestException({
        error: { code: 'invalid_image', message: 'imageBase64 为空', request_id: null },
      });
    }
    const buffer = Buffer.from(stripped, 'base64');
    if (buffer.length === 0) {
      throw new BadRequestException({
        error: { code: 'invalid_image', message: 'base64 解码后为空', request_id: null },
      });
    }
    if (buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException({
        error: { code: 'image_too_large', message: '图片不能超过 5MB', request_id: null },
      });
    }

    // 2. 存 OSS private(便于 Vision API 引用 URL,不是内联 base64)
    const blueprintId = nextId();
    const ossKey = `blueprint/${blueprintId}/ref.jpg`;
    let signedUrl: string;
    try {
      await this.upload.uploadPrivate(ossKey, buffer);
      signedUrl = await this.upload.getSignedUrl(ossKey, 600); // 10 分钟过期
    } catch (e: any) {
      this.trackBLogger.error(`OSS 存图失败: ${e?.message ?? e}`);
      throw new BadRequestException({
        error: { code: 'oss_upload_failed', message: '图片上传失败', request_id: null },
      });
    }

    // 3. 调 Qwen-VL 反推
    const promptText = VL_PROMPT_TEMPLATE;
    let rawText: string;
    try {
      rawText = await this.dashscope.qwenVLAnalyze({ imageUrl: signedUrl, prompt: promptText });
    } catch (e: any) {
      // 透传 ServiceUnavailableException(500/503),但包成更友好的 422 给上层
      this.trackBLogger.error(`Qwen-VL 失败: ${e?.message ?? e}`);
      throw new UnprocessableEntityException({
        error: {
          code: 'vision_inference_failed',
          message: `视觉反推失败: ${e?.message ?? '未知错误'}`,
          request_id: null,
        },
      });
    }

    // 4. 解析 JSON(严格)
    const inferred = await this.parseAndValidateInferred(rawText);

    // 5. 先创建空 Blueprint
    const entity = this.create({ ownerId: input.ownerId, title: input.title });

    // 6. 逐层 PATCH 写入(每层加 _inferred:true 让前端标注"AI 推断")
    let inferredCount = 0;
    for (const step of [1, 2, 3, 4, 5, 6] as const) {
      const layerKey = stepToLayerKey(step);
      const data = { ...inferred[layerKey], _inferred: true };
      const validated = await this.validateLayerData(step, data as Record<string, unknown>);
      // _inferred 标记也保留(不污染 DTO 校验)
      entity.layers[layerKey] = { ...validated, _inferred: true };
      inferredCount += 1;
    }
    entity.updatedAt = new Date().toISOString();
    entity.version += 1;
    this.trackBLogger.log(`from-image done: id=${entity.id} inferred=${inferredCount}/6 layers`);
    return { ...entity, inferredFields: inferredCount };
  }

  /**
   * 解析 Vision API 返回的 rawText(JSON 字符串)并严格校验
   * 失败抛 UnprocessableEntityException
   */
  private async parseAndValidateInferred(rawText: string): Promise<Record<LayerKey, Record<string, unknown>>> {
    // Vision API 可能包 ```json ... ``` markdown 块,做一次 strip
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e: any) {
      throw new UnprocessableEntityException({
        error: {
          code: 'vision_json_parse_failed',
          message: `Vision 返回非 JSON: ${e?.message ?? '未知'} (前 200 字: ${cleaned.slice(0, 200)})`,
          request_id: null,
        },
      });
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new UnprocessableEntityException({
        error: { code: 'vision_json_invalid', message: 'Vision 返回不是 object', request_id: null },
      });
    }

    // 严格按 step 路由校验每个 layer(复用现有 validateLayerData)
    const result = {} as Record<LayerKey, Record<string, unknown>>;
    for (const step of [1, 2, 3, 4, 5, 6] as const) {
      const layerKey = stepToLayerKey(step);
      const layerData = parsed[layerKey];
      if (layerData == null) {
        throw new UnprocessableEntityException({
          error: {
            code: 'vision_missing_layer',
            message: `Vision 返回缺少 ${layerKey} 层`,
            fields: [{ field: layerKey, message: 'required' }],
            request_id: null,
          },
        });
      }
      try {
        result[layerKey] = await this.validateLayerData(step, layerData as Record<string, unknown>);
      } catch (e: any) {
        // 把 BadRequestException 包成 422(语义上:反推的字段不合法)
        const detail = e?.response?.error?.fields ?? e?.message ?? '未知';
        throw new UnprocessableEntityException({
          error: {
            code: 'vision_invalid_layer',
            message: `Vision 反推的 ${layerKey} 不合法`,
            fields: detail,
            request_id: null,
          },
        });
      }
    }
    return result;
  }
}

// helper:step 1~6 → layer key
function stepToLayerKey(step: number): Exclude<LayerKey, 'L7_render' | 'L8_evaluation'> {
  if (step < 1 || step > 6) {
    throw new Error(`stepToLayerKey 收到非法 step: ${step}`);
  }
  return BLUEPRINT_LAYERS[step - 1] as Exclude<LayerKey, 'L7_render' | 'L8_evaluation'>;
}

// ===================== Qwen-VL 反推 prompt 模板 =====================
// 见 docs/blueprint-vl-prompt.md(轮 3 末补完整文档)
// 当前 inline 版本:只覆盖 L1-L6 6 层,字段名严格对齐前后端 DTO
const VL_PROMPT_TEMPLATE = `你是一名人脸特征提取专家。请从这张人脸图中提取 L1-L6 6 层共 46 个字段,严格按 JSON schema 返回。

## 严格规则
1. 只返回 JSON,不要任何解释/前后缀 markdown
2. 数值字段在范围内;枚举字段必须用 schema 给的选项
3. 不确定的字段填中位值(性别默认 female,数值默认 0.5)

## Schema

L1_skeleton (9 字段):
- gender: "male" | "female"
- craniumShape: "long" | "medium" | "round" | "flat"
- faceIndex: 1.0~1.6 脸长/脸宽
- cheekboneWidth: 0~1 颧骨相对头宽
- cheekboneProminence: 0~1
- jawWidth: 0~1
- jawAngle: "sharp" | "medium" | "soft"
- upperThirdRatio: 0~1 额高(三停之和=1)
- midThirdRatio: 0~1 眉心到鼻底

L2_softTissue (6 字段,0~1):
subcutaneousFat / masseter / buccalFat / eyeSocketDepth / browRidge / nasolabialFold

L3_features (12 字段):
- eyeDistance: 0~1
- eyeShape: "single" | "inner" | "double" | "phoenix" | "round" | "narrow"
- eyeApertureHeight: 0~1
- noseLength: 0~1
- noseWidth: 0~1
- noseBridge: "high" | "medium" | "low"
- lipWidth: 0~1
- lipThickness: 0~1
- earPosition: 0~1
- earSize: 0~1
- philtrumLength: 0~1
- chinProtrusion: 0~1

L4_skin (6 字段):
- skinTone: "fair" | "light" | "medium" | "olive" | "tan" | "brown" | "dark"
- skinTexture: "smooth" | "normal" | "rough" | "matte" | "oily"
- freckles: 0~1
- moles: 0~1
- wrinkles: 0~1
- pores: 0~1

L5_hair (8 字段):
- hairStyle: "straight_long" | "straight_short" | "wavy" | "curly" | "ponytail" | "bob" | "bald"
- hairColor: "black" | "brown" | "blonde" | "red" | "silver" | "gray" | "highlight"
- hairline: "high" | "medium" | "low" | "m_shape"
- browShape: "straight" | "arched" | "upward" | "downward" | "thick" | "thin"
- browColor: "black" | "brown" | "gray" | "same_as_hair"
- browDensity: 0~1
- lashes: "long_dense" | "short_dense" | "long_sparse" | "short_sparse"
- sideburns: 0~1

L6_decoration (6 字段):
- makeup: "none" | "natural" | "light" | "heavy" | "costume"
- lipColor: "natural" | "red" | "pink" | "orange" | "nude" | "dark"
- blush: 0~1
- eyeshadow: 0~1
- accessory: "none" | "earrings" | "necklace" | "headband" | "mask" | "glasses"
- facePaint: 0~1

## 返回示例
{"L1_skeleton":{...},"L2_softTissue":{...},"L3_features":{...},"L4_skin":{...},"L5_hair":{...},"L6_decoration":{...}}`;