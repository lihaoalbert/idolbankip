// E2E: Agent API (#24)
// - 创作者生成 API key
// - 用 API key 调 /agent/whoami
// - 用 API key 调 /agent/ips/batch 创建多个 IP
// - 用 API key 调 /agent/ips/upload-policy
// - 撤销 key 后调用 401
// - 无效 key 调用 401

const API = process.env.API || 'http://127.0.0.1:3100/api/v1';

async function call(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.apiKey) headers['x-api-key'] = opts.apiKey;
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

async function main() {
  console.log('=== #24 Agent API E2E ===\n');

  // 0) Register creator (BUYER + KYC → auto CREATOR)
  const email = `agent-test-${Date.now()}@example.com`;
  const reg = await register(email, 'Test1234!', 'AgentTest');
  await call('POST', '/kyc/submit', {
    realName: '张三',
    idNumber: '110101199001011234',
    phone: '13800138000',
  }, { token: reg.token });
  const token = await loginAs(email, 'Test1234!');
  console.log(`[0] registered ${email} + KYC APPROVED`);

  // 1) Generate API key
  const createKey = await call('POST', '/creator/api-keys', { label: 'e2e-test' }, { token });
  if (createKey.status !== 201 && createKey.status !== 200) throw new Error(`create key failed: ${JSON.stringify(createKey.body)}`);
  const apiKey = createKey.body.plainKey;
  const keyId = createKey.body.id;
  console.log(`[1] API key created: ${createKey.body.keyPrefix}... (id=${keyId})`);
  if (!apiKey.startsWith('ibi_sk_')) throw new Error(`expected ibi_sk_ prefix, got ${apiKey.slice(0, 8)}`);

  // 2) List keys (should have 1)
  const list = await call('GET', '/creator/api-keys', null, { token });
  console.log(`[2] list keys: ${list.body.length}`);
  if (list.body.length !== 1) throw new Error(`expected 1 key, got ${list.body.length}`);

  // 3) whoami with key
  const whoami = await call('GET', '/agent/whoami', null, { apiKey });
  console.log(`[3] whoami: ${JSON.stringify(whoami.body)}`);
  if (whoami.body.scopes.join(',') !== 'ips:create,ips:upload') {
    throw new Error(`unexpected scopes: ${whoami.body.scopes}`);
  }

  // 4) Batch create 3 IPs
  const batch = await call('POST', '/agent/ips/batch', {
    items: [
      { displayName: 'Agent IP 1', description: 'd1', gender: 'FEMALE', visualAgeBucket: 'YOUNG_ADULT', styleTags: ['r'], scenarioTags: ['p'], fullLicensePriceFen: 100000 },
      { displayName: 'Agent IP 2', description: 'd2', gender: 'MALE', visualAgeBucket: 'MIDDLE', styleTags: ['r'], scenarioTags: ['p'], fullLicensePriceFen: 200000 },
      { displayName: 'Agent IP 3', description: 'd3', gender: 'FEMALE', visualAgeBucket: 'CHILD', styleTags: ['r'], scenarioTags: ['p'], fullLicensePriceFen: 300000 },
    ],
  }, { apiKey });
  console.log(`[4] batch create: ${batch.body.created?.length} created`);
  if (batch.body.created?.length !== 3) throw new Error(`expected 3 created, got ${batch.body.created?.length}`);
  const createdIps = batch.body.created;
  if (!createdIps[0].code.startsWith('IBI-')) throw new Error(`expected IBI- code, got ${createdIps[0].code}`);

  // 5) Upload policy for first IP (just get policy, no actual OSS upload in test)
  const policy = await call('POST', '/agent/ips/upload-policy', {
    ipId: createdIps[0].id,
    assetType: 'BIO_TXT',
    filename: 'bio.txt',
    size: 500,
  }, { apiKey });
  console.log(`[5] upload-policy: ${policy.status} (host=${policy.body.host?.slice(0, 40)}...)`);
  if (policy.status !== 201 && policy.status !== 200) throw new Error(`upload-policy failed: ${JSON.stringify(policy.body)}`);
  if (!policy.body.key) throw new Error('expected key in policy response');

  // 6) Upload policy for IP not owned by this user — use second key
  // Create another creator and try to access first creator's IP
  const email2 = `agent-test2-${Date.now()}@example.com`;
  const reg2 = await register(email2, 'Test1234!', 'OtherAgent');
  await call('POST', '/kyc/submit', {
    realName: '李四',
    idNumber: '110101199001011235',
    phone: '13900139000',
  }, { token: reg2.token });
  const token2 = await loginAs(email2, 'Test1234!');
  const key2Res = await call('POST', '/creator/api-keys', { label: 'e2e-other' }, { token: token2 });
  const theftPolicy = await call('POST', '/agent/ips/upload-policy', {
    ipId: createdIps[0].id,
    assetType: 'BIO_TXT',
    filename: 'bio.txt',
    size: 500,
  }, { apiKey: key2Res.body.plainKey });
  console.log(`[6] cross-user upload-policy: ${theftPolicy.status} ${theftPolicy.body.message}`);
  if (theftPolicy.status !== 403) throw new Error(`expected 403 for cross-user, got ${theftPolicy.status}`);

  // 7) Invalid key
  const invalid = await call('GET', '/agent/whoami', null, { apiKey: 'ibi_sk_invalid_xxx' });
  console.log(`[7] invalid key: ${invalid.status}`);
  if (invalid.status !== 401) throw new Error(`expected 401 for invalid key, got ${invalid.status}`);

  // 8) Revoke key, then whoami 401
  const revoke = await call('DELETE', `/creator/api-keys/${keyId}`, null, { token });
  console.log(`[8] revoke: ${revoke.status}`);
  if (revoke.status !== 200) throw new Error(`revoke failed: ${JSON.stringify(revoke.body)}`);

  const afterRevoke = await call('GET', '/agent/whoami', null, { apiKey });
  console.log(`[8.5] whoami after revoke: ${afterRevoke.status}`);
  if (afterRevoke.status !== 401) throw new Error(`expected 401 after revoke, got ${afterRevoke.status}`);

  console.log('\n✅ ALL PASSED');
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
