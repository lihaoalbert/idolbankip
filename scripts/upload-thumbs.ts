/**
 * ibi.ren · 占位图批量上传到 OSS
 * 用法: pnpm upload:thumbs
 *
 * 依赖: ali-oss + .env 中 OSS_*
 * 把 seed-assets/{IBI-CODE}/thumb_600.jpg 上传到 public bucket
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import * as OSS from 'ali-oss';
import * as dotenv from 'dotenv';

dotenv.config();

const SEED_DIR = path.resolve(__dirname, '../seed-assets');

async function main() {
  const client = new OSS({
    region: process.env.OSS_REGION!,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
    bucket: process.env.OSS_BUCKET_PUBLIC!,
  });

  const entries = await fs.readdir(SEED_DIR);
  const codes = entries.filter((e) => e.startsWith('IBI-'));
  console.log(`📤 上传 ${codes.length} 个缩略图到 oss://${process.env.OSS_BUCKET_PUBLIC}…`);

  let ok = 0, fail = 0;
  for (const code of codes) {
    const local = path.join(SEED_DIR, code, 'thumb_600.jpg');
    try {
      await client.put(`ips/${code}/thumb_600.jpg`, local, {
        headers: { 'Cache-Control': 'public, max-age=2592000' },
      });
      ok++;
    } catch (e) {
      console.error(`   ✗ ${code}:`, (e as Error).message);
      fail++;
    }
    if (ok % 20 === 0) console.log(`   ⏳ ${ok}/${codes.length}`);
  }
  console.log(`\n✅ 完成: ${ok} 成功, ${fail} 失败`);
}

main().catch((e) => { console.error(e); process.exit(1); });
