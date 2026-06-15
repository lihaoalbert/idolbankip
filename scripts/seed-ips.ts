/**
 * ibi.ren · 种子 IP 脚本
 * 用法: pnpm seed:ips
 *
 * 生成 100 个占位 IP (IBI-2026-0001..0100),状态直接置为 PUBLIC_INTENT
 * 不上传真实素材,只写 IpFile 行 (ossKey 指向不存在的 key,下载时返回 404)
 *
 * 重复运行幂等(按 code 跳过已存在的)
 */
import { PrismaClient, IpStatus, AssetType } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const TOTAL = Number(process.env.SEED_IPS_TOTAL || 100);

const FIRST_NAMES = ['林', '苏', '陈', '白', '叶', '顾', '沈', '宋', '秦', '萧', '谢', '温', '江', '傅', '黎'];
const GIVEN_NAMES = ['知夏', '暮云', '清越', '晚吟', '寻真', '若笙', '怀瑾', '念安', '唯心', '听雪', '问渠', '初见', '遥光', '尽欢', '可期'];
const TITLES = ['都市丽人', '古装佳人', '赛博少女', '校园清新', '民国闺秀', '元气偶像', '职场精英', '甜酷少女'];

const GENDERS = ['female', 'female', 'female', 'male', 'male', 'nonbinary']; // 偏重
const AGES = ['young', 'young', 'young', 'middle', 'old', 'child'];
const STYLES = ['现代', '古风', '赛博', '二次元', '民国', '未来', '复古', '日式', '韩系', '北欧'];
const SCENARIOS = ['短剧群演', '短剧主演', '品牌代言', '平面模特', '游戏角色', '直播', '广告', '电商模特', '电影配角'];

const STYLE_PRICE: Record<string, number> = {
  '古风': 500000,
  '赛博': 400000,
  '未来': 400000,
  '现代': 300000,
  '民国': 350000,
  '二次元': 200000,
  '复古': 300000,
  '韩系': 320000,
  '日式': 280000,
  '北欧': 380000,
};

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN<T>(arr: T[], n: number): T[] {
  const c = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && c.length; i++) {
    out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
  }
  return out;
}

function generateName(i: number): string {
  if (i < TITLES.length) return `${pick(FIRST_NAMES)}${pick(GIVEN_NAMES)} · ${TITLES[i]}`;
  return `${pick(FIRST_NAMES)}${pick(GIVEN_NAMES)}`;
}

function generateTagline(name: string, style: string, scenario: string): string {
  const templates = [
    `${style}风${pick(['御姐', '甜妹', '清冷', '飒爽', '文艺'])}人设,适配${scenario}`,
    `${name},面向${scenario}市场,${style}美学`,
    `${pick(['治愈系', '高级感', '故事感', '氛围感'])}${style}形象,${scenario}首选`,
  ];
  return pick(templates);
}

function generateDescription(name: string, style: string, age: string): string {
  return [
    `# ${name}`,
    '',
    `## 基础设定`,
    `- 视觉年龄: ${age === 'young' ? '青年 (22-28)' : age === 'middle' ? '中年 (32-40)' : age === 'old' ? '熟龄 (45-60)' : '少女 (16-21)'}`,
    `- 风格定位: ${style}`,
    '',
    `## 人物小传`,
    `${name} 出生于 ${pick(['江南', '北平', '巴蜀', '岭南', '上海', '东京', '巴黎'])}。`,
    `${pick(['性格温柔而坚定', '外表清冷内心炽热', '充满好奇心', '理性克制', '古灵精怪'])},`,
    `${pick(['从事艺术创作', '在咖啡馆工作', '为剧团演出', '做独立设计师', '为家族企业效力'])}。`,
    '',
    `## 视觉关键词`,
    `${style} · ${pick(['东方美学', '都市感', '年代感', '未来感'])} · ${pick(['柔和', '锋利', '清透', '浓郁'])}色调`,
  ].join('\n');
}

async function ensureIp(i: number, creatorId: string): Promise<string> {
  const code = `IBI-2026-${String(i).padStart(4, '0')}`;
  const existing = await prisma.ipAsset.findUnique({ where: { code } });
  if (existing) {
    console.log(`   ↩ ${code} 已存在,跳过`);
    return existing.id;
  }
  const gender = pick(GENDERS);
  const visualAgeBucket = pick(AGES);
  const styleTags = pickN(STYLES, 1 + Math.floor(Math.random() * 2));
  const scenarioTags = pickN(SCENARIOS, 1 + Math.floor(Math.random() * 2));
  const displayName = generateName(i);
  const primaryStyle = styleTags[0];
  const fullLicensePriceFen = STYLE_PRICE[primaryStyle] || 300000;
  const description = generateDescription(displayName, primaryStyle, visualAgeBucket);
  const tagline = generateTagline(displayName, primaryStyle, scenarioTags[0]);

  const ip = await prisma.ipAsset.create({
    data: {
      code,
      creatorId,
      displayName,
      tagline,
      description,
      gender,
      visualAgeBucket,
      styleTags: styleTags.join(','),
      scenarioTags: scenarioTags.join(','),
      depositPriceFen: 19900,
      fullLicensePriceFen,
      status: 'PUBLIC_INTENT',
      publishedAt: new Date(),
      blockchainHash: crypto.randomBytes(32).toString('hex'),
      blockchainTxId: `mock-tx-${code.toLowerCase()}-${crypto.randomBytes(4).toString('hex')}`,
      blockchainNetwork: 'mock-chain-001',
      proofTimestamp: new Date(),
      previewImageKeys: [],
      thumbnailKey: `ips/${code}/thumb_600.jpg`,
    },
  });

  // 创建 IpFile 占位行
  const requiredTypes: AssetType[] = [
    AssetType.THREE_VIEW,
    AssetType.EXPRESSION_GRID,
    AssetType.TRANSPARENT_RENDER,
    AssetType.LORA_FILE,
    AssetType.RECIPE_TXT,
    AssetType.BIO_TXT,
  ];
  await prisma.ipFile.createMany({
    data: requiredTypes.map((assetType) => ({
      ipId: ip.id,
      assetType,
      originalName: `${code}_${assetType.toLowerCase()}.bin`,
      ossKey: `ips/${code}/raw/${assetType}/placeholder.bin`,
      sizeBytes: BigInt(assetType === 'LORA_FILE' ? 268435456 : 1024 * 100),
      mimeType: assetType === 'BIO_TXT' || assetType === 'RECIPE_TXT' ? 'text/plain' : 'application/octet-stream',
      checksumSha256: crypto.randomBytes(32).toString('hex'),
      validated: true,
    })),
  });

  // 写 mock blockchain proof
  await prisma.blockchainProof.create({
    data: {
      ipId: ip.id,
      payloadHash: ip.blockchainHash!,
      network: 'mock-chain-001',
      txId: ip.blockchainTxId!,
      blockHeight: BigInt(Math.floor(Date.now() / 1000)),
    },
  });

  return ip.id;
}

async function main() {
  const creators = await prisma.user.findMany({ where: { role: 'CREATOR' } });
  if (creators.length === 0) {
    throw new Error('请先执行 pnpm seed:users 创建创作者账号');
  }

  console.log(`🌱 生成 ${TOTAL} 个占位 IP…`);
  for (let i = 1; i <= TOTAL; i++) {
    const creator = creators[i % creators.length];
    await ensureIp(i, creator.id);
    if (i % 20 === 0) console.log(`   ⏳ 已生成 ${i}/${TOTAL}`);
  }

  const count = await prisma.ipAsset.count({ where: { code: { startsWith: 'IBI-' } } });
  console.log('');
  console.log(`🎉 完成。共 ${count} 条 IP 记录。`);
  console.log('💡 提示: 真实图片 / LoRA 文件未上传,IpFile 行指向 placeholder key,');
  console.log('         下载时会返回 404 + "demo data" 提示。');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
