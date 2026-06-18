#!/usr/bin/env node
/**
 * ibi.ren 批量上传 CLI
 *
 * 读 manifest.json → POST /agent/ips/batch 创建 IP 记录 → 逐文件 OSS 直传
 * 通过 x-api-key 鉴权,无需账号密码 (适合 n8n / 自动化脚本)
 *
 * Usage:
 *   IBI_API_KEY=ibi_sk_xxx node scripts/bulk-upload.mjs ./manifest.json
 *   node scripts/bulk-upload.mjs ./manifest.json --api-key ibi_sk_xxx
 *   node scripts/bulk-upload.mjs ./manifest.json --api-key xxx --api-base https://ibi.ren
 *
 * manifest.json 格式:
 * {
 *   "ips": [
 *     {
 *       "displayName": "苏清禾",
 *       "tagline": "A 设定名",
 *       "description": "...",
 *       "gender": "FEMALE",
 *       "visualAgeBucket": "YOUNG_ADULT",
 *       "styleTags": ["realistic"],
 *       "scenarioTags": ["portrait"],
 *       "depositPriceFen": 19900,
 *       "fullLicensePriceFen": 199900,
 *       "files": [
 *         { "path": "./suqinghe/three.png",  "assetType": "THREE_VIEW" },
 *         { "path": "./suqinghe/expr.png",   "assetType": "EXPRESSION_GRID" },
 *         { "path": "./suqinghe/render.png", "assetType": "TRANSPARENT_RENDER" },
 *         { "path": "./suqinghe/bio.txt",    "assetType": "BIO_TXT" }
 *       ]
 *     }
 *   ]
 * }
 */
import { readFile, stat } from 'fs/promises';
import { resolve } from 'path';
import { createReadStream } from 'fs';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    }),
);

const API_BASE = flags['api-base'] || process.env.IBI_API_BASE || 'https://ibi.ren';
const API_KEY = flags['api-key'] || process.env.IBI_API_KEY;
const manifestPath = positional[0];

if (!manifestPath) {
  console.error('用法: node scripts/bulk-upload.mjs <manifest.json> --api-key ibi_sk_xxx');
  process.exit(1);
}
if (!API_KEY) {
  console.error('缺少 API key。设置 IBI_API_KEY 环境变量或传 --api-key');
  process.exit(1);
}

const ASSET_LIMITS = {
  THREE_VIEW:         { minBytes: 100_000,    maxBytes: 30_000_000,    ext: /\.(jpe?g|png|webp)$/i },
  EXPRESSION_GRID:    { minBytes: 100_000,    maxBytes: 30_000_000,    ext: /\.(jpe?g|png|webp)$/i },
  TRANSPARENT_RENDER: { minBytes: 100_000,    maxBytes: 30_000_000,    ext: /\.png$/i },
  LORA_FILE:          { minBytes: 1_000_000,  maxBytes: 300_000_000,   ext: /\.safetensors$/i },
  RECIPE_TXT:         { minBytes: 10,         maxBytes: 1_000_000,     ext: /\.(txt|md)$/i },
  BIO_TXT:            { minBytes: 10,         maxBytes: 1_000_000,     ext: /\.(txt|md)$/i },
  VOICE_REF:          { minBytes: 50_000,     maxBytes: 50_000_000,    ext: /\.(wav|mp3)$/i },
  PACKAGE_ZIP:        { minBytes: 1_000,      maxBytes: 1_000_000_000, ext: /\.zip$/i },
};

async function call(method, path, body) {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function uploadOneFile(filePath, ipId, assetType) {
  const limit = ASSET_LIMITS[assetType];
  if (!limit) throw new Error(`未知 assetType: ${assetType}`);
  const filename = filePath.split('/').pop();
  if (!limit.ext.test(filename)) {
    throw new Error(`文件扩展名不合法: ${filename} (需要 ${limit.ext})`);
  }
  const absPath = resolve(filePath);
  const s = await stat(absPath);
  if (s.size < limit.minBytes) {
    throw new Error(`文件过小: ${filename} (${s.size} < ${limit.minBytes} 字节)`);
  }
  if (s.size > limit.maxBytes) {
    throw new Error(`文件过大: ${filename} (${s.size} > ${limit.maxBytes} 字节)`);
  }

  // 1) Get policy
  const policy = await call('POST', '/agent/ips/upload-policy', {
    ipId,
    assetType,
    filename,
    size: s.size,
  });

  // 2) POST to OSS
  const form = new FormData();
  form.append('key', policy.key);
  form.append('policy', policy.policy);
  form.append('OSSAccessKeyId', policy.accessKeyId);
  form.append('signature', policy.signature);
  form.append('success_action_status', '200');
  form.append('file', createReadStream(absPath), filename);

  const ossRes = await fetch(policy.host, { method: 'POST', body: form });
  if (!ossRes.ok) {
    throw new Error(`OSS upload failed: HTTP ${ossRes.status}`);
  }

  // 3) Notify backend (callback is public, no auth)
  const cbRes = await fetch(`${API_BASE}/api/v1/upload/oss-callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: policy.key,
      size: s.size,
      mimeType: 'application/octet-stream',
      originalName: filename,
      assetType,
    }),
  });
  const cbJson = await cbRes.json();
  if (cbJson.Status !== 'OK') {
    throw new Error(`Callback 校验失败: ${cbJson.Message}`);
  }
  return cbJson.fileId;
}

async function main() {
  console.log(`📦 ibi.ren 批量上传 — API: ${API_BASE}`);
  console.log(`📄 读取 manifest: ${manifestPath}`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  const items = manifest.ips || [];
  console.log(`🎯 待创建: ${items.length} 个 IP\n`);

  // 1) 验证 whoami
  const whoami = await call('GET', '/agent/whoami');
  console.log(`🔑 已认证 user=${whoami.userId.slice(0, 8)}... scopes=${whoami.scopes.join(',')}\n`);

  // 2) 准备 batch payload (去掉 files 字段)
  const batchPayload = items.map(({ files, ...meta }) => meta);
  if (batchPayload.length > 100) {
    throw new Error('单次最多 100 个 IP');
  }
  const { created } = await call('POST', '/agent/ips/batch', { items: batchPayload });
  console.log(`✅ 已创建 ${created.length} 个 IP:`);
  for (const c of created) console.log(`   ${c.code}  ${c.id}`);

  // 3) 逐 IP 上传文件
  let totalFiles = 0;
  let okFiles = 0;
  for (let i = 0; i < items.length; i++) {
    const ip = items[i];
    const createdIp = created[i];
    if (!ip.files || ip.files.length === 0) continue;
    console.log(`\n📤 [${createdIp.code}] 上传 ${ip.files.length} 个文件...`);
    for (const f of ip.files) {
      totalFiles++;
      process.stdout.write(`   - ${f.assetType.padEnd(20)} ${f.path}  `);
      try {
        await uploadOneFile(f.path, createdIp.id, f.assetType);
        okFiles++;
        console.log('✓');
      } catch (e) {
        console.log('✗ ' + e.message);
      }
    }
  }

  console.log(`\n=== 完成 ===`);
  console.log(`IP 创建: ${created.length}/${items.length}`);
  console.log(`文件上传: ${okFiles}/${totalFiles}`);
  if (okFiles < totalFiles) {
    console.log(`\n⚠️  有 ${totalFiles - okFiles} 个文件失败。可修复后重跑 (同 batch 已建 IP,需用 ID 直接 upload-policy 上传)`);
    process.exit(1);
  }
  console.log(`\n🎉 全部成功!请到创作者中心检查后批量提交审核:`);
  console.log(`   ${API_BASE}/creator`);
}

main().catch((e) => {
  console.error('\n❌ 失败:', e.message);
  if (e.body) console.error('  服务端响应:', JSON.stringify(e.body));
  process.exit(1);
});
