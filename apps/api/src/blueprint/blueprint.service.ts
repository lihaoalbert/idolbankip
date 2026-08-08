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
import { AiService } from '../ai/ai.service';

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
    private readonly ai: AiService,
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
   * 链路:base64 → Buffer → MiniMax M3 (Anthropic 协议) inline base64 反推
   *      → 严格 schema 校验 → 逐层 PATCH 写入 + 标记 _inferred:true → 返回全量
   *
   * Stage A.5 改造(2026-06-26):放弃 Qwen-VL(精度 6/46 = 13%)改用 MiniMax M3:
   * - 复用现有 AiService client + model(同 recognizeFace 链路)
   * - inline base64(Anthropic SDK 接受),不需要 OSS 中转
   * - 之前 30 行 OSS 私有桶上传 + 10min 签名 URL 逻辑全部删掉
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
    // 1. 解码 base64 → Buffer + 推断 mime
    const dataUriMatch = input.imageBase64.match(/^data:image\/(\w+);base64,/);
    const mimeFromUri = dataUriMatch?.[1]?.toLowerCase();
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
    // mime 推断: data URI header > 默认 jpeg
    const mime: 'image/jpeg' | 'image/png' | 'image/webp' =
      mimeFromUri === 'png' ? 'image/png' :
      mimeFromUri === 'webp' ? 'image/webp' :
      'image/jpeg';

    // 2. 调 MiniMax M3 反推(Anthropic 协议,inline base64)
    let rawText: string;
    try {
      rawText = await this.ai.analyzeBlueprintFace(buffer, mime);
    } catch (e: any) {
      this.trackBLogger.error(`MiniMax Vision 失败: ${e?.message ?? e}`);
      // AiService 内部已 throw ServiceUnavailableException(503),这里透传
      throw e;
    }

    // 3. 解析 JSON(严格)
    const inferred = await this.parseAndValidateInferred(rawText);

    // 4. 先创建空 Blueprint
    const entity = this.create({ ownerId: input.ownerId, title: input.title });

    // 5. 逐层 PATCH 写入(每层加 _inferred:true 让前端标注"AI 推断")
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