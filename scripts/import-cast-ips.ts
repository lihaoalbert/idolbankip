/**
 * ibi.ren · 导入 cast 项目官方角色 (EA 桶, 200 个) 为平台官方 IP 资产
 *
 * 用法 (对齐 AGENTS.md 3.3 SOP):
 *   cd apps/api && pnpm exec tsx ../../scripts/import-cast-ips.ts [--dry-run] [--apply]
 *                                                 [--skip-file path] [--limit N] [--no-upload]
 *
 * 默认 --dry-run: 只打印将创建/跳过/上传什么, 不写库不上传。
 * --apply 才真正执行 (上传 OSS + 写 IpAsset / IpFile / BlockchainProof)。
 * --no-upload 配合 --apply 使用: 写库但跳过 OSS 上传 (本地无 OSS 凭据时验证用)。
 * --skip-file: 每行一个 id (如 IBC-EA-0007), 支持 # 注释与空行 — 用于跳过"需重生"条目。
 *
 * 幂等: externalSource='CAST' + externalRecordId=sidecar id (unique), 重跑跳过已存在行;
 *       OSS 上传前 head 检查, 对象已存在则跳过上传。
 *
 * 数据源: /Users/app/cast/characters/EA/ibc-ea-XXXX.json + 同名 .png (可用 CAST_SOURCE_DIR 覆盖)
 */
import { PrismaClient, Gender, AgeBucket, Ethnicity, AssetType, IpStatus } from '@prisma/client';
import OSS from 'ali-oss';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const CAST_DIR = process.env.CAST_SOURCE_DIR || '/Users/app/cast/characters/EA';
const EXTERNAL_SOURCE = 'CAST';
const SCENARIO_TAGS = '广告,电商模特,品牌代言,短剧群演';
const DEPOSIT_PRICE_FEN = 19900; // 199 元意向金
const FULL_LICENSE_PRICE_FEN = 299900; // 2999 元全量授权
const MOCK_NETWORK = 'mock-chain-001';

// ---------- sidecar 类型 ----------

interface CastSidecar {
  id: string; // "IBC-EA-0001"
  reg: string;
  reg_label: string;
  origin: string;
  gender: string; // "M" | "F"
  age: number;
  age_band: string; // "18-25" | "26-35" | "36-45" | "46-55" | "56-65" | "66-75"
  occupation: string;
  era_style: string;
  era_label: string;
  matrix: Record<string, string>;
  prompt_sha1: string;
  image: { w: number; h: number; bytes: number; sha1: string };
  model: string;
  route: string;
  generated_at: string;
  oss_key: string;
  qc: { status: string; note: string };
}

// ---------- 映射 ----------

const GENDER_MAP: Record<string, Gender> = { M: Gender.MALE, F: Gender.FEMALE };
const AGE_BUCKET_MAP: Record<string, AgeBucket> = {
  '18-25': AgeBucket.YOUNG,
  '26-35': AgeBucket.YOUNG,
  '36-45': AgeBucket.MIDDLE,
  '46-55': AgeBucket.MIDDLE,
  '56-65': AgeBucket.ELDERLY,
  '66-75': AgeBucket.ELDERLY,
};

function mapGender(s: string): Gender {
  const g = GENDER_MAP[s];
  if (!g) throw new Error(`未知 gender: ${s}`);
  return g;
}

function mapAgeBucket(band: string): AgeBucket {
  const b = AGE_BUCKET_MAP[band];
  if (!b) throw new Error(`未知 age_band: ${band}`);
  return b;
}

function buildTagline(sc: CastSidecar): string {
  const genderLabel = sc.gender === 'M' ? '男性' : '女性';
  return `${sc.origin} · ${sc.age}岁${genderLabel} · ${sc.occupation || sc.era_label}`;
}

function buildDescription(sc: CastSidecar): string {
  const genderLabel = sc.gender === 'M' ? '男性' : '女性';
  const lines: string[] = [
    `# ${sc.id}`,
    '',
    `## 身份`,
    `- 地域: ${sc.reg_label} (${sc.reg})`,
    `- 籍贯: ${sc.origin}`,
    `- 性别: ${genderLabel}`,
    `- 年龄: ${sc.age} 岁 (${sc.age_band})`,
    `- 时代风格: ${sc.era_label} (${sc.era_style})`,
    `- 职业: ${sc.occupation || sc.era_label}`,
    '',
    `## 外形设定矩阵`,
  ];
  for (const [k, v] of Object.entries(sc.matrix)) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push(
    '',
    `## 溯源`,
    `- model: ${sc.model}`,
    `- route: ${sc.route}`,
    `- generated_at: ${sc.generated_at}`,
    `- prompt_sha1: ${sc.prompt_sha1}`,
    `- image_sha1: ${sc.image.sha1}`,
    `- qc_status: ${sc.qc.status}`,
  );
  return lines.join('\n');
}

// ---------- 参数解析 ----------

interface CliOptions {
  apply: boolean;
  skipFile?: string;
  limit?: number;
  noUpload: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { apply: false, noUpload: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--dry-run') opts.apply = false;
    else if (a === '--no-upload') opts.noUpload = true;
    else if (a === '--skip-file') opts.skipFile = argv[++i];
    else if (a === '--limit') opts.limit = Number(argv[++i]);
    else throw new Error(`未知参数: ${a}`);
  }
  if (opts.limit !== undefined && (!Number.isInteger(opts.limit) || opts.limit <= 0)) {
    throw new Error(`--limit 必须是正整数, 收到: ${opts.limit}`);
  }
  return opts;
}

async function loadSkipSet(file?: string): Promise<Set<string>> {
  if (!file) return new Set();
  const raw = await fs.readFile(file, 'utf8');
  const ids = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.toUpperCase());
  return new Set(ids);
}

// ---------- 主流程 ----------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dryRun = !opts.apply;
  const skipSet = await loadSkipSet(opts.skipFile);

  console.log(dryRun ? '🔍 DRY-RUN 模式 (加 --apply 才真正执行)' : '🚀 APPLY 模式 — 将写库并上传 OSS');
  if (opts.noUpload) console.log('⚠️  --no-upload: 跳过 OSS 上传 (仅写库)');
  if (skipSet.size > 0) console.log(`⏭  跳过清单: ${skipSet.size} 个 id`);

  // 1. 枚举 sidecar
  const files = (await fs.readdir(CAST_DIR)).filter((f) => f.endsWith('.json')).sort();
  const sidecars: CastSidecar[] = [];
  for (const f of files) {
    sidecars.push(JSON.parse(await fs.readFile(path.join(CAST_DIR, f), 'utf8')) as CastSidecar);
  }
  console.log(`📂 ${CAST_DIR}: ${sidecars.length} 个 sidecar`);

  // 2. 查 ADMIN 用户作为 creatorId (AGENTS.md 6.1: JSON 列用 array_contains;
  //    注意 roles.util.ts 的 string_contains 写法在 Prisma 5.22 + MySQL 8 实测查不到, 见调试记录)
  const prisma = new PrismaClient();
  let adminId: string | null = null;
  try {
    const admin = await prisma.user.findFirst({
      where: { roles: { array_contains: 'ADMIN' } as never },
      orderBy: { createdAt: 'asc' },
    });
    if (!admin) {
      throw new Error('数据库中找不到 roles 包含 ADMIN 的用户, 请先执行 seed-users.ts 创建管理员');
    }
    adminId = admin.id;
    console.log(`👤 creatorId = ADMIN 用户 ${admin.email} (${admin.id})`);
  } catch (e) {
    if (!dryRun) throw e;
    console.log(`⚠️  dry-run 无法查询 ADMIN 用户 (${(e as Error).message}), 跳过重存在检查`);
  }

  // 3. OSS client (仅 apply 且非 no-upload 时需要; 凭据从 env 读, 永不打印)
  let oss: OSS | null = null;
  if (!dryRun && !opts.noUpload) {
    const { OSS_REGION, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET_PUBLIC } = process.env;
    if (!OSS_REGION || !OSS_ACCESS_KEY_ID || !OSS_ACCESS_KEY_SECRET || !OSS_BUCKET_PUBLIC) {
      throw new Error('缺少 OSS_REGION / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET_PUBLIC 环境变量');
    }
    oss = new OSS({
      region: OSS_REGION,
      accessKeyId: OSS_ACCESS_KEY_ID,
      accessKeySecret: OSS_ACCESS_KEY_SECRET,
      bucket: OSS_BUCKET_PUBLIC,
    });
  }

  // 4. 逐条处理
  let created = 0;
  let skippedExisting = 0;
  let skippedList = 0;
  let skippedQc = 0;
  let uploaded = 0;
  let uploadSkipped = 0;
  const failures: { id: string; reason: string }[] = [];
  let processed = 0;

  const limit = opts.limit ?? sidecars.length;
  for (const sc of sidecars) {
    if (processed >= limit) break;
    const id = sc.id;
    const code = id; // code 保持 sidecar id, 可溯源
    const ossKey = `ips/${code}/main.png`;
    const pngPath = path.join(CAST_DIR, `${id.toLowerCase()}.png`);

    try {
      // 跳过清单
      if (skipSet.has(id.toUpperCase())) {
        skippedList++;
        processed++;
        continue;
      }
      // QC 未过 (并行审计标"需重生") — 跳过, 修正后重跑即可
      if (sc.qc.status !== 'ok') {
        skippedQc++;
        console.log(`   ⏭ ${id}: qc.status=${sc.qc.status}${sc.qc.note ? ` (${sc.qc.note})` : ''}, 跳过`);
        processed++;
        continue;
      }

      // 本地 png 校验 + 实际计算 sha256 / size
      const pngBuf = await fs.readFile(pngPath);
      const checksumSha256 = crypto.createHash('sha256').update(pngBuf).digest('hex');
      const sizeBytes = BigInt(pngBuf.byteLength);

      // 幂等: externalRecordId 已存在则跳过
      let existing = false;
      if (adminId) {
        const dup = await prisma.ipAsset.findUnique({ where: { externalRecordId: id } });
        existing = !!dup;
      }

      if (dryRun) {
        console.log(
          `   ${existing ? '↩ 已存在,跳过' : '+ 将创建'} ${code}` +
            ` | ${buildTagline(sc)} | ${mapGender(sc.gender)}/${mapAgeBucket(sc.age_band)}` +
            `${existing ? '' : ` | 上传 → ${ossKey} (${pngBuf.byteLength} B)`}`,
        );
        if (existing) skippedExisting++;
        else created++;
        processed++;
        continue;
      }

      if (existing) {
        skippedExisting++;
        processed++;
        continue;
      }

      // 上传 OSS (幂等: head 已存在则跳过)
      if (oss) {
        let exists = false;
        try {
          await oss.head(ossKey);
          exists = true;
        } catch {
          exists = false; // NoSuchKey → 需要上传
        }
        if (exists) {
          uploadSkipped++;
        } else {
          await oss.put(ossKey, pngBuf, {
            mime: 'image/png',
            headers: { 'Cache-Control': 'public, max-age=2592000' },
          });
          uploaded++;
        }
      }

      // 写库: IpAsset + IpFile(FACE_CLOSEUP) + BlockchainProof (mock, 仿 seed-ips.ts)
      const now = new Date();
      const blockchainHash = crypto.randomBytes(32).toString('hex');
      const blockchainTxId = `mock-tx-cast-${id.toLowerCase()}-${crypto.randomBytes(4).toString('hex')}`;

      const ip = await prisma.ipAsset.create({
        data: {
          code,
          creatorId: adminId!,
          displayName: code,
          tagline: buildTagline(sc),
          description: buildDescription(sc),
          gender: mapGender(sc.gender),
          ageBucket: mapAgeBucket(sc.age_band),
          ethnicity: Ethnicity.EAST_ASIAN,
          styleTags: sc.era_label,
          scenarioTags: SCENARIO_TAGS,
          depositPriceFen: DEPOSIT_PRICE_FEN,
          fullLicensePriceFen: FULL_LICENSE_PRICE_FEN,
          status: IpStatus.PUBLIC_INTENT,
          publishedAt: now,
          blockchainHash,
          blockchainTxId,
          blockchainNetwork: MOCK_NETWORK,
          proofTimestamp: now,
          externalSource: EXTERNAL_SOURCE,
          externalRecordId: id,
          externalUpdatedAt: new Date(sc.generated_at),
          thumbnailKey: ossKey,
          previewImageKeys: [ossKey],
        },
      });

      const file = await prisma.ipFile.create({
        data: {
          ipId: ip.id,
          assetType: AssetType.FACE_CLOSEUP,
          originalName: `${id.toLowerCase()}.png`,
          ossKey,
          sizeBytes,
          mimeType: 'image/png',
          checksumSha256,
          validated: true,
          isAiGenerated: true,
          aiPrompt: `model=${sc.model} route=${sc.route} prompt_sha1=${sc.prompt_sha1}`,
        },
      });

      // FACE_CLOSEUP 是版权登记核心证据, 把唯一这张设为 faceCloseupFileId
      await prisma.ipAsset.update({
        where: { id: ip.id },
        data: { faceCloseupFileId: file.id },
      });

      await prisma.blockchainProof.create({
        data: {
          ipId: ip.id,
          payloadHash: blockchainHash,
          network: MOCK_NETWORK,
          txId: blockchainTxId,
          blockHeight: BigInt(Math.floor(now.getTime() / 1000)),
        },
      });

      created++;
      processed++;
      if (processed % 20 === 0) {
        console.log(`   ⏳ 已处理 ${processed}/${Math.min(limit, sidecars.length)} (新建 ${created})`);
      }
    } catch (e) {
      failures.push({ id, reason: (e as Error).message });
      processed++;
    }
  }

  // 5. 汇总
  console.log('');
  console.log(
    `${dryRun ? '🔍 DRY-RUN' : '✅ APPLY'} 汇总: ` +
      `${dryRun ? '将创建' : '新建'} ${created} / 已存在跳过 ${skippedExisting} / 清单跳过 ${skippedList} / QC 跳过 ${skippedQc} / 失败 ${failures.length}`,
  );
  if (!dryRun && oss) console.log(`   OSS 上传 ${uploaded} 个, 已存在跳过 ${uploadSkipped} 个`);
  if (failures.length > 0) {
    console.log('   失败明细:');
    for (const f of failures) console.log(`     ✗ ${f.id}: ${f.reason}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
