/**
 * ibi.ren · 飞书多维表格 → 形象库 (IpAsset) 导入工具
 *
 * 数据源: 「AI数字人形象库管理表」
 *   base_token: EKRjbHaE7a6p2Js6m2ocaZA6n7z
 *   table_id:   tbl0hJKrA9tBTC5s
 *
 * 用法:
 *   pnpm exec tsx scripts/import-feishu-bitable.ts              # 默认 dry-run, 只打印映射
 *   pnpm exec tsx scripts/import-feishu-bitable.ts --apply      # 实写 DB (upsert by externalRecordId)
 *   pnpm exec tsx scripts/import-feishu-bitable.ts --limit 5    # 只处理前 5 条 (调试)
 *
 * 幂等: 按 externalRecordId 唯一 upsert,重跑不会重复创建。
 * 创作者: 所有 IP 统一归属 albert_li@intfocus.com (用户指定)。
 *         User 不存在时自动创建 (CREATOR role, KYC APPROVED, 默认密码 FeishuImport_2026!)。
 *
 * 不做的事:
 *   - 不下载/上传飞书附件 (形象3D建模档案、证书)
 *     附件需另行处理: lark-cli docs +download 拉附件 → OSS 写入 → 补 thumbnailKey/previewImageKeys
 *   - 不更新已存在的 IP 的 blockchainHash 等核心字段
 *     只在创建时写入,更新时保留原值
 */
import { PrismaClient, Gender, AgeBucket, Ethnicity, IpStatus } from '@prisma/client';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ── 飞书源数据 (用户授权时已确认) ────────────────────────────────────────────────
const BASE_TOKEN = 'EKRjbHaE7a6p2Js6m2ocaZA6n7z';
const TABLE_ID = 'tbl0hJKrA9tBTC5s';
const SOURCE = 'FEISHU_BITABLE';

// ── 业务配置 ──────────────────────────────────────────────────────────────────
const DEFAULT_CREATOR_EMAIL = 'albert_li@intfocus.com';
const DEFAULT_CREATOR_NAME = 'Albert Li (飞书导入默认创作者)';
// 给占位创作者用的初始密码 — 仅用于首次 seed,生产环境应通过 admin 后台改密
const DEFAULT_PLACEHOLDER_PASSWORD = 'FeishuImport_2026!';
const APPLICANT_FALLBACK = '未指定';

// 飞书 select 字段 → Prisma enum 映射
const GENDER_MAP: Record<string, Gender> = {
  '男': Gender.MALE,
  '女': Gender.FEMALE,
  '无性别': Gender.NONBINARY,
};
const AGE_MAP: Record<string, AgeBucket> = {
  '青少年': AgeBucket.CHILD,
  '青年': AgeBucket.YOUNG,
  '中年': AgeBucket.MIDDLE,
  '老年': AgeBucket.ELDERLY,
};

// ── 类型 ──────────────────────────────────────────────────────────────────────
interface Attachment {
  file_token: string;
  name: string;
  size: number;
  type?: string;
  url?: string;
}

interface FeishuRecord {
  record_id: string;
  fields_by_id: Record<string, unknown>;
}

interface MappedIp {
  externalRecordId: string;
  displayName: string;
  tagline: string | null;
  description: string;
  gender: Gender;
  ageBucket: AgeBucket;
  ethnicity: Ethnicity;
  styleTags: string;
  scenarioTags: string;
  applicant: string;
  region: string | null;
  attachments: { fieldName: string; files: Attachment[] }[];
  warnings: string[];
}

// ── 飞书调用 ──────────────────────────────────────────────────────────────────
function lark(...args: string[]): any {
  const cmd = ['lark-cli', ...args, '--as', 'user', '--format', 'json'].join(' ');
  let out: string;
  try {
    out = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } catch (e: any) {
    throw new Error(`lark-cli 调用失败: ${cmd}\n${e.stdout || e.message}`);
  }
  const parsed = JSON.parse(out);
  if (!parsed.ok) {
    throw new Error(`lark-cli 返回错误: ${JSON.stringify(parsed.error)}`);
  }
  return parsed.data;
}

function fetchAllRecords(limit: number): FeishuRecord[] {
  const data = lark(
    'base', '+record-list',
    '--base-token', BASE_TOKEN,
    '--table-id', TABLE_ID,
    '--limit', String(limit),
  );
  return parseFeishuPayload(data);
}

function parseFeishuPayload(data: any): FeishuRecord[] {
  const recordIdList: string[] = data.record_id_list || [];
  const fieldIdList: string[] = data.field_id_list || [];
  const recordsList: unknown[][] = data.data || [];

  if (recordsList.length !== recordIdList.length) {
    throw new Error(`飞书返回不一致: record_id_list=${recordIdList.length}, data=${recordsList.length}`);
  }

  return recordsList.map((values, i) => {
    const fieldsById: Record<string, unknown> = {};
    fieldIdList.forEach((fid, idx) => {
      fieldsById[fid] = values[idx];
    });
    return { record_id: recordIdList[i], fields_by_id: fieldsById };
  });
}

function loadRecordsFromFile(filePath: string): FeishuRecord[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`--from-file 期望数组,实际是 ${typeof parsed}`);
  }
  return parsed as FeishuRecord[];
}

// ── 字段提取 ──────────────────────────────────────────────────────────────────
function pluckText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (Array.isArray(v)) {
    return v.map((x: any) => (typeof x === 'string' ? x : x?.text)).filter(Boolean).join('').trim() || null;
  }
  return String(v).trim() || null;
}

function pluckSelect(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const first = v[0] as any;
  if (typeof first === 'string') return first;
  return first?.text ?? null;
}

function pluckAttachments(v: unknown): Attachment[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x: any) => x && typeof x === 'object' && x.file_token) as Attachment[];
}

// ── 映射 ──────────────────────────────────────────────────────────────────────
function mapRecord(rec: FeishuRecord): MappedIp {
  const f = rec.fields_by_id;
  const warnings: string[] = [];

  const displayName = pluckText(f['fldmeY5cS3']);
  if (!displayName) warnings.push('IP名称为空 → 用 record_id 后 6 位');

  const tagline = pluckText(f['fldWN9iVhS']);
  const bioText = pluckText(f['fldC3qB1d5']);
  const description = bioText || `${displayName ?? rec.record_id} — 来自飞书形象库导入,人物小传待补`;

  const genderRaw = pluckSelect(f['fldBRzMLBl']);
  const gender = GENDER_MAP[genderRaw ?? ''] ?? Gender.FEMALE;
  if (genderRaw && !GENDER_MAP[genderRaw]) warnings.push(`性别未映射: "${genderRaw}" → FEMALE`);

  const ageRaw = pluckSelect(f['fldAO1tgxR']);
  const ageBucket = AGE_MAP[ageRaw ?? ''] ?? AgeBucket.YOUNG;
  if (ageRaw && !AGE_MAP[ageRaw]) warnings.push(`视觉年龄未映射: "${ageRaw}" → YOUNG`);

  const styleTags = pluckSelect(f['fldMyn5XcX']) ?? '';
  const scenarioTagsRaw = f['fldSogyv6P'];
  const scenarioTags = Array.isArray(scenarioTagsRaw)
    ? (scenarioTagsRaw as any[]).map((x: any) => x?.text ?? x).filter(Boolean).join(',')
    : '';

  const applicantRaw = pluckSelect(f['fldCsEyt5k']);
  const applicant = applicantRaw ?? APPLICANT_FALLBACK;
  if (!applicantRaw) warnings.push(`备案主体为空 → ${APPLICANT_FALLBACK}`);

  const region = pluckText(f['fldv8wP8mz']);

  const threeD = pluckAttachments(f['fldhIpBK8T']);
  const cert = pluckAttachments(f['fld9zm17Mm']);
  const attachments: { fieldName: string; files: Attachment[] }[] = [];
  if (threeD.length) attachments.push({ fieldName: '形象3D建模档案', files: threeD });
  if (cert.length) attachments.push({ fieldName: '证书', files: cert });
  if (threeD.length === 0) warnings.push('无形象3D建模档案附件 (thumbnailKey 需手动补)');

  return {
    externalRecordId: rec.record_id,
    displayName: displayName ?? `未命名-${rec.record_id.slice(-6)}`,
    tagline,
    description,
    gender,
    ageBucket,
    ethnicity: Ethnicity.EAST_ASIAN,
    styleTags,
    scenarioTags,
    applicant,
    region,
    attachments,
    warnings,
  };
}

// ── DB 写入 ───────────────────────────────────────────────────────────────────
async function ensureCreator(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: DEFAULT_CREATOR_EMAIL } });
  if (existing) {
    console.log(`   ✓ 创作者已存在: ${DEFAULT_CREATOR_EMAIL} → ${existing.id}`);
    return existing.id;
  }
  const passwordHash = await bcrypt.hash(DEFAULT_PLACEHOLDER_PASSWORD, 10);
  const created = await prisma.user.create({
    data: {
      email: DEFAULT_CREATOR_EMAIL,
      displayName: DEFAULT_CREATOR_NAME,
      passwordHash,
      kycStatus: 'APPROVED',
      roles: ['CREATOR', 'ADMIN'],
    },
  });
  console.log(`   ✓ 创建创作者: ${DEFAULT_CREATOR_EMAIL} → ${created.id} (占位密码: ${DEFAULT_PLACEHOLDER_PASSWORD})`);
  return created.id;
}

function makeCode(recordId: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const short = recordId.replace(/[^a-zA-Z0-9]/g, '').slice(-6);
  return `BFE-${ts}-${short}`;
}

async function applyOne(r: MappedIp, creatorId: string): Promise<'created' | 'updated' | 'failed'> {
  try {
    const code = makeCode(r.externalRecordId);
    const data = {
      creatorId,
      code,
      displayName: r.displayName,
      tagline: r.tagline,
      description: r.description,
      gender: r.gender,
      ageBucket: r.ageBucket,
      ethnicity: r.ethnicity,
      styleTags: r.styleTags,
      scenarioTags: r.scenarioTags,
      applicant: r.applicant,
      externalSource: SOURCE,
      externalRecordId: r.externalRecordId,
      externalUpdatedAt: new Date(),
      depositPriceFen: 19900,
      fullLicensePriceFen: 500000,
      status: IpStatus.PUBLIC_INTENT,
      publishedAt: new Date(),
      blockchainHash: crypto.randomBytes(32).toString('hex'),
      blockchainTxId: `mock-tx-bfe-${r.externalRecordId.slice(-8).toLowerCase()}-${crypto.randomBytes(3).toString('hex')}`,
      blockchainNetwork: 'mock-chain-001',
      proofTimestamp: new Date(),
      previewImageKeys: [],
      thumbnailKey: `ips/${code}/thumb_600.jpg`,
    };
    const existing = await prisma.ipAsset.findUnique({ where: { externalRecordId: r.externalRecordId } });
    if (existing) {
      await prisma.ipAsset.update({
        where: { externalRecordId: r.externalRecordId },
        data: {
          displayName: data.displayName,
          tagline: data.tagline,
          description: data.description,
          gender: data.gender,
          ageBucket: data.ageBucket,
          ethnicity: data.ethnicity,
          styleTags: data.styleTags,
          scenarioTags: data.scenarioTags,
          applicant: data.applicant,
          externalUpdatedAt: data.externalUpdatedAt,
        },
      });
      return 'updated';
    } else {
      await prisma.ipAsset.create({ data });
      return 'created';
    }
  } catch (e: any) {
    console.error(`   ✗ ${r.externalRecordId} 失败: ${e.message}`);
    return 'failed';
  }
}

// ── 打印 ──────────────────────────────────────────────────────────────────────
function printRow(r: MappedIp, idx: number) {
  const attSummary = r.attachments.length
    ? r.attachments.map(a => `${a.fieldName}×${a.files.length}`).join(',')
    : '(无)';
  console.log(`\n[${idx + 1}/${21}] ${r.externalRecordId} → ${r.displayName}`);
  console.log(`  gender=${r.gender}  ageBucket=${r.ageBucket}  ethnicity=${r.ethnicity}`);
  console.log(`  styleTags="${r.styleTags}"  scenarioTags="${r.scenarioTags}"`);
  console.log(`  applicant="${r.applicant}"  region="${r.region ?? ''}"`);
  console.log(`  tagline=${r.tagline ? `"${r.tagline.slice(0, 60)}${r.tagline.length > 60 ? '…' : ''}"` : '(空)'}`);
  console.log(`  attachments: ${attSummary}`);
  if (r.warnings.length) {
    console.log(`  ⚠️  ${r.warnings.join(' | ')}`);
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv;
  const apply = args.includes('--apply');
  const fromFileIdx = args.indexOf('--from-file');
  const fromFile = fromFileIdx > -1 ? args[fromFileIdx + 1] : null;
  const exportJsonIdx = args.indexOf('--export-json');
  const exportJsonPath = exportJsonIdx > -1 ? args[exportJsonIdx + 1] : null;
  const limitArg = args.indexOf('--limit');
  const limit = limitArg > -1 ? Number(args[limitArg + 1]) : 200;

  console.log(`\n🚀 飞书多维表格 → ibi.ren 形象库导入工具`);
  console.log(`   base:    ${BASE_TOKEN}`);
  console.log(`   table:   ${TABLE_ID}`);
  console.log(`   creator: ${DEFAULT_CREATOR_EMAIL} (缺则自动建)`);
  console.log(`   fallback: applicant→"${APPLICANT_FALLBACK}"`);
  if (fromFile) {
    console.log(`   source:   --from-file ${fromFile} (跳过 lark-cli,纯 DB 写入)`);
  } else {
    console.log(`   source:   飞书 lark-cli (本机调用)`);
  }
  console.log(`   模式:    ${apply ? '✍️  APPLY (实写 DB)' : '🔍 DRY RUN (只读不写)'}`);
  console.log(`   limit:   ${limit}\n`);

  // 拉数据 — 本机 lark-cli 或 file
  let raw: FeishuRecord[];
  if (fromFile) {
    raw = loadRecordsFromFile(fromFile);
    console.log(`📥 从 ${fromFile} 读取 ${raw.length} 条 records\n`);
  } else {
    console.log(`📥 从飞书拉取 records…`);
    raw = fetchAllRecords(limit);
    console.log(`   拿到 ${raw.length} 条\n`);

    // --export-json <path>: 落盘 JSON 后退出(给 ECS apply 用,不重复调飞书)
    if (exportJsonPath) {
      const absPath = path.resolve(exportJsonPath);
      fs.writeFileSync(absPath, JSON.stringify(raw, null, 2), 'utf8');
      console.log(`💾 已导出 ${raw.length} 条 records 到 ${absPath}`);
      console.log(`   下一步: scp 到 ECS, 然后 import-feishu-bitable.ts --apply --from-file ${absPath}\n`);
      return;
    }
  }

  const mapped = raw.map(mapRecord);

  // 统计
  const applicantSet = new Set(mapped.map(r => r.applicant));
  const warnCount = mapped.filter(r => r.warnings.length).length;
  const styleSet = new Set(mapped.map(r => r.styleTags).filter(Boolean));
  const scenarioSet = new Set(mapped.flatMap(r => r.scenarioTags ? r.scenarioTags.split(',') : []));

  for (let i = 0; i < mapped.length; i++) printRow(mapped[i], i);

  console.log('\n' + '━'.repeat(70));
  console.log(`📊 汇总:`);
  console.log(`   总记录:      ${mapped.length}`);
  console.log(`   有警告:      ${warnCount}`);
  console.log(`   applicant:   ${[...applicantSet].map(s => `"${s}"`).join(', ')}`);
  console.log(`   形象风格:    ${[...styleSet].map(s => `"${s}"`).join(', ')}`);
  console.log(`   应用场景:    ${[...scenarioSet].map(s => `"${s}"`).join(', ')}`);
  console.log('━'.repeat(70));

  if (!apply) {
    console.log(`\n💡 确认无误后用 --apply 实写:`);
    console.log(`   pnpm exec tsx scripts/import-feishu-bitable.ts --apply`);
    return;
  }

  console.log(`\n✍️  开始实写 DB…`);
  const creatorId = await ensureCreator();
  let created = 0, updated = 0, failed = 0;
  for (const r of mapped) {
    const status = await applyOne(r, creatorId);
    if (status === 'created') created++;
    else if (status === 'updated') updated++;
    else failed++;
  }
  console.log(`\n🎉 完成: 创建 ${created} / 更新 ${updated} / 失败 ${failed} / 总计 ${mapped.length}`);
}

main()
  .catch((e) => { console.error('\n❌ 异常:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());