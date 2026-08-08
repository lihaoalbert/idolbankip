import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { LlmConfigService } from '../llm-config/llm-config.service';

const PROMPT_VERSION = 'platform-judge-v1.0';

/**
 * #30.7.1 W2 #28 平台仲裁 Agent (PlatformJudgeService) — 第 1 个平台层 Agent
 *
 * 职责: 按 brief 的 acceptanceChecklist 对创作者交付物 (deliverable) 或 bid 方案 (pre-bid) 打分
 * 输入: briefId + (deliverableId | bidId) + trigger 标识
 * 流程:
 *   1. 读 brief.acceptanceChecklist (若无, 落到 AcceptanceTemplate by category+tier)
 *   2. 拼 prompt: system(judge system) + user(checklist + deliverable 描述/URL/spec)
 *   3. 调 LLM (claude-sonnet via LlmConfigService)
 *   4. 解析 JSON: { items: [{itemId, score(0-1), reason}], totalScore, pass, summary }
 *   5. 写 PlatformJudgment 表
 *   6. 若 !pass: 自动创建 Dispute (用平台 Agent 当 initiator, status='mediating' 待 admin 复核)
 *
 * 法律责任: Agent 判定是"参考",终极争议由 admin /disputes 人工 review
 * 见 docs/standards/2026-platform-standards-v1.md §5
 */
@Injectable()
export class PlatformJudgeService {
  private readonly logger = new Logger(PlatformJudgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmConfigService,
  ) {}

  /**
   * 主入口: 对交付物判定
   * @param briefId
   * @param deliverableId 可选;若与 bidId 同时给,优先 deliverable
   * @param bidId 可选
   * @param triggeredBy 谁触发的(user.id 或 'system')
   */
  async judgeDeliverable(input: {
    briefId: string;
    deliverableId?: string;
    bidId?: string;
    triggeredBy: string;
  }): Promise<any> {
    const { briefId, deliverableId, bidId, triggeredBy } = input;
    if (!deliverableId && !bidId) {
      throw new BadRequestException('deliverableId 或 bidId 必填其一');
    }
    const brief = await this.prisma.brief.findUnique({
      where: { id: briefId },
      include: { standardSku: true, deliverables: true },
    });
    if (!brief) throw new NotFoundException('brief 不存在');

    // 1) 收集 checklist: brief.acceptanceChecklist 优先,否则按 category+tier 找模板
    let checklist: { version?: string; passingScore?: number; items: any[] } | null = brief.acceptanceChecklist as any;
    if (!checklist || !Array.isArray((checklist as any).items) || (checklist as any).items.length === 0) {
      const tpl = await this.prisma.acceptanceTemplate.findFirst({
        where: {
          category: brief.category,
          tier: brief.packageTier,
          enabled: true,
        },
      });
      if (!tpl) {
        throw new BadRequestException(`该 brief 既无 acceptanceChecklist,也无匹配的 AcceptanceTemplate(category=${brief.category}, tier=${brief.packageTier})`);
      }
      checklist = tpl.checklist as any;
    }
    const passingScore = (checklist as any).passingScore ?? 0.8;

    // 2) 收集待判定对象
    let subject: { type: 'deliverable' | 'bid'; id: string; text: string };
    if (deliverableId) {
      const d = await this.prisma.deliverable.findUnique({ where: { id: deliverableId } });
      if (!d) throw new NotFoundException('deliverable 不存在');
      if (d.briefId !== briefId) throw new BadRequestException('deliverable 不属于该 brief');
      subject = {
        type: 'deliverable',
        id: d.id,
        text: [
          `类型: ${d.type}`,
          `平台: ${d.platform}`,
          `URL: ${d.url}`,
          `缩略图: ${d.thumbnailUrl ?? '(无)'}`,
          `规格: ${JSON.stringify(d.spec ?? {})}`,
        ].join('\n'),
      };
    } else {
      const b = await this.prisma.bid.findUnique({ where: { id: bidId! } });
      if (!b) throw new NotFoundException('bid 不存在');
      if (b.briefId !== briefId) throw new BadRequestException('bid 不属于该 brief');
      subject = {
        type: 'bid',
        id: b.id,
        text: [
          `报价: ¥${b.price}`,
          `交付天数: ${b.deliveryDays}`,
          `提案: ${b.proposal ?? '(无)'}`,
        ].join('\n'),
      };
    }

    // 3) 拼 prompt + 调 LLM
    const config = await this.llm.getActive();
    const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });
    const systemPrompt = `你是 ibi.ren 平台仲裁 Agent。职责:按给定的 acceptanceChecklist,对创作者交付物/投标方案做客观打分。
规则:
- 每项 0-1 分(0=完全不符, 1=完全满足)
- 给出 1 句中文理由(≤40 字)
- totalScore = Σ(item.score × item.weight),保留 3 位小数
- pass = (totalScore ≥ passingScore)
- summary: 1-2 句整体评价
- 输出必须是合法 JSON,不要有额外文字`;

    const userPrompt = `请判定以下交付物:

# Brief
- 标题: ${brief.title}
- 描述: ${brief.description ?? '(无)'}
- 品类: ${brief.category}
- 档位: ${brief.packageTier}
- 当前价: ¥${brief.currentPrice ?? '?'}
- 截止: ${brief.deadlineAt.toISOString()}

# 待判定对象 (${subject.type}: ${subject.id})
${subject.text}

# acceptanceChecklist (passingScore = ${passingScore})
${JSON.stringify(checklist, null, 2)}

# 输出 JSON Schema
{
  "items": [
    { "itemId": "<from checklist>", "score": 0.85, "reason": "..." }
  ],
  "totalScore": 0.83,
  "pass": true|false,
  "summary": "..."
}`;

    let parsed: { items: Array<{ itemId: string; score: number; reason: string }>; totalScore: number; pass: boolean; summary: string };
    try {
      const resp = await client.messages.create({
        model: config.model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const text = (resp.content[0] as any).text as string;
      // 尝试提取 JSON(LLM 可能包 ```json```)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('LLM 未返回 JSON');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e: any) {
      this.logger.error(`Judge LLM 调用失败: ${e?.message ?? e}`);
      throw new BadRequestException(`平台 Agent 判定失败: ${e?.message ?? e}`);
    }

    // 4) 服务端二次校验(防止 LLM 幻觉)
    const checklistItems: Array<{ id: string; criterion?: string; weight?: number }> =
      (checklist as any).items ?? [];
    const itemMap = new Map<string, { id: string; criterion?: string; weight?: number }>(
      checklistItems.map((it) => [it.id, it]),
    );
    const safeItems = (parsed.items ?? []).map((it: any) => {
      const def = itemMap.get(it.itemId);
      return {
        itemId: it.itemId,
        criterion: def?.criterion ?? it.itemId,
        weight: def?.weight ?? 0,
        score: Math.max(0, Math.min(1, Number(it.score) || 0)),
        reason: String(it.reason ?? '').slice(0, 200),
      };
    });
    const totalScore = Math.max(0, Math.min(1, Number(parsed.totalScore) || 0));
    const pass = totalScore >= passingScore;

    // 5) 写 PlatformJudgment
    const judgment = await this.prisma.platformJudgment.create({
      data: {
        briefId,
        deliverableId: deliverableId ?? null,
        trigger: deliverableId ? 'deliverable' : 'pre_bid',
        checklistVersion: (checklist as any).version ?? '1.0',
        itemScores: safeItems as any,
        totalScore,
        passingScore,
        pass,
        summary: String(parsed.summary ?? '').slice(0, 1000),
        modelUsed: config.model,
        promptVersion: PROMPT_VERSION,
      },
    });

    // 6) 不通过 → 自动创建 Dispute(若尚无 open 仲裁)
    if (!pass) {
      const existing = await this.prisma.dispute.findFirst({
        where: { briefId, status: { in: ['open', 'mediating'] } },
      });
      if (!existing) {
        const sysUser = await this.getOrCreateSystemUser();
        const dispute = await this.prisma.dispute.create({
          data: {
            briefId,
            initiatorId: sysUser.id,
            reason: 'quality_issue',
            description: `平台 Agent 自动判定:totalScore=${totalScore} < passingScore=${passingScore};summary=${parsed.summary ?? ''}`,
            evidence: [
              {
                type: 'platform_judgment',
                judgmentId: judgment.id,
                url: null,
                excerpt: safeItems.map((s) => `[${s.itemId}] ${s.score}: ${s.reason}`).join('\n'),
              },
            ] as any,
            status: 'mediating',
            mediatorId: null,
          },
        });
        await this.prisma.platformJudgment.update({
          where: { id: judgment.id },
          data: { disputeId: dispute.id },
        });
        this.logger.warn(
          `auto-dispute created: brief=${briefId} judgment=${judgment.id} dispute=${dispute.id} score=${totalScore}`,
        );
      }
    }

    this.logger.log(
      `judge: brief=${briefId} ${subject.type}=${subject.id} score=${totalScore} pass=${pass} triggeredBy=${triggeredBy}`,
    );
    return judgment;
  }

  /**
   * 读 brief 的判定历史
   */
  async listByBrief(briefId: string) {
    return this.prisma.platformJudgment.findMany({
      where: { briefId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    const j = await this.prisma.platformJudgment.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('judgment 不存在');
    return j;
  }

  private async getOrCreateSystemUser() {
    const SYSTEM_EMAIL = 'system-agent@ibi.ren';
    let u = await this.prisma.user.findUnique({ where: { email: SYSTEM_EMAIL } });
    if (!u) {
      u = await this.prisma.user.create({
        data: {
          email: SYSTEM_EMAIL,
          passwordHash: 'NOT_LOGINABLE_PLATFORM_AGENT',
          displayName: '平台 Agent',
          roles: ['ADMIN'],
        } as any,
      });
    }
    return u;
  }
}
