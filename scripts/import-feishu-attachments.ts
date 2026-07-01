/**
 * ibi.ren · 飞书多维表格附件 → 平台批量导入 (走现成 API, 不写 ad-hoc 后端脚本)
 *
 * 数据源: 飞书"形象3D建模档案" (file_token)
 * 落点:   现有 21 个 BFE-* IP (import-feishu-bitable.ts 已导入) 的 FACE_CLOSEUP 资产
 *
 * 调用链 (本机跑, ECS 零脚本):
 *   1. lark-cli 拉飞书 records (本机 user_token)
 *   2. 拉所有 BFE-* IP → 飞书 record_id (用 lark +record-get 拿"形象名称") 跟 IP.displayName 匹配
 *   3. POST /api/v1/agent/ips/upload-policy 拿 OSS PostObject policy
 *   4. multipart POST 到 OSS (拿 ETag)
 *   5. POST /api/v1/upload/oss-callback 触发后端写 IpFile + 设 faceCloseupFileId + 生成缩略图
 *   6. (可选) POST /api/v1/agent/ips/ai-fill 调 recognizeFace → 全覆盖写回 IP 元数据
 *
 * 用法:
 *   # 单跑上传
 *   ./apps/api/node_modules/.bin/tsx scripts/import-feishu-attachments.ts --mode=upload
 *   # 单跑 AI 填充 (需先有 faceCloseupFileId)
 *   ./apps/api/node_modules/.bin/tsx scripts/import-feishu-attachments.ts --mode=ai-fill
 *   # 上传 + AI 填充
 *   ./apps/api/node_modules/.bin/tsx scripts/import-feishu-attachments.ts --mode=both
 *
 * 凭据:
 *   - ~/.config/ibiren/albert.key — albert_li 的 API key (chmod 600, 不入 git)
 *   - 重新生成: ECS 上跑 /opt/ibiren/scripts/snapshots/rotate-albert-api-key.ts
 *
 * 设计依据 (用户偏好):
 *   - 不写 ad-hoc 后端脚本, 用现成 /agent/ips/upload-policy + /upload/oss-callback
 *   - AI 写回走 /agent/ips/ai-fill, 不重写 recognizeFace
 *   - 失败重试 1 次; 跳过已有 faceCloseupFileId 的 IP
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import { URL } from 'url';
import sharp from 'sharp';

// ── 飞书源 (跟 import-feishu-bitable.ts 一致) ────────────────────────────────
const BASE_TOKEN = 'EKRjbHaE7a6p2Js6m2ocaZA6n7z';
const TABLE_ID = 'tbl0hJKrA9tBTC5s';
const ATTACH_FIELD_ID = 'fldhIpBK8T'; // 形象3D建模档案

// ── API 配置 ────────────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE ?? 'https://ibi.idata.mobi/api/v1';
const API_KEY_FILE = process.env.API_KEY_FILE ?? path.join(os.homedir(), '.config/ibiren/albert.key');
const ASSET_TYPE = 'FACE_CLOSEUP';

function readApiKey(): string {
  if (!fs.existsSync(API_KEY_FILE)) {
    throw new Error(`API key 文件不存在: ${API_KEY_FILE}\n生成方法: ssh ECS 跑 rotate-albert-api-key.ts, scp 拿明文`);
  }
  return fs.readFileSync(API_KEY_FILE, 'utf8').trim();
}

// ── 飞书调用 ────────────────────────────────────────────────────────────────
const ORIGINAL_CWD = process.cwd();
function lark(cwd: string | null, ...args: string[]): any {
  const cmd = ['lark-cli', ...args, '--as', 'user', '--format', 'json'].join(' ');
  const opts: any = { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 };
  if (cwd) opts.cwd = cwd;
  const out = execSync(cmd, opts);
  const parsed = JSON.parse(out);
  if (!parsed.ok) throw new Error(`lark-cli 失败: ${JSON.stringify(parsed.error)}`);
  return parsed.data;
}

function fetchAllRecords(): any[] {
  const data = lark(
    null,
    'base', '+record-list',
    '--base-token', BASE_TOKEN,
    '--table-id', TABLE_ID,
    '--limit', '200',
  );
  const ids: string[] = data.record_id_list || [];
  const fields: string[] = data.field_id_list || [];
  const rows: unknown[][] = data.data || [];
  return rows.map((vals, i) => {
    const m: Record<string, unknown> = {};
    fields.forEach((fid, idx) => { m[fid] = vals[idx]; });
    return { record_id: ids[i], fields_by_id: m };
  });
}

function downloadToBuffer(recordId: string, fileToken: string, hintName: string): { buf: Buffer; suggestedName: string } {
  // bitable attachment 必须用 `base +record-download-attachment` (drive +download 会 HTTP 400)
  // --output 要求相对路径, 用独立子目录 + cwd
  const subdir = path.join(os.tmpdir(), `feishu-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(subdir, { recursive: true });
  const relName = hintName || `${fileToken}.bin`;
  try {
    lark(subdir, 'base', '+record-download-attachment',
      '--base-token', BASE_TOKEN,
      '--table-id', TABLE_ID,
      '--record-id', recordId,
      '--file-token', fileToken,
      '--output', relName,
      '--overwrite',
    );
    const buf = fs.readFileSync(path.join(subdir, relName));
    return { buf, suggestedName: relName };
  } finally {
    try { fs.rmSync(subdir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ── HTTP client ─────────────────────────────────────────────────────────────
function httpRequest(opts: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Buffer | string;
}): Promise<{ status: number; data: Buffer; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const u = new URL(opts.url);
    const req = https.request({
      method: opts.method,
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      headers: opts.headers,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        data: Buffer.concat(chunks),
        headers: res.headers,
      }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function httpJson<T = any>(method: string, url: string, headers: Record<string, string>, body?: object): Promise<{ status: number; data: T }> {
  const r = await httpRequest({
    method, url,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any = r.data.toString('utf8');
  try { data = JSON.parse(data); } catch { /* keep as text */ }
  return { status: r.status, data: data as T };
}

// ── 平台 API ────────────────────────────────────────────────────────────────
async function getWhoAmI(apiKey: string): Promise<{ userId: string; scopes: string[] }> {
  const r = await httpJson('GET', `${API_BASE}/agent/whoami`, { 'x-api-key': apiKey });
  if (r.status >= 400) throw new Error(`/agent/whoami 失败: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data as any;
}

interface BfeIp { id: string; code: string; displayName: string; faceCloseupFileId: string | null; externalRecordId: string | null; externalSource: string | null; }

async function listFeishuIps(apiKey: string): Promise<BfeIp[]> {
  // /agent/ips/mine 走 x-api-key, 返回 externalRecordId + externalSource
  const r = await httpJson<BfeIp[]>('GET', `${API_BASE}/agent/ips/mine?source=FEISHU_BITABLE`, { 'x-api-key': apiKey });
  if (r.status >= 400) throw new Error(`/agent/ips/mine 失败: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data ?? [];
}

interface UploadPolicy {
  host: string; dir: string; key: string; policy: string; signature: string; accessKeyId: string;
}
async function getUploadPolicy(apiKey: string, ipId: string, filename: string, size: number): Promise<UploadPolicy> {
  const r = await httpJson('POST', `${API_BASE}/agent/ips/upload-policy`, { 'x-api-key': apiKey },
    { ipId, assetType: ASSET_TYPE, filename, size });
  if (r.status >= 400) throw new Error(`upload-policy 失败: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data as UploadPolicy;
}

async function postOssCallback(body: { filename: string; size: number; etag: string; x: string }): Promise<{ ok: boolean; fileId?: string; error?: string }> {
  const r = await httpJson('POST', `${API_BASE}/upload/oss-callback`, {}, body);
  if (r.status >= 400) throw new Error(`oss-callback 失败: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data as any;
}

async function aiFill(apiKey: string, ipId: string): Promise<any> {
  const r = await httpJson('POST', `${API_BASE}/agent/ips/ai-fill`, { 'x-api-key': apiKey }, { ipId });
  if (r.status >= 400) throw new Error(`ai-fill 失败: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}

// ── OSS PostObject 直传 (multipart/form-data) ───────────────────────────────
function postObjectToOss(opts: {
  host: string; key: string; policy: string; signature: string; accessKeyId: string;
  file: Buffer; filename: string; contentType: string;
}): Promise<{ ok: boolean; status: number; etag: string; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(opts.host);
    const boundary = '----ibiFormBoundary' + Math.random().toString(36).slice(2);
    const parts: Buffer[] = [];

    const append = (name: string, value: string) => {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    };
    append('key', opts.key);
    append('policy', opts.policy);
    append('OSSAccessKeyId', opts.accessKeyId);
    append('signature', opts.signature);
    append('x-oss-content-type', opts.contentType);
    append('success_action_status', '200');

    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${opts.filename.replace(/"/g, '_')}"\r\nContent-Type: ${opts.contentType}\r\n\r\n`));
    parts.push(opts.file);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    const req = https.request({
      method: 'POST',
      hostname: u.hostname,
      port: 443,
      path: '/',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const etag = (res.headers.etag as string ?? '').replace(/"/g, '');
        resolve({ ok: res.statusCode === 200, status: res.statusCode ?? 0, etag, body: text });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function guessContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

// ── 上传流程 (一个附件完整链路) ─────────────────────────────────────────────
async function uploadOneAttachment(apiKey: string, ip: BfeIp, recId: string, file: { file_token: string; name: string; size: number }, log: (m: string) => void): Promise<{ ok: boolean; fileId?: string; error?: string }> {
  log(`   ↓ 下载飞书附件 ${file.name} (${file.size}B)`);
  let buf: Buffer; let name: string;
  try {
    ({ buf, suggestedName: name } = downloadToBuffer(recId, file.file_token, file.name));
  } catch (e: any) {
    return { ok: false, error: `下载失败: ${e.message}` };
  }
  if (buf.length !== file.size) {
    return { ok: false, error: `下载大小不匹配: 期望 ${file.size}, 实际 ${buf.length}` };
  }
  const safeName = name.replace(/[\\/\0]/g, '_').slice(-200);
  const contentType = guessContentType(name);

  log(`   ↓ 拿 policy`);
  let policy: UploadPolicy;
  try {
    policy = await getUploadPolicy(apiKey, ip.id, safeName, buf.length);
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  log(`   ↓ OSS 上传 (${(buf.length / 1024).toFixed(0)}KB)`);
  let oss: { ok: boolean; etag: string; status: number; body: string };
  try {
    oss = await postObjectToOss({ ...policy, file: buf, filename: safeName, contentType });
  } catch (e: any) {
    return { ok: false, error: `OSS 请求异常: ${e.message}` };
  }
  if (!oss.ok) {
    return { ok: false, error: `OSS ${oss.status}: ${oss.body.slice(0, 200)}` };
  }
  if (!oss.etag) {
    return { ok: false, error: `OSS 响应无 ETag` };
  }

  log(`   ↓ trigger callback (key=${policy.key})`);
  let cb: { ok: boolean; fileId?: string; error?: string; Status?: string; Message?: string };
  try {
    cb = await postOssCallback({ filename: safeName, size: buf.length, etag: oss.etag, x: policy.key });
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  if (!cb.ok || !cb.fileId) {
    return { ok: false, error: `callback FAIL: ${cb.Message || cb.error || JSON.stringify(cb)}` };
  }
  return { ok: true, fileId: cb.fileId };
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv;
  const modeIdx = args.indexOf('--mode');
  const mode = modeIdx > -1 ? args[modeIdx + 1] : 'both';
  if (!['upload', 'ai-fill', 'both'].includes(mode)) {
    throw new Error(`--mode 必须是 upload / ai-fill / both, 当前: ${mode}`);
  }
  const apiKey = readApiKey();
  const who = await getWhoAmI(apiKey);
  console.log(`\n🔑 API key OK: userId=${who.userId} scopes=${who.scopes.join(',')}\n`);

  // 1. 拉 BFE-* IP 列表 (含 externalRecordId)
  console.log(`📦 拉 BFE-* IP 列表...`);
  const ips = await listFeishuIps(apiKey);
  console.log(`   找到 ${ips.length} 个 BFE-* IP\n`);
  if (ips.length === 0) {
    console.error('❌ 没找到 BFE-* IP, 退出');
    process.exit(1);
  }

  // 2. 拉飞书 records
  const records = fetchAllRecords();
  console.log(`📥 飞书 records: ${records.length}\n`);

  // 3. 按 record_id 直接匹配 (import-feishu-bitable.ts 用 record_id 末 6 字符做 BFE-code 后缀)
  console.log(`🔗 匹配中 (按 record_id 末 6 字符 = BFE-code 末段):`);
  const byCodeSuffix = new Map<string, BfeIp>();
  for (const ip of ips) {
    if (!ip.externalRecordId) continue;
    const suffix = ip.externalRecordId.slice(-6);
    byCodeSuffix.set(suffix, ip);
  }
  const matched: Array<{ rec: any; ip: BfeIp; file: any }> = [];
  const unmatched: any[] = [];
  for (const rec of records) {
    const att = (rec.fields_by_id[ATTACH_FIELD_ID] ?? []) as Array<{ file_token: string; name: string; size: number }>;
    if (att.length === 0) continue;
    const suffix = rec.record_id.slice(-6);
    const ip = byCodeSuffix.get(suffix);
    if (!ip) {
      unmatched.push({ record_id: rec.record_id, suffix });
      continue;
    }
    matched.push({ rec, ip, file: att[0] });
  }
  console.log(`   匹配: ${matched.length} / 待匹配: ${records.length} / 未匹配: ${unmatched.length}`);
  if (unmatched.length > 0) {
    console.log(`   未匹配示例:`, unmatched.slice(0, 3));
  }
  console.log('');

  // 3.5 --only=BFE-xxx 过滤 (补跑单个 IP 用)
  const onlyIdx = args.indexOf('--only');
  const onlyCodes = onlyIdx > -1 ? args[onlyIdx + 1].split(',').map(s => s.trim()).filter(Boolean) : null;
  if (onlyCodes) {
    const before = matched.length;
    const filtered = matched.filter(m => onlyCodes.includes(m.ip.code));
    console.log(`🎯 --only 过滤: ${before} → ${filtered.length} (${onlyCodes.join(',')})`);
    if (filtered.length === 0) {
      console.error('❌ --only 过滤后没剩任何 IP, 退出');
      process.exit(1);
    }
    // 替换 matched 数组 (用 Array.prototype.splice 保持类型)
    matched.splice(0, matched.length, ...filtered);
  }

  // 4. Upload 阶段
  if (mode === 'upload' || mode === 'both') {
    console.log(`📤 Upload 阶段 (跳过已有 faceCloseupFileId 的):`);
    let up = 0; let skip = 0; let fail = 0;
    for (let i = 0; i < matched.length; i++) {
      const { rec, ip, file } = matched[i];
      const tag = `[${i + 1}/${matched.length}] ${ip.code} (${ip.displayName})`;
      if (ip.faceCloseupFileId) {
        console.log(`${tag} ↩ 已有 faceCloseupFileId, 跳过`);
        skip++;
        continue;
      }
      console.log(`${tag} 开始`);
      const r = await uploadOneAttachment(apiKey, ip, rec.record_id, file, (m) => console.log(`${tag} ${m}`));
      if (r.ok) {
        console.log(`${tag} ✅ fileId=${r.fileId}`);
        up++;
      } else {
        console.error(`${tag} ❌ ${r.error}`);
        fail++;
      }
    }
    console.log(`\n📊 Upload: 上传 ${up} / 跳过 ${skip} / 失败 ${fail}\n`);
  }

  // 5. AI Fill 阶段 (re-pull IP list — faceCloseupFileId 变了)
  if (mode === 'ai-fill' || mode === 'both') {
    console.log(`🤖 AI Fill 阶段:`);
    let ok = 0; let skip = 0; let fail = 0;
    const ips2 = await listFeishuIps(apiKey);
    for (let i = 0; i < ips2.length; i++) {
      const ip = ips2[i];
      const tag = `[${i + 1}/${ips2.length}] ${ip.code} (${ip.displayName})`;
      if (!ip.faceCloseupFileId) {
        console.log(`${tag} ↩ 无 faceCloseupFileId, 跳过`);
        skip++;
        continue;
      }
      console.log(`${tag} ↓ recognizeFace → 全覆盖写回`);
      try {
        const r = await aiFill(apiKey, ip.id);
        const after = r.updated;
        console.log(`${tag} ✅ newName=${after.displayName} faceTags=${JSON.stringify(after.faceTags)}`);
        ok++;
      } catch (e: any) {
        console.error(`${tag} ❌ ${e.message}`);
        fail++;
      }
    }
    console.log(`\n📊 AI Fill: 成功 ${ok} / 跳过 ${skip} / 失败 ${fail}\n`);
  }

  console.log('✅ 完成');
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
