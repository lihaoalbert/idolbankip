import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { IpsService } from '../ips/ips.service';
import { UploadService } from '../upload/upload.service';
import { AgeBucket, AssetType, Ethnicity, Gender } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Agent bulk operations — 第三方 agent (n8n / CLI / 脚本) 通过 x-api-key 调用。
 * 当前提供 batch create + 单 IP 上传策略: 一次 N 个 IP 元数据, 返回 N 个 code;
 * 文件上传走 agent 专属 policy endpoint (不需要 JWT, 用 x-api-key 即可)。
 * 见 [[project-post-mvp-backlog]] #24
 */
@Injectable()
export class AgentService {
  constructor(
    private readonly ips: IpsService,
    private readonly upload: UploadService,
    private readonly prisma: PrismaService,
  ) {}

  async batchCreateIps(creatorId: string, items: Array<{
    displayName: string;
    description: string;
    gender: Gender;
    ageBucket: AgeBucket;
    ethnicity?: Ethnicity;
    styleTags: string[];
    scenarioTags: string[];
    faceTags?: Array<{ category: string; value: string }>;
    depositPriceFen?: number;
    fullLicensePriceFen: number;
    tagline?: string;
  }>) {
    if (items.length === 0) return { created: [] };
    if (items.length > 100) {
      throw new BadRequestException('单次最多 100 个 IP');
    }
    const created = [];
    for (const item of items) {
      const ip = await this.ips.create({ creatorId, ...item });
      created.push({ id: ip.id, code: ip.code });
    }
    return { created };
  }

  /**
   * 为指定 IP 生成单文件上传 policy — agent 鉴权 (key owner 必须是该 IP 的 creator)
   * IP 必须在 PENDING_REVIEW 才能上传 (与 JWT 路径一致)
   */
  async generateUploadPolicy(creatorId: string, ipId: string, assetType: AssetType, filename: string, size: number) {
    const ip = await this.prisma.ipAsset.findUnique({ where: { id: ipId } });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== creatorId) throw new ForbiddenException('无权操作此 IP');
    return this.upload.generateDirectPostPolicy({ ipId, assetType, filename, size });
  }
}
