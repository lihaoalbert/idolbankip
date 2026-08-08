import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { IpsService } from '../ips/ips.service';
import { UploadService } from '../upload/upload.service';
import { AiService } from '../ai/ai.service';
import { AuditService } from '../audit/audit.service';
import { AgeBucket, AssetType, Ethnicity, Gender, IpAsset, Prisma } from '@prisma/client';
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
    private readonly ai: AiService,
    private readonly audit: AuditService,
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

  /**
   * Agent 视角的 IP 列表 — x-api-key 鉴权, 返回 externalRecordId / externalSource 等
   * 仅创作者本人可见. 公开 /ips 不返回这些字段 (白名单 DTO), 飞书导入脚本需要用这个.
   */
  async listMyIps(creatorId: string, source?: string) {
    return this.prisma.ipAsset.findMany({
      where: {
        creatorId,
        ...(source ? { externalSource: source } : {}),
      },
      select: {
        id: true, code: true, displayName: true,
        faceCloseupFileId: true,
        externalRecordId: true, externalSource: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * #30.6.21 飞书导入场景: 用 faceCloseupFileId 调 recognizeFace, 把 AI 输出
   * 全覆盖写回 IpAsset (displayName / tagline / description / gender / ageBucket /
   * ethnicity / faceTags / styleTags / scenarioTags). 原值写入 AuditLog(IP_AI_FILL)
   * 保留轨迹, 不可逆.
   *
   * agent 路径: x-api-key 鉴权, 适合本机 fetch 脚本批量跑 (每个 IP 一次)
   */
  async aiFill(creatorId: string, ipId: string): Promise<{
    before: Partial<IpAsset>;
    after: Record<string, unknown>;
    updated: Partial<IpAsset>;
  }> {
    const ip = await this.prisma.ipAsset.findUnique({ where: { id: ipId } });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== creatorId) throw new ForbiddenException('无权操作此 IP');
    if (!ip.faceCloseupFileId) {
      throw new BadRequestException('该 IP 还没面部特写图, 请先上传');
    }

    const validated = (await this.ai.recognizeFace(creatorId, ip.faceCloseupFileId)) as Prisma.JsonObject;
    // IpAsset 字段类型适配:
    //   - styleTags / scenarioTags: schema 是 String (逗号分隔), AI 返回 string[]
    //   - faceTags: schema 是 Json?, AI 返回 array of {category,value}, 保持 array
    //   - gender/ageBucket/ethnicity: enum string, 透传
    const data: Record<string, unknown> = {};
    if (typeof validated.displayName === 'string') data.displayName = validated.displayName;
    if (typeof validated.tagline === 'string') data.tagline = validated.tagline;
    if (typeof validated.description === 'string') data.description = validated.description;
    if (typeof validated.gender === 'string') data.gender = validated.gender;
    if (typeof validated.ageBucket === 'string') data.ageBucket = validated.ageBucket;
    if (typeof validated.ethnicity === 'string') data.ethnicity = validated.ethnicity;
    if (Array.isArray(validated.styleTags)) data.styleTags = validated.styleTags.join(',');
    if (Array.isArray(validated.scenarioTags)) data.scenarioTags = validated.scenarioTags.join(',');
    if (Array.isArray(validated.faceTags)) data.faceTags = validated.faceTags;

    // 备份原值 (含所有要写的字段, 便于回滚 / 审计)
    const before: Record<string, unknown> = {};
    for (const k of Object.keys(data)) before[k] = (ip as any)[k];

    const updated = await this.prisma.ipAsset.update({
      where: { id: ipId },
      data: data as any,
      select: {
        id: true, code: true,
        displayName: true, tagline: true, description: true,
        gender: true, ageBucket: true, ethnicity: true,
        faceTags: true, styleTags: true, scenarioTags: true,
      },
    });

    await this.audit.log({
      actorId: creatorId,
      action: 'IP_AI_FILL',
      targetType: 'IpAsset',
      targetId: ipId,
      payload: { source: 'recognizeFace', before, after: data },
    });

    return { before: before as Partial<IpAsset>, after: data, updated: updated as Partial<IpAsset> };
  }
}
