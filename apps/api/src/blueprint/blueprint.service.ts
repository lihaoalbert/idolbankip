import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  L1SkeletonDto,
  L2SoftTissueDto,
  L3FeaturesDto,
  L5HairDto,
  L7RenderDto,
  L8EvaluationDto,
} from './dto/blueprint.dto';
import {
  detectContradictions,
  type Contradiction,
} from './contradictions';

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
// L3/L5 R5b 起接入校验,L4/L6 留 R6
const STEP_VALIDATORS: Record<number, new () => unknown> = {
  1: L1SkeletonDto as new () => unknown,
  2: L2SoftTissueDto as new () => unknown,
  3: L3FeaturesDto as new () => unknown,
  4: null as unknown as new () => unknown,
  5: L5HairDto as new () => unknown,
  6: null as unknown as new () => unknown,
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
    entity.layers[layer] = validated;
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
   * why deterministic hash:相同输入必须返相同分(RC-3 拍板 mock 公式前稳定可测)
   */
  evaluate(id: string): {
    id: string;
    scores: EvaluationScores;
    evaluated_at: string;
    contradictions: Contradiction[];
  } {
    const entity = this.getById(id);
    const fingerprint = JSON.stringify(entity.layers);
    const hash = simpleHash(fingerprint);
    const originality = 5 + (hash % 51) / 10; // 5.0 ~ 10.0
    const consistency = 5 + ((hash >> 3) % 51) / 10;
    const aesthetics = 5 + ((hash >> 7) % 51) / 10;
    return {
      id: entity.id,
      scores: {
        originality: round1(originality),
        consistency: round1(consistency),
        aesthetics: round1(aesthetics),
      },
      evaluated_at: new Date().toISOString(),
      contradictions: detectContradictions(entity.layers as any),
    };
  }
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}