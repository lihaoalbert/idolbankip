/**
 * scripts/seed-catalog.ts — 平台标准 SKU 菜单 + 验收模板种子
 *
 * #30.7.1 W2 #28
 * - 15 SKU = 5 品类 × 3 档(essential / standard / premium)
 * - 5 个验收模板(每个品类 1 份通用模板,essential/standard/premium 共用)
 * - 加项规则: 加平台 / 加 IP / 加急 / 3D 模型 / 直播切片
 * - 价格锚定: Essential ¥700-1k / Standard ¥1.4k-2k / Premium ¥2.5k-3.5k
 *
 * 跑法:
 *   bash scripts/seed-deploy.sh catalog  # ECS
 *   cd apps/api && pnpm run seed:catalog  # 本地
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ===================== 验收模板(每个品类 1 份通用版) =====================

interface TemplateSeed {
  code: string;
  category: string;
  tier: string; // 'all' 适用于三档
  name: string;
  description: string;
  checklist: any;
}

const TEMPLATES: TemplateSeed[] = [
  {
    code: 'ACCEPT-AD-V1',
    category: 'ad',
    tier: 'all',
    name: '数字人广告片验收标准',
    description: 'AIGC 数字人广告片(30-60s TVC)通用验收清单',
    checklist: {
      version: '1.0',
      passingScore: 0.80,
      items: [
        { id: 'spec-1', criterion: '分辨率 1920x1080(横屏 16:9)或 1080x1920(竖屏 9:16)', weight: 0.15, automated: true, evidenceMethod: 'ffprobe' },
        { id: 'spec-2', criterion: '视频时长与 brief 需求匹配(± 2s)', weight: 0.15, automated: true, evidenceMethod: 'ffprobe' },
        { id: 'spec-3', criterion: '数字人形象无明显瑕疵(穿模/失真/眨眼错乱)', weight: 0.20, automated: false, evidenceMethod: 'vision-llm' },
        { id: 'spec-4', criterion: '口播语音清晰、无明显杂音', weight: 0.10, automated: true, evidenceMethod: 'whisper-asr' },
        { id: 'spec-5', criterion: '字幕同步误差 ≤ 0.5s', weight: 0.10, automated: true, evidenceMethod: 'whisper-diff' },
        { id: 'spec-6', criterion: '不包含明星/未授权真实人物(AI 明星比对 < 0.85)', weight: 0.20, automated: true, evidenceMethod: 'face-similarity' },
        { id: 'spec-7', criterion: '符合《广告法》要求(无绝对化用语、无虚假承诺)', weight: 0.10, automated: false, evidenceMethod: 'vision-llm' },
      ],
    },
  },
  {
    code: 'ACCEPT-SHORTVIDEO-V1',
    category: 'shortvideo',
    tier: 'all',
    name: 'AIGC 短视频验收标准',
    description: '抖音/小红书/TikTok 短视频(15-60s)通用验收清单',
    checklist: {
      version: '1.0',
      passingScore: 0.80,
      items: [
        { id: 'spec-1', criterion: '分辨率 1080x1920(竖屏 9:16)或 1920x1080(横屏 16:9)', weight: 0.15, automated: true, evidenceMethod: 'ffprobe' },
        { id: 'spec-2', criterion: '视频时长与 brief 需求匹配(± 2s)', weight: 0.15, automated: true, evidenceMethod: 'ffprobe' },
        { id: 'spec-3', criterion: '前 3 秒有强 hook(视觉冲击/悬念/痛点)', weight: 0.15, automated: false, evidenceMethod: 'vision-llm' },
        { id: 'spec-4', criterion: '核心卖点呈现清晰(≥ 3 个关键信息)', weight: 0.20, automated: false, evidenceMethod: 'vision-llm' },
        { id: 'spec-5', criterion: '口播/字幕同步(误差 ≤ 0.5s)', weight: 0.10, automated: true, evidenceMethod: 'whisper-diff' },
        { id: 'spec-6', criterion: '无明星侵权(face-similarity < 0.85)', weight: 0.20, automated: true, evidenceMethod: 'face-similarity' },
        { id: 'spec-7', criterion: '无 AIGC 显著标识缺失', weight: 0.05, automated: true, evidenceMethod: 'metadata-check' },
      ],
    },
  },
  {
    code: 'ACCEPT-LIVESTREAM-V1',
    category: 'livestream_clip',
    tier: 'all',
    name: '直播切片验收标准',
    description: '直播录像 AI 二剪 / 高光剪辑通用验收清单',
    checklist: {
      version: '1.0',
      passingScore: 0.80,
      items: [
        { id: 'spec-1', criterion: '分辨率与原直播一致(或 1080p 重编码)', weight: 0.10, automated: true, evidenceMethod: 'ffprobe' },
        { id: 'spec-2', criterion: '时长与 brief 匹配(± 5s, 切片允许略长)', weight: 0.15, automated: true, evidenceMethod: 'ffprobe' },
        { id: 'spec-3', criterion: '关键高光片段完整(无明显漏点)', weight: 0.25, automated: false, evidenceMethod: 'vision-llm' },
        { id: 'spec-4', criterion: '字幕/弹幕同步', weight: 0.10, automated: true, evidenceMethod: 'whisper-diff' },
        { id: 'spec-5', criterion: '转场自然、无明显卡顿', weight: 0.10, automated: false, evidenceMethod: 'vision-llm' },
        { id: 'spec-6', criterion: '原主播/嘉宾肖像权合规(默认合理使用,二次传播需平台审核)', weight: 0.20, automated: false, evidenceMethod: 'manual-review' },
        { id: 'spec-7', criterion: '背景音乐版权清晰(平台自选/已授权)', weight: 0.10, automated: false, evidenceMethod: 'manual-review' },
      ],
    },
  },
  {
    code: 'ACCEPT-POSTER-V1',
    category: 'poster',
    tier: 'all',
    name: '营销海报验收标准',
    description: '主视觉 / banner / KV / 小红书图文通用验收清单',
    checklist: {
      version: '1.0',
      passingScore: 0.80,
      items: [
        { id: 'spec-1', criterion: '分辨率符合 brief 要求(常用 1080x1350 / 1080x1920 / 1920x1080)', weight: 0.15, automated: true, evidenceMethod: 'image-info' },
        { id: 'spec-2', criterion: '文件格式(JPG/PNG/PSD)与 brief 匹配', weight: 0.05, automated: true, evidenceMethod: 'image-info' },
        { id: 'spec-3', criterion: '主体清晰、视觉焦点突出', weight: 0.25, automated: false, evidenceMethod: 'vision-llm' },
        { id: 'spec-4', criterion: '文字信息完整(标题/卖点/品牌/CTA)', weight: 0.20, automated: false, evidenceMethod: 'vision-llm' },
        { id: 'spec-5', criterion: '无 AIGC 显著标识缺失(右下角"AI 生成"角标)', weight: 0.10, automated: true, evidenceMethod: 'watermark-detect' },
        { id: 'spec-6', criterion: '无明星侵权 / 无未授权品牌 Logo', weight: 0.20, automated: true, evidenceMethod: 'face-similarity' },
        { id: 'spec-7', criterion: '符合《广告法》(无绝对化用语/虚假承诺)', weight: 0.05, automated: false, evidenceMethod: 'vision-llm' },
      ],
    },
  },
  {
    code: 'ACCEPT-3D-V1',
    category: '3d',
    tier: 'all',
    name: '3D 数字人验收标准',
    description: 'Live2D / 3D 角色 / 虚幻引擎场景通用验收清单',
    checklist: {
      version: '1.0',
      passingScore: 0.80,
      items: [
        { id: 'spec-1', criterion: '分辨率与 brief 匹配(常用 1920x1080)', weight: 0.10, automated: true, evidenceMethod: 'ffprobe' },
        { id: 'spec-2', criterion: '帧率 ≥ 30fps', weight: 0.10, automated: true, evidenceMethod: 'ffprobe' },
        { id: 'spec-3', criterion: '模型完整性(无穿模/破面/缺贴图)', weight: 0.25, automated: false, evidenceMethod: 'vision-llm' },
        { id: 'spec-4', criterion: '动作流畅、骨骼绑定自然', weight: 0.20, automated: false, evidenceMethod: 'vision-llm' },
        { id: 'spec-5', criterion: '光照/材质符合 brief 描述', weight: 0.15, automated: false, evidenceMethod: 'vision-llm' },
        { id: 'spec-6', criterion: '源文件交付(Unity/UE 工程 + 模型 + 贴图 + 动画)', weight: 0.15, automated: true, evidenceMethod: 'attachment-check' },
        { id: 'spec-7', criterion: '无版权争议(模型/动画/音乐均合法授权)', weight: 0.05, automated: false, evidenceMethod: 'manual-review' },
      ],
    },
  },
];

// ===================== SKU 菜单(15 SKU) =====================

interface SkuSeed {
  code: string;
  category: string;
  tier: string;
  basePrice: number;
  deliveryDays: number;
  quantity: number;
  ipsIncluded: number;
  platformsIncluded: number;
  addOnRules: any;
  description: string;
  sortOrder: number;
  defaultChecklistCode: string;
}

const SKUS: SkuSeed[] = [
  // ===== AD 数字人广告片 =====
  {
    code: 'AIGC-AD-ESSENTIAL',
    category: 'ad',
    tier: 'essential',
    basePrice: 800,
    deliveryDays: 7,
    quantity: 1,
    ipsIncluded: 1,
    platformsIncluded: 1,
    description: '数字人广告片基础版:1 条 30s 数字人出镜广告 / 1 平台 / 1 个 IP / 7 天交付',
    sortOrder: 1,
    defaultChecklistCode: 'ACCEPT-AD-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5, description: '每多 1 个平台 +5%' },
      { code: 'ADD_IP', name: '加 1 个 IP', basePercent: 8, description: '每多 1 个 IP +8%' },
      { code: 'RUSH_3D', name: '加急(< 7 天交付)', basePercent: 25, description: '交付期 < 7 天 +25%' },
    ],
  },
  {
    code: 'AIGC-AD-STANDARD',
    category: 'ad',
    tier: 'standard',
    basePrice: 1700,
    deliveryDays: 14,
    quantity: 3,
    ipsIncluded: 2,
    platformsIncluded: 3,
    description: '数字人广告片标准版:3 条 30s / 3 平台 / 2 个 IP / 14 天交付 / 多比例适配',
    sortOrder: 2,
    defaultChecklistCode: 'ACCEPT-AD-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'ADD_IP', name: '加 1 个 IP', basePercent: 8 },
      { code: 'RUSH_3D', name: '加急', basePercent: 25 },
      { code: 'EXTRA_VIDEO', name: '加 1 条视频', basePrice: 380, description: '每加 1 条视频 +¥380' },
    ],
  },
  {
    code: 'AIGC-AD-PREMIUM',
    category: 'ad',
    tier: 'premium',
    basePrice: 3000,
    deliveryDays: 21,
    quantity: 6,
    ipsIncluded: 3,
    platformsIncluded: 5,
    description: '数字人广告片旗舰版:6 条 / 5 平台 / 3 个 IP / 21 天交付 / 含真人监修 + 数据复盘',
    sortOrder: 3,
    defaultChecklistCode: 'ACCEPT-AD-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'ADD_IP', name: '加 1 个 IP', basePercent: 8 },
      { code: 'HIGH_COMPLEXITY', name: '高复杂度', basePercent: 30, description: '定制镜头/特效/转场/真人 + AI +30%' },
    ],
  },

  // ===== SHORTVIDEO AIGC 短视频 =====
  {
    code: 'AIGC-SHORT-ESSENTIAL',
    category: 'shortvideo',
    tier: 'essential',
    basePrice: 700,
    deliveryDays: 5,
    quantity: 1,
    ipsIncluded: 1,
    platformsIncluded: 1,
    description: 'AIGC 短视频基础版:1 条 30s 短视频 / 1 平台 / 1 个 IP / 5 天交付',
    sortOrder: 11,
    defaultChecklistCode: 'ACCEPT-SHORTVIDEO-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'ADD_IP', name: '加 1 个 IP', basePercent: 8 },
      { code: 'RUSH_3D', name: '加急', basePercent: 25 },
    ],
  },
  {
    code: 'AIGC-SHORT-STANDARD',
    category: 'shortvideo',
    tier: 'standard',
    basePrice: 1500,
    deliveryDays: 10,
    quantity: 5,
    ipsIncluded: 2,
    platformsIncluded: 3,
    description: 'AIGC 短视频标准版:5 条 30s / 3 平台 / 2 个 IP / 10 天交付 / 多比例适配',
    sortOrder: 12,
    defaultChecklistCode: 'ACCEPT-SHORTVIDEO-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'ADD_IP', name: '加 1 个 IP', basePercent: 8 },
      { code: 'RUSH_3D', name: '加急', basePercent: 25 },
      { code: 'EXTRA_VIDEO', name: '加 1 条视频', basePrice: 280 },
    ],
  },
  {
    code: 'AIGC-SHORT-PREMIUM',
    category: 'shortvideo',
    tier: 'premium',
    basePrice: 2800,
    deliveryDays: 18,
    quantity: 10,
    ipsIncluded: 3,
    platformsIncluded: 5,
    description: 'AIGC 短视频旗舰版:10 条 / 5 平台 / 3 个 IP / 18 天交付 / 含数据复盘 + 真人监修',
    sortOrder: 13,
    defaultChecklistCode: 'ACCEPT-SHORTVIDEO-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'ADD_IP', name: '加 1 个 IP', basePercent: 8 },
      { code: 'HIGH_COMPLEXITY', name: '高复杂度', basePercent: 30 },
    ],
  },

  // ===== LIVESTREAM_CLIP 直播切片 =====
  {
    code: 'AIGC-LIVE-ESSENTIAL',
    category: 'livestream_clip',
    tier: 'essential',
    basePrice: 800,
    deliveryDays: 5,
    quantity: 3,
    ipsIncluded: 1,
    platformsIncluded: 1,
    description: '直播切片基础版:3 条 60s 切片 / 1 平台 / 1 个 IP(原主播) / 5 天交付',
    sortOrder: 21,
    defaultChecklistCode: 'ACCEPT-LIVESTREAM-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'RUSH_3D', name: '加急', basePercent: 25 },
      { code: 'EXTRA_VIDEO', name: '加 1 条切片', basePrice: 220 },
    ],
  },
  {
    code: 'AIGC-LIVE-STANDARD',
    category: 'livestream_clip',
    tier: 'standard',
    basePrice: 1600,
    deliveryDays: 10,
    quantity: 8,
    ipsIncluded: 1,
    platformsIncluded: 3,
    description: '直播切片标准版:8 条 / 3 平台 / 1 个 IP / 10 天交付 / 字幕 + 配乐',
    sortOrder: 22,
    defaultChecklistCode: 'ACCEPT-LIVESTREAM-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'RUSH_3D', name: '加急', basePercent: 25 },
      { code: 'EXTRA_VIDEO', name: '加 1 条切片', basePrice: 200 },
      { code: 'SUBTITLE_BURN', name: '烧录字幕', basePrice: 100, description: '硬字幕嵌入 +¥100/条' },
    ],
  },
  {
    code: 'AIGC-LIVE-PREMIUM',
    category: 'livestream_clip',
    tier: 'premium',
    basePrice: 3000,
    deliveryDays: 18,
    quantity: 20,
    ipsIncluded: 1,
    platformsIncluded: 5,
    description: '直播切片旗舰版:20 条 / 5 平台 / 1 个 IP / 18 天交付 / 全自动剪辑 + 数据复盘',
    sortOrder: 23,
    defaultChecklistCode: 'ACCEPT-LIVESTREAM-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'HIGH_COMPLEXITY', name: '高复杂度', basePercent: 30 },
    ],
  },

  // ===== POSTER 营销海报 =====
  {
    code: 'AIGC-POSTER-ESSENTIAL',
    category: 'poster',
    tier: 'essential',
    basePrice: 700,
    deliveryDays: 5,
    quantity: 1,
    ipsIncluded: 1,
    platformsIncluded: 1,
    description: '营销海报基础版:1 张主视觉(KV) / 1 平台 / 1 个 IP / 5 天交付',
    sortOrder: 31,
    defaultChecklistCode: 'ACCEPT-POSTER-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'ADD_IP', name: '加 1 个 IP', basePercent: 8 },
      { code: 'RUSH_3D', name: '加急', basePercent: 25 },
    ],
  },
  {
    code: 'AIGC-POSTER-STANDARD',
    category: 'poster',
    tier: 'standard',
    basePrice: 1400,
    deliveryDays: 10,
    quantity: 5,
    ipsIncluded: 1,
    platformsIncluded: 3,
    description: '营销海报标准版:5 张主视觉 / 3 平台 / 1 个 IP / 10 天交付 / 多比例适配',
    sortOrder: 32,
    defaultChecklistCode: 'ACCEPT-POSTER-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'RUSH_3D', name: '加急', basePercent: 25 },
      { code: 'EXTRA_VIDEO', name: '加 1 张海报', basePrice: 250 },
    ],
  },
  {
    code: 'AIGC-POSTER-PREMIUM',
    category: 'poster',
    tier: 'premium',
    basePrice: 2800,
    deliveryDays: 18,
    quantity: 10,
    ipsIncluded: 2,
    platformsIncluded: 5,
    description: '营销海报旗舰版:10 张 / 5 平台 / 2 个 IP / 18 天交付 / 含品牌 VI 套件',
    sortOrder: 33,
    defaultChecklistCode: 'ACCEPT-POSTER-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'ADD_IP', name: '加 1 个 IP', basePercent: 8 },
      { code: 'HIGH_COMPLEXITY', name: '高复杂度', basePercent: 30 },
    ],
  },

  // ===== 3D 数字人 =====
  {
    code: 'AIGC-3D-ESSENTIAL',
    category: '3d',
    tier: 'essential',
    basePrice: 1000,
    deliveryDays: 10,
    quantity: 1,
    ipsIncluded: 1,
    platformsIncluded: 1,
    description: '3D 数字人基础版:1 个 3D 角色样片 15s / 1 平台 / 1 个 IP / 10 天交付',
    sortOrder: 41,
    defaultChecklistCode: 'ACCEPT-3D-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'RUSH_3D', name: '加急', basePercent: 25 },
    ],
  },
  {
    code: 'AIGC-3D-STANDARD',
    category: '3d',
    tier: 'standard',
    basePrice: 2000,
    deliveryDays: 18,
    quantity: 3,
    ipsIncluded: 1,
    platformsIncluded: 3,
    description: '3D 数字人标准版:3 段 15s 样片 / 3 平台 / 1 个 IP / 18 天交付 / 含源文件',
    sortOrder: 42,
    defaultChecklistCode: 'ACCEPT-3D-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'RUSH_3D', name: '加急', basePercent: 25 },
      { code: 'EXTRA_VIDEO', name: '加 1 段样片', basePrice: 600 },
    ],
  },
  {
    code: 'AIGC-3D-PREMIUM',
    category: '3d',
    tier: 'premium',
    basePrice: 3500,
    deliveryDays: 30,
    quantity: 6,
    ipsIncluded: 2,
    platformsIncluded: 5,
    description: '3D 数字人旗舰版:6 段 / 5 平台 / 2 个 IP / 30 天交付 / 全套源文件 + 真人监修',
    sortOrder: 43,
    defaultChecklistCode: 'ACCEPT-3D-V1',
    addOnRules: [
      { code: 'ADD_PLATFORM', name: '加 1 个平台', basePercent: 5 },
      { code: 'ADD_IP', name: '加 1 个 IP', basePercent: 8 },
      { code: 'HIGH_COMPLEXITY', name: '高复杂度', basePercent: 30 },
    ],
  },
];

// ===================== 主函数 =====================

async function main() {
  console.log('🌱 Seeding catalog (15 SKU + 5 templates)...');

  // 1. 验收模板
  const tplIdMap: Record<string, string> = {};
  for (const tpl of TEMPLATES) {
    const created = await prisma.acceptanceTemplate.upsert({
      where: { code: tpl.code },
      update: {
        category: tpl.category,
        tier: tpl.tier,
        name: tpl.name,
        description: tpl.description,
        checklist: tpl.checklist as any,
        version: '1.0',
        enabled: true,
      },
      create: {
        code: tpl.code,
        category: tpl.category,
        tier: tpl.tier,
        name: tpl.name,
        description: tpl.description,
        checklist: tpl.checklist as any,
        version: '1.0',
        enabled: true,
      },
    });
    tplIdMap[tpl.code] = created.id;
    console.log(`  ✅ Template ${tpl.code} (${tpl.name})`);
  }

  // 2. SKU 菜单
  for (const sku of SKUS) {
    const checklistId = tplIdMap[sku.defaultChecklistCode];
    await prisma.catalogSku.upsert({
      where: { code: sku.code },
      update: {
        category: sku.category,
        tier: sku.tier,
        basePrice: new Prisma.Decimal(sku.basePrice),
        deliveryDays: sku.deliveryDays,
        quantity: sku.quantity,
        ipsIncluded: sku.ipsIncluded,
        platformsIncluded: sku.platformsIncluded,
        addOnRules: sku.addOnRules as any,
        description: sku.description,
        defaultChecklistId: checklistId,
        enabled: true,
        sortOrder: sku.sortOrder,
      },
      create: {
        code: sku.code,
        category: sku.category,
        tier: sku.tier,
        basePrice: new Prisma.Decimal(sku.basePrice),
        deliveryDays: sku.deliveryDays,
        quantity: sku.quantity,
        ipsIncluded: sku.ipsIncluded,
        platformsIncluded: sku.platformsIncluded,
        addOnRules: sku.addOnRules as any,
        description: sku.description,
        defaultChecklistId: checklistId,
        enabled: true,
        sortOrder: sku.sortOrder,
      },
    });
    console.log(`  ✅ SKU ${sku.code} ¥${sku.basePrice} (${sku.description.slice(0, 30)}...)`);
  }

  console.log('✅ Catalog seed done.');
}

main()
  .catch((e) => {
    console.error('❌ Catalog seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
