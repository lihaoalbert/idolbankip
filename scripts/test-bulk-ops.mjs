// E2E: CreatorDashboard bulk operations (#23) — simplified
// - bulkSubmit empty/invalid → 边界
// - bulkSubmit PENDING_REVIEW + 不完整 → 失败回滚语义 (首个失败停, 已成功的状态已变)
// - admin reject IP → REJECTED → bulkArchive 成功

const API = process.env.API || 'http://127.0.0.1:3100/api/v1';

async function call(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function register(email, password, displayName) {
  const r = await call('POST', '/auth/register', { email, password, displayName, roles: ['BUYER'] });
  if (r.status !== 201 && r.status !== 200) throw new Error(`register failed ${r.status}: ${JSON.stringify(r.body)}`);
  return { token: r.body.accessToken, userId: r.body.user?.id };
}

async function loginAs(email, password) {
  const r = await call('POST', '/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`login failed: ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

async function adminLogin() {
  const r = await call('POST', '/auth/login', { email: 'admin@ibi.ren', password: 'Focus_2026!' });
  if (r.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

async function refreshToken(refreshToken) {
  const r = await call('POST', '/auth/refresh', { refreshToken });
  if (r.status !== 200) throw new Error(`refresh failed: ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

async function main() {
  console.log('=== #23 Bulk Operations E2E ===\n');

  const adminToken = await adminLogin();
  console.log('[0] admin login OK');

  // 1. Register creator
  const userEmail = `bulk-test-${Date.now()}@example.com`;
  const { token: initialToken, userId } = await register(userEmail, 'Test1234!', 'BulkTest');
  console.log(`[1] registered ${userEmail} (${userId})`);

  // 2. KYC APPROVED → auto-grants CREATOR. Then refresh token to get new roles.
  const kycRes = await call('POST', '/kyc/submit', {
    realName: '张三',
    idNumber: '110101199001011234',
    phone: '13800138000',
  }, initialToken);
  console.log(`[2] KYC submitted: ${kycRes.status}`);

  // Re-login to get fresh token with CREATOR role in claims
  const token = await loginAs(userEmail, 'Test1234!');
  console.log(`[2.5] re-login OK (CREATOR role now in claims)`);

  // 3. Create 2 IPs (empty - no files)
  const ips = [];
  for (let i = 0; i < 2; i++) {
    const r = await call('POST', '/ips', {
      displayName: `BulkTest IP ${i}-${Date.now()}`,
      tagline: 'test',
      description: 'A test IP for bulk operations testing.',
      gender: 'FEMALE',
      visualAgeBucket: 'YOUNG_ADULT',
      styleTags: ['realistic'],
      scenarioTags: ['portrait'],
      depositPriceFen: 19900,
      fullLicensePriceFen: 199900,
    }, token);
    if (r.status !== 201 && r.status !== 200) throw new Error(`IP create failed: ${JSON.stringify(r.body)}`);
    ips.push(r.body.ip);
  }
  console.log(`[3] created ${ips.length} IPs: ${ips.map(i => i.code).join(', ')}`);

  // 4. Empty array tests
  const emptySubmit = await call('POST', '/ips/bulk/submit', { ids: [] }, token);
  console.log(`[4a] bulkSubmit []: ${emptySubmit.status} submitted=${emptySubmit.body.submitted?.length}`);
  if (emptySubmit.body.submitted?.length !== 0) throw new Error('expected empty submitted');

  const emptyArchive = await call('POST', '/ips/bulk/archive', { ids: [] }, token);
  console.log(`[4b] bulkArchive []: ${emptyArchive.status} archived=${emptyArchive.body.archived?.length}`);
  if (emptyArchive.body.archived?.length !== 0) throw new Error('expected empty archived');

  // 5. Bulk submit on incomplete IPs — should fail at first one (no files)
  const failSubmit = await call('POST', '/ips/bulk/submit', { ids: [ips[0].id, ips[1].id] }, token);
  console.log(`[5] bulkSubmit [IP0, IP1] (incomplete): submitted=${failSubmit.body.submitted?.length} failed=${JSON.stringify(failSubmit.body.failed)}`);
  if (failSubmit.body.failed?.id !== ips[0].id) throw new Error(`expected fail at IP[0], got ${JSON.stringify(failSubmit.body.failed)}`);
  if (!failSubmit.body.failed?.reason.includes('不完整')) throw new Error(`expected '不完整' error, got: ${failSubmit.body.failed?.reason}`);

  // 6. Admin rejects IP[0] → REJECTED
  const rejectRes = await call('POST', `/admin/ips/${ips[0].id}/reject`, { reason: 'E2E test - bulk archive test' }, adminToken);
  if (rejectRes.status !== 200 && rejectRes.status !== 201) throw new Error(`admin reject failed: ${JSON.stringify(rejectRes.body)}`);
  console.log(`[6] IP[0] ${ips[0].code} rejected by admin`);

  // 7. Bulk archive [IP0] (REJECTED) and [IP1] (PENDING_REVIEW)
  // bulkArchive should succeed at IP0 (REJECTED → ARCHIVED) and fail at IP1 (no ARCHIVED transition from PENDING_REVIEW)
  const archiveRes = await call('POST', '/ips/bulk/archive', { ids: [ips[0].id, ips[1].id] }, token);
  console.log(`[7] bulkArchive [IP0, IP1]: archived=${archiveRes.body.archived?.length} failed=${JSON.stringify(archiveRes.body.failed)}`);
  if (archiveRes.body.archived?.length !== 1) throw new Error(`expected 1 archived, got ${archiveRes.body.archived?.length}`);
  if (archiveRes.body.failed?.id !== ips[1].id) throw new Error(`expected fail at IP[1], got ${JSON.stringify(archiveRes.body.failed)}`);

  // 8. Verify IP[0] is now ARCHIVED via mine list (public hides ARCHIVED)
  const mineRes = await call('GET', '/ips/mine/list', null, token);
  const ip0InMine = mineRes.body.items.find((i) => i.id === ips[0].id);
  console.log(`[8] IP[0] mine status: ${ip0InMine?.status}`);
  if (ip0InMine?.status !== 'ARCHIVED') throw new Error(`expected ARCHIVED, got ${ip0InMine?.status}`);

  // 9. Bulk archive another IP0 (already archived) — should fail
  const reArchive = await call('POST', '/ips/bulk/archive', { ids: [ips[0].id] }, token);
  console.log(`[9] re-archive IP[0]: failed=${JSON.stringify(reArchive.body.failed)}`);
  if (reArchive.body.failed?.id !== ips[0].id) throw new Error(`expected fail on re-archive`);

  // 10. Test ownership: other creator can't archive our IPs
  const otherEmail = `other-${Date.now()}@example.com`;
  const other = await register(otherEmail, 'Test1234!', 'Other');
  await call('POST', '/kyc/submit', {
    realName: '李四',
    idNumber: '110101199001011235',
    phone: '13900139000',
  }, other.token);
  const otherToken = await loginAs(otherEmail, 'Test1234!');
  const theftRes = await call('POST', '/ips/bulk/archive', { ids: [ips[1].id] }, otherToken);
  console.log(`[10] other-user archive IP[1]: failed=${JSON.stringify(theftRes.body.failed)}`);
  if (theftRes.body.failed?.id !== ips[1].id) throw new Error(`expected fail for non-owner`);
  if (!theftRes.body.failed?.reason.includes('无权')) throw new Error(`expected '无权' reason, got: ${theftRes.body.failed?.reason}`);

  console.log('\n✅ ALL PASSED');
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
