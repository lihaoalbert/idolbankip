// 设置 OSS 桶 CORS — 允许 ibi.idata.mobi:8080 (HTTP 临时域名) 上传
//
// 现象: 浏览器从 http://ibi.idata.mobi:8080 PUT 到 OSS bucket 触发 preflight,
//       桶 CORS 没放行这个 origin,前端的 "OSS 网络错误" toast + 实际图传不到 OSS
//
// 跑法: 本地 `node scripts/setup-oss-cors.mjs`
//       ECS  `cd /opt/ibiren/apps/api && node setup-oss-cors.mjs`
//
// 重置: 同名脚本 idempotent, 重跑安全
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 在多个位置找 .env (script 既可能在 scripts/ 也可能在 apps/api/ 下被调用)
const candidates = [
  resolve(__dirname, '..', 'apps', 'api', '.env'),
  resolve(__dirname, '.env'),                     // apps/api/.env
];
const envPath = candidates.find(p => existsSync(p));
if (!envPath) {
  console.error('.env 没找到, 试过:\n' + candidates.join('\n'));
  process.exit(1);
}
console.log(`Reading .env from: ${envPath}`);
const envText = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  envText.split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    })
);

const ALLOWED_ORIGINS = [
  'http://ibi.idata.mobi:8080',   // 临时域名 (HTTP, 测试)
  'http://localhost:3000',         // web dev
  'http://localhost:5173',         // web vite dev
  'http://localhost:8080',         // 镜像端口
  'https://ibi.ren',
  'https://www.ibi.ren',
  'http://ibi.ren',
  'http://www.ibi.ren',
];

const buckets = [env.OSS_BUCKET_PRIVATE, env.OSS_BUCKET_PUBLIC, env.OSS_BUCKET_CONTRACTS]
  .filter(Boolean);
if (buckets.length === 0) {
  console.error('OSS_BUCKET_* 未配置 in apps/api/.env');
  process.exit(1);
}

const apiRoot = resolve(envPath, '..');
// ali-oss 的 main 是 ./lib/client.js, 包名直接 import 最稳 (Node 走 package.json exports)
process.chdir(apiRoot);
const { default: OSS } = await import('ali-oss');

const rules = [{
  allowedOrigin: ALLOWED_ORIGINS,
  allowedMethod: ['GET', 'POST', 'PUT', 'HEAD', 'DELETE'],
  allowedHeader: ['*'],
  exposeHeader: ['ETag', 'x-oss-request-id'],
  maxAgeSeconds: 3600,
}];

for (const bucket of buckets) {
  const client = new OSS({
    region: env.OSS_REGION,
    accessKeyId: env.OSS_ACCESS_KEY_ID,
    accessKeySecret: env.OSS_ACCESS_KEY_SECRET,
    bucket,
    secure: true,
  });

  console.log(`\n=== Setting CORS on bucket: ${bucket} ===`);
  try {
    await client.putBucketCORS(bucket, rules);
    console.log(`✓ ${bucket}: ${ALLOWED_ORIGINS.length} origins allowed`);
    const got = await client.getBucketCORS(bucket);
    console.log(`  verified: ${got.rules?.[0]?.allowedOrigin?.length || 0} origins, ${got.rules?.[0]?.allowedMethod?.length || 0} methods`);
  } catch (e) {
    console.error(`FAIL on ${bucket}:`, e.message || e);
    process.exit(1);
  }
}
console.log('\n✓ All buckets done.');