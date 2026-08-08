import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreatorAsset, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const ASSET_TYPES = ['model', 'prompt_template'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

const MODEL_SUBTYPES = ['model3d', 'lora', 'voice'] as const;

@Injectable()
export class CreatorAssetsService {
  private readonly logger = new Logger(CreatorAssetsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    creatorId: string,
    params: {
      type: AssetType;
      name: string;
      ossKey?: string;
      fileSize?: number;
      mimeType?: string;
      content?: string;
      tags?: string[];
    },
  ): Promise<CreatorAsset> {
    if (!ASSET_TYPES.includes(params.type)) {
      throw new BadRequestException(`不支持的资产类型: ${params.type}`);
    }
    if (!params.name || params.name.trim().length === 0) {
      throw new BadRequestException('name 必填');
    }
    if (params.type === 'model' && !params.ossKey) {
      throw new BadRequestException('model 类型必须传 ossKey');
    }
    if (params.type === 'prompt_template' && !params.content) {
      throw new BadRequestException('prompt_template 类型必须传 content');
    }
    if (params.fileSize && params.fileSize > 100 * 1024 * 1024) {
      throw new BadRequestException('单文件不能超过 100MB');
    }
    return this.prisma.creatorAsset.create({
      data: {
        creatorId,
        type: params.type,
        name: params.name.trim(),
        ossKey: params.ossKey ?? null,
        fileSize: params.fileSize ?? null,
        mimeType: params.mimeType ?? null,
        content: params.content ?? null,
        tags: (params.tags as Prisma.InputJsonValue) ?? Prisma.DbNull,
      },
    });
  }

  async list(
    creatorId: string,
    q: { type?: AssetType; page?: number; size?: number },
  ): Promise<{ items: CreatorAsset[]; total: number }> {
    const page = q.page ?? 1;
    const size = q.size ?? 50;
    const where: Prisma.CreatorAssetWhereInput = {
      creatorId,
      ...(q.type ? { type: q.type } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.creatorAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.creatorAsset.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string, creatorId: string): Promise<CreatorAsset> {
    const asset = await this.prisma.creatorAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('资产不存在');
    if (asset.creatorId !== creatorId) throw new ForbiddenException('无权访问');
    return asset;
  }

  async update(
    id: string,
    creatorId: string,
    params: { name?: string; content?: string; tags?: string[] },
  ): Promise<CreatorAsset> {
    await this.findOne(id, creatorId);
    return this.prisma.creatorAsset.update({
      where: { id },
      data: {
        ...(params.name !== undefined ? { name: params.name.trim() } : {}),
        ...(params.content !== undefined ? { content: params.content } : {}),
        ...(params.tags !== undefined
          ? { tags: (params.tags as Prisma.InputJsonValue) ?? Prisma.DbNull }
          : {}),
      },
    });
  }

  async remove(id: string, creatorId: string): Promise<void> {
    await this.findOne(id, creatorId);
    await this.prisma.creatorAsset.delete({ where: { id } });
  }

  /**
   * 工作台引用资产时调 — 拿模板正文
   */
  async getPromptTemplate(id: string, creatorId: string): Promise<string> {
    const asset = await this.findOne(id, creatorId);
    if (asset.type !== 'prompt_template') {
      throw new BadRequestException('该资产不是 prompt 模板');
    }
    return asset.content ?? '';
  }

  /**
   * 在工作台里引用资产 — 把 prompt 模板正文塞进 scripts
   */
  buildScriptsFromTemplate(templateContent: string, scene: string): unknown {
    try {
      const arr = JSON.parse(templateContent);
      if (Array.isArray(arr)) {
        return arr.map((s: any) => ({
          ...s,
          sceneRef: scene,
          generatedAt: new Date().toISOString(),
        }));
      }
    } catch {
      /* not json, fall through */
    }
    return {
      template: templateContent,
      scene,
      generatedAt: new Date().toISOString(),
    };
  }
}