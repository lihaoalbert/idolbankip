// E2E: AI 端点 (#30.6)
// - 创作者上传面部特写 → POST /ai/recognize-face {fileId} → 8 字段非空 + 枚举值合法
// - 上传非 FACE_CLOSEUP 文件 → 400
// - 别人 fileId → 403
// - admin POST /ai/suggest-task {description} → title + spec 字段齐全
// - 空 description → 400
// - 非法角色访问 → 403

const API = process.env.API || 'http://127.0.0.1:3100/api/v1';
// 默认跑 ECS 公开端点 (port 8080 → nginx → 3100); 显式 API=http://127.0.0.1:3100/api/v1 跑本地
const ECS_API = 'http://8.133.241.103:8080/api/v1';
const ACTIVE_API = API === ECS_API || API.includes('8.133.241.103') ? ECS_API : API;

const ADMIN_EMAIL = 'admin@ibi.ren';
const ADMIN_PASSWORD = 'Focus_2026!';

async function call(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${ACTIVE_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function register(email, password, displayName) {
  const r = await call('POST', '/auth/register', { email, password, displayName, roles: ['BUYER'] });
  return { token: r.body.accessToken, userId: r.body.user?.id };
}
async function loginAs(email, password) {
  const r = await call('POST', '/auth/login', { email, password });
  if (!r.body.accessToken) throw new Error(`login ${email} failed: ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}
async function submitKyc(token) {
  // mock KYC 直接 APPROVED (用测试身份证号), 顺便自动开通 CREATOR 角色
  await call('POST', '/kyc/submit', {
    realName: '测试', idNumber: '110101199001011400', phone: '13500135000',
  }, { token });
}


// 真实 2048×2048 PNG (sharp 生成, 带有效 IEND chunk — MiniMax image decoder 才能解)
// MiniMax 图片上限 10MB, 所以不能用纯噪声 (PNG 压缩后仍 ~13MB)
// 策略: 用渐变 + 低熵 pattern, 压缩后 ~1MB
import { createRequire } from 'node:module';
const requireFromApi = createRequire(import.meta.url + '/../../apps/api/node_modules/');
const sharp = requireFromApi('sharp');
async function makeFile() {
  const width = 2048, height = 2048;
  const raw = Buffer.alloc(width * height * 3);
  // 渐变 + 弱噪声 (低熵, PNG 压缩效果好)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = Math.floor((x / width) * 200 + 30);          // R 渐变
      raw[i + 1] = Math.floor((y / height) * 180 + 50);      // G 渐变
      raw[i + 2] = 140 + Math.floor(Math.random() * 30);     // B 弱噪
    }
  }
  const buf = await sharp(raw, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return buf;
}

async function uploadFile(token, ipId, assetType, filename) {
  const fileBuf = await makeFile();
  const sizeBytes = fileBuf.length;
  const pol = await call('POST', '/upload/policy', {
    ipId, assetType, filename, size: sizeBytes,
  }, { token });
  if (pol.status !== 201 && pol.status !== 200) throw new Error(`policy failed: ${JSON.stringify(pol.body)}`);
  const fd = new FormData();
  fd.append('key', pol.body.key);
  fd.append('policy', pol.body.policy);
  fd.append('OSSAccessKeyId', pol.body.accessKeyId);
  fd.append('signature', pol.body.signature);
  fd.append('success_action_status', '200');
  fd.append('file', new Blob([fileBuf], { type: 'image/png' }), filename);
  const oss = await fetch(pol.body.host, { method: 'POST', body: fd });
  if (!oss.ok) throw new Error(`OSS upload failed: ${oss.status}`);
  const cb = await call('POST', '/upload/oss-callback', {
    x: pol.body.key, filename, size: sizeBytes,
    mimeType: 'image/png', originalName: filename, assetType,
  });
  if (cb.body.Status !== 'OK') throw new Error(`callback failed: ${cb.body.Message}`);
  return cb.body.fileId;
}

async function createIp(token, name) {
  const r = await call('POST', '/ips', {
    displayName: name, description: 'AI 测试 IP,初始描述,提交前会被 AI 覆盖', gender: 'FEMALE', ageBucket: 'YOUNG', ethnicity: 'EAST_ASIAN',
    styleTags: ['现代'], scenarioTags: ['短剧(单集)'], fullLicensePriceFen: 100000,
  }, { token });
  if (r.status !== 201 && r.status !== 200) throw new Error(`create IP failed: ${JSON.stringify(r.body)}`);
  return r.body.ip;
}

async function main() {
  console.log(`=== #30.6 AI 端点 E2E (API: ${ACTIVE_API}) ===\n`);

  // ===== 创作者侧: /ai/recognize-face =====
  const cEmail = `ai-creator-${Date.now()}@example.com`;
  const cReg = await register(cEmail, 'Test1234!', 'AICreator');
  await submitKyc(cReg.token);
  const cToken = await loginAs(cEmail, 'Test1234!');
  console.log(`[0] creator registered + KYC → ${cEmail}`);

  // 创建 IP
  const ip = await createIp(cToken, 'AI 识别测试');
  console.log(`[1] IP created: ${ip.code} (${ip.id})`);

  // 上传 1 张面部特写
  const faceFileId = await uploadFile(cToken, ip.id, 'FACE_CLOSEUP', 'face.png', 110);
  console.log(`[2] uploaded FACE_CLOSEUP: ${faceFileId}`);

  // 调 /ai/recognize-face
  console.log(`[3] POST /ai/recognize-face ...`);
  const recogRes = await call('POST', '/ai/recognize-face', { fileId: faceFileId }, { token: cToken });
  console.log(`    → status=${recogRes.status}, keys: ${Object.keys(recogRes.body?.fields || {}).join(',')}`);

  if (recogRes.status === 503) {
    console.log('    ⚠️  AI 服务未配置/不可用, 跳过字段校验 (本地无 MINIMAX_API_KEY 是预期)');
    console.log(`    message: ${recogRes.body?.message}`);
  } else if (recogRes.status === 200 || recogRes.status === 201) {
    const f = recogRes.body.fields;
    const checks = {
      'displayName': typeof f.displayName === 'string' && f.displayName.length > 0,
      'tagline': typeof f.tagline === 'string' && f.tagline.length >= 4,
      'description': typeof f.description === 'string' && f.description.length >= 30 && f.description.length <= 1500,
      'gender': ['FEMALE', 'MALE', 'NONBINARY'].includes(f.gender),
      'ageBucket': ['CHILD', 'YOUNG', 'MIDDLE', 'ELDERLY'].includes(f.ageBucket),
      'ethnicity': ['EAST_ASIAN', 'SOUTHEAST_ASIAN', 'SOUTH_ASIAN', 'AFRICAN', 'EUROPEAN', 'MIXED'].includes(f.ethnicity),
      'faceTags': Array.isArray(f.faceTags) && f.faceTags.length > 0,
      'styleTags': Array.isArray(f.styleTags) && f.styleTags.length > 0,
      'scenarioTags': Array.isArray(f.scenarioTags) && f.scenarioTags.length > 0,
    };
    console.log(`    field checks:`, checks);
    const fail = Object.entries(checks).filter(([_, ok]) => !ok);
    if (fail.length > 0) throw new Error(`字段缺失/非法: ${fail.map(([k]) => k).join(', ')}`);
    console.log(`    ✓ all 8 字段合法, enum 严格白名单`);

    // faceTags.value 严格白名单
    const FACE_TAG_VALUES = {
      FaceShape: ['OVAL', 'FACE_ROUND', 'SQUARE', 'LONG', 'HEART', 'DIAMOND'],
      SkinTone: ['PORCELAIN', 'FAIR', 'MEDIUM', 'OLIVE', 'TAN', 'DEEP'],
      HairStyle: ['LONG_STRAIGHT', 'LONG_CURLY', 'SHORT', 'BUZZCUT', 'BALD', 'PONYTAIL', 'TWINTAIL', 'BUN', 'BRAIDS'],
      HairColor: ['BLACK', 'BROWN', 'BLONDE', 'RED', 'GREY', 'WHITE', 'FANTASY'],
      EyeShape: ['ALMOND', 'PHOENIX', 'PEACH', 'WILLOW', 'EYE_ROUND', 'MONOLID', 'DOUBLE'],
      Vibe: ['COOL', 'WARM', 'HEROIC', 'SEDUCTIVE', 'QUIET', 'FIERCE', 'CUTE'],
    };
    for (const t of f.faceTags) {
      if (!FACE_TAG_VALUES[t.category] || !FACE_TAG_VALUES[t.category].includes(t.value)) {
        throw new Error(`faceTag 非法: ${JSON.stringify(t)}`);
      }
    }
    console.log(`    ✓ faceTags 全 6 类白名单内`);
  } else {
    throw new Error(`unexpected status: ${recogRes.status} ${JSON.stringify(recogRes.body)}`);
  }

  // 4) 上传非 FACE_CLOSEUP → 400
  const otherFileId = await uploadFile(cToken, ip.id, 'THREE_VIEW', 'three.png', 110);
  const wrongType = await call('POST', '/ai/recognize-face', { fileId: otherFileId }, { token: cToken });
  console.log(`[4] non-FACE_CLOSEUP: ${wrongType.status} ${wrongType.body?.message?.slice(0, 60)}`);
  if (wrongType.status !== 400) throw new Error(`expected 400, got ${wrongType.status}`);

  // 5) 别人 fileId → 403
  const c2Email = `ai-creator-2-${Date.now()}@example.com`;
  const c2Reg = await register(c2Email, 'Test1234!', 'AICreator2');
  await submitKyc(c2Reg.token);
  const c2Token = await loginAs(c2Email, 'Test1234!');
  const crossRes = await call('POST', '/ai/recognize-face', { fileId: faceFileId }, { token: c2Token });
  console.log(`[5] cross-user: ${crossRes.status}`);
  if (crossRes.status !== 403) throw new Error(`expected 403, got ${crossRes.status}`);

  // 6) 创作者调用 suggest-task → 403 (角色)
  const wrongRole = await call('POST', '/ai/suggest-task', { description: '5 个藏族男青年,现代都市风,短剧单集。' }, { token: cToken });
  console.log(`[6] creator → suggest-task: ${wrongRole.status}`);
  if (wrongRole.status !== 403) throw new Error(`expected 403, got ${wrongRole.status}`);

  // ===== admin 侧: /ai/suggest-task =====
  const adminToken = await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`[7] admin logged in`);

  // 8) admin /ai/suggest-task with valid description
  const suggestRes = await call('POST', '/ai/suggest-task', {
    description: '需要 5 个藏族男青年形象, 高原特征明显, 现代都市风, 适合短剧单集。版权归平台, 单 IP 报酬 ¥100, 提交截止 14 天。',
  }, { token: adminToken });
  console.log(`[8] suggest-task: status=${suggestRes.status}, keys: ${Object.keys(suggestRes.body?.fields || {}).join(',')}`);
  if (suggestRes.status === 503) {
    console.log(`    ⚠️  AI 服务未配置/不可用, 跳过字段校验`);
  } else if (suggestRes.status === 200 || suggestRes.status === 201) {
    const f = suggestRes.body.fields;
    if (typeof f.title !== 'string' || f.title.length < 3) throw new Error('title 缺失');
    if (!f.spec || typeof f.spec !== 'object') throw new Error('spec 缺失');
    if (typeof f.spec.count !== 'number' || f.spec.count < 1) throw new Error('spec.count 非法');
    if (Array.isArray(f.spec.styleTags) && f.spec.styleTags.length === 0) throw new Error('styleTags 空');
    if (Array.isArray(f.spec.scenarioTags) && f.spec.scenarioTags.length === 0) throw new Error('scenarioTags 空');
    console.log(`    ✓ title="${f.title}" spec.count=${f.spec.count} styleTags=${JSON.stringify(f.spec.styleTags)}`);
  } else {
    throw new Error(`unexpected status: ${suggestRes.status} ${JSON.stringify(suggestRes.body)}`);
  }

  // 9) 空 description → 400
  const emptyRes = await call('POST', '/ai/suggest-task', { description: '' }, { token: adminToken });
  console.log(`[9] empty description: ${emptyRes.status} ${emptyRes.body?.message?.slice(0, 40)}`);
  if (emptyRes.status !== 400) throw new Error(`expected 400, got ${emptyRes.status}`);

  // 10) 未登录 → 401
  const noAuth = await call('POST', '/ai/recognize-face', { fileId: faceFileId });
  console.log(`[10] no auth: ${noAuth.status}`);
  if (noAuth.status !== 401) throw new Error(`expected 401, got ${noAuth.status}`);

  console.log('\n✅ ALL PASSED');
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
