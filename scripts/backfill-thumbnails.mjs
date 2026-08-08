// Backfill 缩略图 — 19 个 IP 有 faceCloseupFileId 但 thumbnailKey 空
// (上传时缩略图生成 silent fail, 早期代码 bug)
//
// 用法 (在 ECS /opt/ibiren/apps/api 下):
//   node ../../scripts/backfill-thumbnails.mjs
//
// 流程: 查 DB → 对每个 IP 拉 face closeup 原图 → sharp 600×600 → public bucket → 写库
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(__dirname, '..', 'apps', 'api', '.env'),
  resolve(__dirname, '.env'),                      // 当从 apps/api/ 调用时
  resolve(process.cwd(), '.env'),
];
const envPath = candidates.find(p => existsSync(p));
if (!envPath) {
  console.error('.env 未找到, 试过:\n' + candidates.join('\n'));
  process.exit(1);
}
console.log(`Using .env: ${envPath}`);
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);
process.chdir(resolve(envPath, '..'));
const { default: OSS } = await import('ali-oss');
const { default: sharp } = await import('sharp');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();
const privateClient = new OSS({
  region: env.OSS_REGION,
  accessKeyId: env.OSS_ACCESS_KEY_ID,
  accessKeySecret: env.OSS_ACCESS_KEY_SECRET,
  bucket: env.OSS_BUCKET_PRIVATE,
  secure: true,
});
const publicClient = new OSS({
  region: env.OSS_REGION,
  accessKeyId: env.OSS_ACCESS_KEY_ID,
  accessKeySecret: env.OSS_ACCESS_KEY_SECRET,
  bucket: env.OSS_BUCKET_PUBLIC,
  secure: true,
});

const targets = await prisma.ipAsset.findMany({
  where: {
    faceCloseupFileId: { not: null },
    thumbnailKey: '', // schema is non-nullable String; 早期 silent fail 写入空串
  },
  select: { id: true, code: true, faceCloseupFileId: true },
});

console.log(`Found ${targets.length} IPs with faceCloseupFileId but no thumbnailKey`);

let ok = 0, skip = 0, fail = 0;
const corrupted = [];
for (const ip of targets) {
  try {
    const file = await prisma.ipFile.findUnique({ where: { id: ip.faceCloseupFileId } });
    if (!file || file.assetType !== 'FACE_CLOSEUP') {
      console.log(`   ✗ ${ip.code}: face closeup file not found or wrong type`);
      fail++;
      continue;
    }
    // 拉原图
    const buf = await privateClient.get(file.ossKey);
    // 检测截断的 PNG (历史 silent chunking bug, 缺 IEND)
    // 早期 122880/112640 字节 = 320×384/320×352 RGB, 缺 PNG IEND 终止符
    const isPng = buf.content.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
    const hasIend = isPng && buf.content.includes(Buffer.from([0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]));
    const isTruncated = isPng && !hasIend;
    if (isTruncated) {
      console.log(`   ⚠ ${ip.code}: 源 PNG 缺 IEND (${buf.content.length} bytes) — 跳过,需创作者重传面部特写`);
      corrupted.push({ code: ip.code, ossSize: buf.content.length });
      fail++;
      continue;
    }
    // 缩略图
    const thumb = await sharp(buf.content)
      .resize(600, 600, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const key = `ips/${ip.code}/thumb_600.jpg`;
    await publicClient.put(key, thumb, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=2592000',
        'x-oss-object-acl': 'public-read',
      },
    });
    await prisma.ipAsset.update({
      where: { id: ip.id },
      data: { thumbnailKey: key },
    });
    console.log(`   ✓ ${ip.code} → ${key} (${thumb.length} bytes)`);
    ok++;
  } catch (e) {
    console.error(`   ✗ ${ip.code}: ${e?.message || e}`);
    fail++;
  }
}

console.log(`\n✅ ${ok} ok, ${skip} skip, ${fail} fail`);
if (corrupted.length) {
  console.log(`\n⚠️  ${corrupted.length} 个 IP 源图截断,需要创作者重传面部特写:`);
  for (const c of corrupted) console.log(`   - ${c.code} (OSS ${c.ossSize} / DB ${c.dbSize})`);
}
await prisma.$disconnect();
await prisma.$disconnect();
