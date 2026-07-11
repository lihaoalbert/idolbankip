import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Brief } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BriefPushService } from '../brief-push/brief-push.service';
import { NotificationsService } from '../notifications/notifications.service';

// Brief 状态机
const TRANSITIONS: Record<string, string[]> = {
  draft: ['bidding', 'closed'],
  bidding: ['in_progress', 'closed'], // 进入 in_progress = 中标后自动
  in_progress: ['delivered', 'disputed', 'closed'],
  delivered: ['closed', 'disputed'],
  disputed: ['closed'],
  closed: [],
};

export interface BriefFilter {
  buyerId?: string;
  excludeBuyerId?: string;
  status?: string;
  category?: string;
  page?: number;
  size?: number;
}

const VALID_CATEGORIES = ['ad', 'shortvideo', 'livestream_clip', 'poster', '3d'];
const VALID_PACKAGES = ['essential', 'standard', 'premium'];

@Injectable()
export class BriefService {
  private readonly logger = new Logger(BriefService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: BriefPushService,
    private readonly notif: NotificationsService,
  ) {}

  /**
   * 买家发包 — 默认状态 draft,需 publish 后才进入 bidding
   */
  async create(buyerId: string, params: {
    title: string;
    description?: string;
    category: string;
    platformSet: string[];
    ipIds: string[];
    budgetMin: number;
    budgetMax: number;
    packageTier: string;
    deadlineAt: string;
    attachments?: string[];
  }): Promise<Brief> {
    if (!VALID_CATEGORIES.includes(params.category)) {
      throw new BadRequestException(`category 必须是 ${VALID_CATEGORIES.join('/')}`);
    }
    if (!VALID_PACKAGES.includes(params.packageTier)) {
      throw new BadRequestException(`packageTier 必须是 ${VALID_PACKAGES.join('/')}`);
    }
    if (params.budgetMax < params.budgetMin) {
      throw new BadRequestException('budgetMax 不能小于 budgetMin');
    }
    const deadline = new Date(params.deadlineAt);
    if (deadline.getTime() < Date.now()) {
      throw new BadRequestException('deadlineAt 必须在未来');
    }

    return this.prisma.brief.create({
      data: {
        buyerId,
        title: params.title,
        description: params.description,
        category: params.category,
        platformSet: params.platformSet as any,
        ipIds: params.ipIds as any,
        budgetMin: params.budgetMin,
        budgetMax: params.budgetMax,
        packageTier: params.packageTier,
        deadlineAt: deadline,
        attachments: (params.attachments ?? []) as any,
        status: 'draft',
      },
    });
  }

  /**
   * 买家发布 brief — draft → bidding
   * 同步:查找 category + tier 匹配的 CatalogSku,绑定 standardSkuId + currentPrice
   * currentPrice = SKU basePrice(平台菜单价)— 后续 bump 从这里累乘
   */
  async publish(id: string, buyerId: string): Promise<Brief> {
    const brief = await this.getByIdInternal(id);
    if (brief.buyerId !== buyerId) {
      throw new ForbiddenException('无权操作该 brief');
    }
    if (!TRANSITIONS[brief.status].includes('bidding')) {
      throw new BadRequestException(`当前状态 ${brief.status} 不能 publish`);
    }
    // 匹配平台标准 SKU
    const sku = await this.prisma.catalogSku.findFirst({
      where: {
        category: brief.category,
        tier: brief.packageTier,
        enabled: true,
      },
    });
    if (!sku) {
      throw new BadRequestException(
        `未找到匹配的 CatalogSku(category=${brief.category}, tier=${brief.packageTier});请先跑 npm run seed:catalog`,
      );
    }
    return this.prisma.brief.update({
      where: { id },
      data: {
        status: 'bidding',
        standardSkuId: sku.id,
        currentPrice: sku.basePrice as any,
        bumpCount: 0,
        bumpHistory: [] as any,
      },
    }).then(async (updated) => {
      // W2 #29 推送 — in-site + 邮件 + 微信 fan-out
      this.push.onPublish(updated).catch((e) =>
        this.logger.warn(`push.onPublish err: ${e?.message ?? e}`),
      );
      return updated;
    });
  }

  /**
   * 买家关闭 brief
   */
  async close(id: string, buyerId: string): Promise<Brief> {
    const brief = await this.getByIdInternal(id);
    if (brief.buyerId !== buyerId) {
      throw new ForbiddenException('无权操作该 brief');
    }
    if (!TRANSITIONS[brief.status].includes('closed')) {
      throw new BadRequestException(`当前状态 ${brief.status} 不能 close`);
    }
    return this.prisma.brief.update({
      where: { id },
      data: { status: 'closed' },
    });
  }

  /**
   * #30.7.1 W2 #31 过期 brief 自动 close (cron 调用)
   * 扫描 status='bidding' 且 deadlineAt < now() 的 brief,批量 close
   * 每个 brief 给买家推一条 BRIEF_EXPIRED 通知
   * 返回: { closedCount, closedIds, expiredAt }
   *
   * 注意:不撤稿已收到的 bid(让买家可以查看历史报价 / 重新发包时参考)
   */
  async autoCloseExpired(): Promise<{ closedCount: number; closedIds: string[]; expiredAt: string }> {
    const now = new Date();
    const expired = await this.prisma.brief.findMany({
      where: {
        status: 'bidding',
        deadlineAt: { lt: now },
      },
      select: { id: true, buyerId: true, title: true, category: true },
      take: 200,
    });
    if (expired.length === 0) {
      this.logger.log('[autoCloseExpired] 无过期 brief');
      return { closedCount: 0, closedIds: [], expiredAt: now.toISOString() };
    }

    const ids = expired.map((b) => b.id);
    await this.prisma.brief.updateMany({
      where: { id: { in: ids } },
      data: { status: 'closed' },
    });

    // 逐个推 BRIEF_EXPIRED 给买家
    for (const b of expired) {
      try {
        await this.notif.create({
          userId: b.buyerId,
          type: 'BRIEF_EXPIRED',
          title: '⏰ 任务包已过期关闭',
          body: `「${b.title}」已超过截止时间未有人接单,系统已自动关闭。可重新发包或调整预算。`,
          link: `/buyer/briefs/${b.id}`,
        });
      } catch (e: any) {
        this.logger.warn(`[autoCloseExpired] notif fail brief=${b.id}: ${e?.message}`);
      }
    }

    this.logger.log(
      `[autoCloseExpired] closed=${expired.length} ids=${ids.join(',')}`,
    );
    return { closedCount: expired.length, closedIds: ids, expiredAt: now.toISOString() };
  }

  /**
   * 买家查自己的 brief 列表
   */
  async list(filter: BriefFilter): Promise<{ items: Brief[]; total: number; page: number; size: number }> {
    const page = filter.page ?? 1;
    const size = filter.size ?? 20;
    const where: any = {};
    if (filter.buyerId) where.buyerId = filter.buyerId;
    if (filter.status) where.status = filter.status;
    if (filter.category) where.category = filter.category;

    const [items, total] = await Promise.all([
      this.prisma.brief.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.brief.count({ where }),
    ]);
    return { items, total, page, size };
  }

  /**
   * 创作者查公开的 bidding brief(排除自己发的)
   */
  async listPublic(filter: BriefFilter): Promise<{ items: Brief[]; total: number; page: number; size: number }> {
    const page = filter.page ?? 1;
    const size = filter.size ?? 20;
    const where: any = { status: filter.status ?? 'bidding' };
    if (filter.excludeBuyerId) {
      where.buyerId = { not: filter.excludeBuyerId };
    }
    if (filter.category) where.category = filter.category;

    const [items, total] = await Promise.all([
      this.prisma.brief.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.brief.count({ where }),
    ]);
    return { items, total, page, size };
  }

  /**
   * 买家查自己的 brief 详情(所有权校验)
   */
  async getById(id: string, buyerId: string) {
    const brief = await this.prisma.brief.findUnique({
      where: { id },
      include: {
        workspace: { select: { id: true, status: true, creatorId: true } },
      },
    });
    if (!brief) throw new NotFoundException('brief 不存在');
    if (brief.buyerId !== buyerId) {
      throw new ForbiddenException('无权查看该 brief');
    }
    return brief;
  }

  /**
   * 创作者查公开 brief 详情(只能看 bidding 状态)
   * 3 道软护栏之三:创作者端只显示 currentPrice,不显示 bumpHistory(避免歧视老买家 vs 加价老买家)
   */
  async getPublicById(id: string) {
    const brief = await this.prisma.brief.findUnique({
      where: { id },
      include: {
        workspace: { select: { id: true, status: true, creatorId: true } },
      },
    });
    if (!brief) throw new NotFoundException('brief 不存在');
    if (brief.status !== 'bidding') {
      throw new ForbiddenException('该 brief 不可接单');
    }
    // 脱敏:剥离 bumpHistory,创作者端只看到当前价
    const { bumpHistory: _omit, ...sanitized } = brief;
    return sanitized;
  }

  /**
   * #30.7.1 W2 #28 动态调价机制(不设硬上限 + 3 道软护栏)
   * 买家无人接单时,可在 bidding 阶段加价吸引创作者
   * 3 道软护栏:
   *   ① 累计加价次数 ≤ 3 (bumpCount < 3)
   *   ② 加价后总价 > 2 倍菜单价时,需前端二次确认 "我知这是高溢价"
   *   ③ 创作者端 getPublicById 已剥离 bumpHistory,只看到当前价
   *
   * 基础价 basePrice = 首次 publish 时的 currentPrice(若有加价历史 = bumpHistory[0].fromPrice)
   * 建议加价幅度: cron 在 24h/72h/7d 推送 +10% / +20% / +30%
   */
  async bumpPrice(
    id: string,
    buyerId: string,
    params: { percent: number; confirmed?: boolean },
  ): Promise<{ brief: Brief; needConfirm: boolean; overCap: boolean }> {
    const brief = await this.getByIdInternal(id);
    if (brief.buyerId !== buyerId) {
      throw new ForbiddenException('无权操作该 brief');
    }
    if (brief.status !== 'bidding') {
      throw new BadRequestException(`当前状态 ${brief.status} 不可加价,仅 bidding 状态可加价`);
    }
    // ① 累计加价次数封顶
    if (brief.bumpCount >= 3) {
      throw new BadRequestException('已加价 3 次,达到上限;建议关闭 brief 重新发包或调整预算');
    }
    const percent = params.percent;
    if (typeof percent !== 'number' || percent <= 0 || percent > 100) {
      throw new BadRequestException('percent 必须在 (0, 100] 区间');
    }
    const currentPriceNum = brief.currentPrice ? Number(brief.currentPrice) : 0;
    if (currentPriceNum <= 0) {
      throw new BadRequestException('该 brief 尚未 publish,无菜单价基准');
    }
    // 基础价 = 首次 publish 时的价 (= bumpHistory[0].fromPrice 或当前 currentPrice)
    const basePrice = Array.isArray(brief.bumpHistory) && brief.bumpHistory.length > 0
      ? Number((brief.bumpHistory as any[])[0].fromPrice)
      : currentPriceNum;

    const newPrice = Math.round(currentPriceNum * (1 + percent / 100));
    const newTotal = newPrice;
    const overCap = newTotal > basePrice * 2;
    // ② 超 2x 需前端二次确认
    if (overCap && !params.confirmed) {
      return { brief, needConfirm: true, overCap: true };
    }

    const newHistory = Array.isArray(brief.bumpHistory) ? [...(brief.bumpHistory as any[])] : [];
    newHistory.push({
      at: new Date().toISOString(),
      fromPrice: currentPriceNum,
      toPrice: newPrice,
      percent,
      by: 'buyer',
    });
    const updated = await this.prisma.brief.update({
      where: { id },
      data: {
        currentPrice: newPrice as any,
        bumpCount: brief.bumpCount + 1,
        bumpHistory: newHistory as any,
      },
    });
    this.logger.log(
      `bumpPrice brief=${id} from=${currentPriceNum} to=${newPrice} (+${percent}%) bumpCount=${updated.bumpCount}`,
    );
    // W2 #29 推送 — 加价触达创作者(同 publish,只换 type)
    this.push.onBump(updated).catch((e) =>
      this.logger.warn(`push.onBump err: ${e?.message ?? e}`),
    );
    return { brief: updated, needConfirm: false, overCap };
  }

  /**
   * 买家更新 brief(只在 draft / bidding 可改)
   */
  async update(id: string, buyerId: string, params: Partial<{
    title: string;
    description: string;
    platformSet: string[];
    budgetMin: number;
    budgetMax: number;
    packageTier: string;
    deadlineAt: string;
  }>): Promise<Brief> {
    const brief = await this.getByIdInternal(id);
    if (brief.buyerId !== buyerId) {
      throw new ForbiddenException('无权操作该 brief');
    }
    if (!['draft', 'bidding'].includes(brief.status)) {
      throw new BadRequestException(`当前状态 ${brief.status} 不可编辑`);
    }
    const data: any = { ...params };
    if (params.deadlineAt) data.deadlineAt = new Date(params.deadlineAt);
    if (params.platformSet) data.platformSet = params.platformSet as any;
    return this.prisma.brief.update({ where: { id }, data });
  }

  private async getByIdInternal(id: string): Promise<Brief> {
    const brief = await this.prisma.brief.findUnique({ where: { id } });
    if (!brief) throw new NotFoundException('brief 不存在');
    return brief;
  }

  /**
   * #30.7.1 W2 #28 动态调价 cron stub
   * 找出 bidding 状态下"超过 X 小时无人投标"的 brief,生成加价建议
   * 阶梯: 24h → +10% / 72h → +20% / 7d → +30%
   * 调用方: 外部 cron (Linux crontab) 每 6h 调一次
   * 真实推送逻辑(站内信 / 邮件 / 微信)留到 W2-#29 推送通知模块
   *
   * 返回: [{ briefId, hoursSincePublish, suggestedPercent, urgency }]
   */
  async getBumpRecommendations(): Promise<Array<{
    briefId: string;
    hoursSincePublish: number;
    suggestedPercent: number;
    urgency: 'low' | 'medium' | 'high';
  }>> {
    const bidding = await this.prisma.brief.findMany({
      where: { status: 'bidding' },
      include: {
        bids: { select: { id: true }, take: 1 },
      },
    });
    const now = Date.now();
    const recommendations: Array<{
      briefId: string;
      hoursSincePublish: number;
      suggestedPercent: number;
      urgency: 'low' | 'medium' | 'high';
    }> = [];
    for (const b of bidding) {
      if (b.bids.length > 0) continue; // 已有人投标,跳过
      if (b.bumpCount >= 3) continue; // 已加满,跳过
      // TODO: 加 publishedAt 字段更精准(W2-#69 后续),目前用 createdAt 近似
      const hours = Math.floor((now - new Date(b.createdAt).getTime()) / 3_600_000);
      let suggestedPercent = 0;
      let urgency: 'low' | 'medium' | 'high' = 'low';
      if (hours >= 24 * 7) {
        suggestedPercent = 30;
        urgency = 'high';
      } else if (hours >= 72) {
        suggestedPercent = 20;
        urgency = 'medium';
      } else if (hours >= 24) {
        suggestedPercent = 10;
        urgency = 'low';
      }
      if (suggestedPercent > 0) {
        recommendations.push({
          briefId: b.id,
          hoursSincePublish: hours,
          suggestedPercent,
          urgency,
        });
      }
    }
    return recommendations;
  }
}