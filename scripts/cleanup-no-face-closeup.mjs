// 清理没有面部特写的 IP (全是测试数据, 用户确认可删)
//
// 流程: 列出来 → 删关联数据 (files, proofs, watermarks, orders, cert) → 删 IP
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = [
  resolve(__dirname, '..', 'apps', 'api', '.env'),
  resolve(process.cwd(), '.env'),
].find(p => existsSync(p));
if (!envPath) { console.error('.env not found'); process.exit(1); }
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }),
);
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

const ids = await p.ipAsset.findMany({
  where: { OR: [{ faceCloseupFileId: null }, { faceCloseupFileId: '' }] },
  select: { id: true, code: true },
});
console.log(`Found ${ids.length} IPs without face closeup — deleting...`);

let deleted = 0, errs = 0;
for (const ip of ids) {
  try {
    await p.$transaction(async (tx) => {
      // 关联清理 (按依赖顺序)
      await tx.order.deleteMany({ where: { ipId: ip.id } });
      await tx.blockchainProof.deleteMany({ where: { ipId: ip.id } });
      await tx.watermarkRecord.deleteMany({ where: { ipId: ip.id } });
      await tx.copyrightCertificate.deleteMany({ where: { ipId: ip.id } });
      await tx.ipFile.deleteMany({ where: { ipId: ip.id } });
      await tx.ipAsset.delete({ where: { id: ip.id } });
    });
    console.log(`   ✓ ${ip.code}`);
    deleted++;
  } catch (e) {
    console.error(`   ✗ ${ip.code}: ${e?.message || e}`);
    errs++;
  }
}

console.log(`\n✅ ${deleted} deleted, ${errs} errors`);
await p.$disconnect();
