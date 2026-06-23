import { Injectable, NotFoundException } from '@nestjs/common';

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
 * Phase B Round 4 替换为 PrismaService + FaceBlueprint 模型
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

  updateLayer(id: string, layer: LayerKey, input: UpdateLayerInput): BlueprintEntity {
    const entity = this.getById(id);
    entity.layers[layer] = input.data;
    entity.updatedAt = new Date().toISOString();
    entity.version += 1;
    return entity;
  }

  /**
   * L8 mock 评分 — Phase 1 占位
   * 真实 Phase 3 接入 FLAME / 3DMM 反推 + embedding 原创度
   *
   * why deterministic hash:相同输入必须返相同分(RC-3 拍板 mock 公式前稳定可测)
   */
  evaluate(id: string): { id: string; scores: EvaluationScores; evaluated_at: string } {
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