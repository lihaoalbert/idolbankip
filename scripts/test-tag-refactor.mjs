// E2E: #32 标签体系重设计
// - 创建 IP, 用新 enum 值 (FEMALE/YOUNG/EAST_ASIAN) + faceTags → 通过
// - 读出 IP, 验证 gender/ageBucket 是大写 enum, faceTags 是数组
// - filter: ?gender=FEMALE&ageBucket=YOUNG&ethnicity=EAST_ASIAN → 返回新 IP
// - filter 错误: ?gender=female → 400
// - update faceTags / ethnicity → 写入成功
// - migration 不破坏老数据: 老 IP 仍可读 (visualAgeBucket 已迁到 ageBucket)
// - /admin/library/coverage → 返回 72 格 heatmap + byGender/{count,filledCells,totalCells}

const API = process.env.API || 'http://127.0.0.1:3100/api/v1';

async function call(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API}${path}`, {
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
  if (r.status !== 201 && r.status !== 200) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
  return { token: r.body.accessToken, userId: r.body.user?.id };
}
async function loginAs(email, password) {
  const r = await call('POST', '/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`login failed: ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}
async function approveKyc(token) {
  await call('POST', '/kyc/submit', {
    realName: '测试', idNumber: '110101199001011400', phone: '13500135000',
  }, { token });
}

async function main() {
  console.log('=== #32 标签体系 E2E ===\n');

  // 0) Register + KYC + upgrade to creator
  const email = `tag-test-${Date.now()}@example.com`;
  const reg = await register(email, 'Test1234!', 'TagTest');
  await approveKyc(reg.token);
  const token = await loginAs(email, 'Test1234!');
  console.log(`[0] registered + KYC: ${email}`);

  // 1) Create IP — 用新 enum 值 + faceTags
  const created = await call('POST', '/ips', {
    displayName: '标签测试形象',
    description: '脸特征: 椭圆脸 / 圆眼 / 直发',
    gender: 'FEMALE',
    ageBucket: 'YOUNG',
    ethnicity: 'EAST_ASIAN',
    faceTags: [
      { category: 'FaceShape', value: 'OVAL' },
      { category: 'EyeShape', value: 'ROUND' },
      { category: 'HairStyle', value: 'STRAIGHT' },
    ],
    styleTags: ['现代'],
    scenarioTags: ['短剧'],
    fullLicensePriceFen: 100000,
  }, { token });
  if (created.status !== 201) throw new Error(`create IP failed: ${JSON.stringify(created.body)}`);
  const ipId = created.body.ip.id;
  console.log(`[1] IP created: ${created.body.ip.code}`);
  console.log(`    gender=${created.body.ip.gender}, ageBucket=${created.body.ip.ageBucket}, ethnicity=${created.body.ip.ethnicity}`);
  console.log(`    faceTags=${JSON.stringify(created.body.ip.faceTags)}`);
  if (created.body.ip.gender !== 'FEMALE') throw new Error(`expected gender=FEMALE`);
  if (created.body.ip.ageBucket !== 'YOUNG') throw new Error(`expected ageBucket=YOUNG`);
  if (created.body.ip.ethnicity !== 'EAST_ASIAN') throw new Error(`expected ethnicity=EAST_ASIAN`);
  if (!Array.isArray(created.body.ip.faceTags) || created.body.ip.faceTags.length !== 3) {
    throw new Error(`expected 3 faceTags`);
  }

  // 2) Read back via /ips/mine/list — 验证 enum + JSON 持久化
  const listMine = await call('GET', '/ips/mine/list', null, { token });
  const freshIp = listMine.body.items.find((x) => x.id === ipId);
  if (!freshIp) throw new Error('IP not in mine/list');
  if (freshIp.gender !== 'FEMALE' || freshIp.ageBucket !== 'YOUNG' || freshIp.ethnicity !== 'EAST_ASIAN') {
    throw new Error(`enum persistence failed: ${JSON.stringify({ gender: freshIp.gender, ageBucket: freshIp.ageBucket, ethnicity: freshIp.ethnicity })}`);
  }
  if (!freshIp.faceTags || freshIp.faceTags.length !== 3) {
    throw new Error(`faceTags persistence failed: ${JSON.stringify(freshIp.faceTags)}`);
  }
  console.log(`[2] read-back: gender/ageBucket/ethnicity + faceTags (3) ✓`);

  // 3) Filter — 正确 enum 值能找到 (用 /ips/mine/list, 因为新 IP 是 PENDING_REVIEW 不进 public)
  const filtered = await call('GET', '/ips/mine/list?gender=FEMALE&ageBucket=YOUNG&ethnicity=EAST_ASIAN', null, { token });
  const hit = filtered.body.items?.find((x) => x.id === ipId);
  if (!hit) throw new Error(`filter did not return IP: ${JSON.stringify(filtered.body.items?.map(x => x.code))}`);
  console.log(`[3] filter ?gender=FEMALE&ageBucket=YOUNG&ethnicity=EAST_ASIAN → hit ✓`);

  // 4) Filter — 错误枚举值 (lowercase) → 400
  const badFilter = await call('GET', '/ips?gender=female');
  console.log(`[4] filter ?gender=female (lowercase) → ${badFilter.status} ${badFilter.body.message?.slice(0, 60)}`);
  if (badFilter.status !== 400) throw new Error(`expected 400 for lowercase, got ${badFilter.status}`);

  // 5) Filter — 错误 ethnicity 值 → 400
  const badEth = await call('GET', '/ips?ethnicity=ASIAN_GHOST');
  console.log(`[5] filter ?ethnicity=ASIAN_GHOST → ${badEth.status} ${badEth.body.message?.slice(0, 60)}`);
  if (badEth.status !== 400) throw new Error(`expected 400 for invalid ethnicity, got ${badEth.status}`);

  // 6) Update faceTags — 增加 1 个 tag
  const updFace = await call('PATCH', `/ips/${ipId}`, {
    faceTags: [
      { category: 'FaceShape', value: 'OVAL' },
      { category: 'EyeShape', value: 'ROUND' },
      { category: 'HairStyle', value: 'STRAIGHT' },
      { category: 'LipShape', value: 'THIN' },
    ],
  }, { token });
  if (updFace.status !== 200) throw new Error(`update faceTags failed: ${JSON.stringify(updFace.body)}`);
  if (updFace.body.faceTags?.length !== 4) throw new Error(`expected 4 faceTags after update, got ${updFace.body.faceTags?.length}`);
  console.log(`[6] update faceTags: 3 → 4 ✓`);

  // 7) Update ethnicity
  const updEth = await call('PATCH', `/ips/${ipId}`, { ethnicity: 'SOUTHEAST_ASIAN' }, { token });
  if (updEth.status !== 200) throw new Error(`update ethnicity failed`);
  if (updEth.body.ethnicity !== 'SOUTHEAST_ASIAN') throw new Error(`ethnicity update persisted: ${updEth.body.ethnicity}`);
  console.log(`[7] update ethnicity: EAST_ASIAN → SOUTHEAST_ASIAN ✓`);

  // 8) 老数据 (已存在的 IP) 不被破坏 — 随便拉一页
  const allPublic = await call('GET', '/ips');
  console.log(`[8] GET /ips (无 filter) → ${allPublic.status} ${allPublic.body.items?.length} items`);
  if (allPublic.status !== 200) throw new Error(`list public IPs failed`);
  for (const ip of allPublic.body.items || []) {
    if (!['FEMALE', 'MALE', 'NONBINARY'].includes(ip.gender)) {
      throw new Error(`老 IP ${ip.code} gender 不是合法 enum: ${ip.gender}`);
    }
    if (!['CHILD', 'YOUNG', 'MIDDLE', 'ELDERLY'].includes(ip.ageBucket)) {
      throw new Error(`老 IP ${ip.code} ageBucket 不是合法 enum: ${ip.ageBucket} (migration 失败?)`);
    }
  }
  console.log(`    ✓ 所有 IP 的 gender/ageBucket 是合法 enum (migration 数据归一化 OK)`);

  // 9) Coverage endpoint (admin 角色)
  const adminToken = await loginAs('admin@ibi.ren', 'Focus_2026!');
  const cov = await call('GET', '/admin/library/coverage', null, { token: adminToken });
  if (cov.status !== 200) throw new Error(`coverage failed: ${cov.status} ${JSON.stringify(cov.body).slice(0, 200)}`);
  const c = cov.body;
  console.log(`[9] /admin/library/coverage:`);
  console.log(`    grid: ${c.grid.filledCells}/${c.grid.totalCells} = ${c.grid.coveragePct}%`);
  console.log(`    totalIps: ${c.totalIps}, missingEthnicity: ${c.missingEthnicityCount}`);
  console.log(`    heatmap length: ${c.heatmap.length} (应=72)`);
  console.log(`    byGender.FEMALE: ${JSON.stringify(c.byGender.FEMALE)}`);
  if (c.grid.totalCells !== 72) throw new Error(`expected 72 cells, got ${c.grid.totalCells}`);
  if (c.heatmap.length !== 72) throw new Error(`expected heatmap.length=72`);
  if (typeof c.byGender.FEMALE.count !== 'number') throw new Error(`byGender.FEMALE.count 应是 number`);
  if (typeof c.byGender.FEMALE.filledCells !== 'number') throw new Error(`byGender.FEMALE.filledCells 应是 number`);
  console.log(`    ✓ coverage shape 正确`);

  console.log('\n✅ ALL PASSED');
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });