import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AIGenerationRecord } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BaseAiDriver } from './drivers/base.driver';
import { SoraDriver } from './drivers/sora.driver';
import { KlingDriver } from './drivers/kling.driver';
import { JimengDriver } from './drivers/jimeng.driver';
import { RunwayDriver } from './drivers/runway.driver';
import {
  estimateCost,
  estimateToolchainFull,
  getToolConfig,
  SUPPORTED_TOOLS,
} from './cost.config';

export interface GenerateParams {
  prompt: string;
  durationSec?: number;
  resolution?: string;
  imageCount?: number;
}

@Injectable()
export class AiToolsService {
  private readonly logger = new Logger(AiToolsService.name);
  private readonly drivers: Map<string, BaseAiDriver>;

  constructor(private readonly prisma: PrismaService) {
    this.drivers = new Map<string, BaseAiDriver>();
    const all = [
      new SoraDriver(),
      new KlingDriver(),
      new JimengDriver(),
      new RunwayDriver(),
    ];
    for (const d of all) this.drivers.set(d.toolName, d);
  }

  /**
   * 创作者在 workspace 内调用某个 AI 工具
   * 1. 校验 workspace 所有权
   * 2. 校验 toolchain 启用
   * 3. 调对应 driver
   * 4. 落 AIGenerationRecord
   * 5. 返回 record
   */
  async generate(
    workspaceId: string,
    creatorId: string,
    toolName: string,
    params: GenerateParams,
  ): Promise<AIGenerationRecord> {
    if (!SUPPORTED_TOOLS.includes(toolName)) {
      throw new BadRequestException(`不支持的工具: ${toolName}`);
    }
    if (!params.prompt || params.prompt.trim().length < 5) {
      throw new BadRequestException('prompt 至少 5 字');
    }

    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, creatorId: true, toolchain: true, status: true },
    });
    if (!ws) throw new NotFoundException('workspace 不存在');
    if (ws.creatorId !== creatorId) {
      throw new ForbiddenException('只有 workspace 创作者可调用 AI 工具');
    }
    const toolchain = (ws.toolchain ?? {}) as Record<string, boolean>;
    if (!toolchain[toolName]) {
      throw new BadRequestException(
        `工具 ${toolName} 未在工具链中启用,请先勾选`,
      );
    }
    if (ws.status === 'approved') {
      throw new BadRequestException('workspace 已通过,不能再调用工具');
    }

    const driver = this.drivers.get(toolName)!;
    const cfg = getToolConfig(toolName)!;

    this.logger.log(
      `workspace=${workspaceId} tool=${toolName} prompt="${params.prompt.slice(0, 50)}…"`,
    );

    let result;
    try {
      result = await driver.generate(params);
    } catch (err: any) {
      // 失败也要落库(status=failed)便于复盘
      this.logger.error(`driver ${toolName} failed: ${err?.message}`);
      return this.prisma.aIGenerationRecord.create({
        data: {
          workspaceId,
          toolName,
          modelName: cfg.label,
          prompt: params.prompt,
          costCents: 0,
          durationMs: 0,
          status: 'failed',
          errorMsg: err?.message ?? 'unknown error',
        },
      });
    }

    return this.prisma.aIGenerationRecord.create({
      data: {
        workspaceId,
        toolName,
        modelName: cfg.label,
        prompt: params.prompt,
        outputUrl: result.outputUrl,
        costCents: result.costCents,
        durationMs: result.durationMs,
        status: 'success',
      },
    });
  }

  /**
   * 列 workspace 的生成记录(创作者自己 / 买家看均可)
   */
  async listRecords(
    workspaceId: string,
    viewerId: string,
    q: { page?: number; size?: number; toolName?: string },
  ): Promise<{ items: AIGenerationRecord[]; total: number; totalCostCents: number }> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { brief: { select: { buyerId: true } } },
    });
    if (!ws) throw new NotFoundException('workspace 不存在');
    if (ws.creatorId !== viewerId && ws.brief.buyerId !== viewerId) {
      throw new ForbiddenException('无权查看');
    }

    const page = q.page ?? 1;
    const size = q.size ?? 50;
    const where = {
      workspaceId,
      ...(q.toolName ? { toolName: q.toolName } : {}),
    };

    const [items, total, agg] = await Promise.all([
      this.prisma.aIGenerationRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.aIGenerationRecord.count({ where }),
      this.prisma.aIGenerationRecord.aggregate({
        where,
        _sum: { costCents: true },
      }),
    ]);
    return {
      items,
      total,
      totalCostCents: agg._sum.costCents ?? 0,
    };
  }

  /**
   * D3 — 估算 workspace 工具链满配成本
   */
  async estimateWorkspaceCost(workspaceId: string, creatorId: string) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, creatorId: true, toolchain: true },
    });
    if (!ws) throw new NotFoundException('workspace 不存在');
    if (ws.creatorId !== creatorId) {
      throw new ForbiddenException('只有创作者可看成本预估');
    }
    const toolchain = (ws.toolchain ?? {}) as Record<string, boolean>;
    return estimateToolchainFull(toolchain);
  }

  /**
   * D3 — 估算单次调用某工具的成本(实时)
   */
  preflightCost(
    toolName: string,
    params: { durationSec?: number; imageCount?: number },
  ) {
    return estimateCost(toolName, params);
  }
}