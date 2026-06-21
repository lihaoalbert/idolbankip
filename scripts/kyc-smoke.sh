#!/usr/bin/env bash
# scripts/kyc-smoke.sh — ECS 上跑真实 KYC 调用 (阿里云实人认证)
#
# 流程:
#   1. 注册一个 smoke 测试账号 (random email)
#   2. 登录拿 JWT
#   3. POST /kyc/submit 用真实姓名+身份证号 (用测试号,会被阿里云判 0/不一致 → REJECTED)
#   4. POST /kyc/enterprise/ocr 用真实签名 URL 测试 (期望 4xx 因图片找不到)
#
# 目的: 验证 AliyunKycClient 真的调到阿里云(不是 fallback REJECTED)
# 阿里云返回 verifyStatus=0 (不一致) 是预期的, 证明网络通、AK 有效、SDK 工作

set -euo pipefail

BASE="${KYC_SMOKE_BASE:-https://ibi.idata.mobi}"
RAND=$(date +%s%N | tail -c 7)
EMAIL="kyc-smoke-${RAND}@ibi.ren"
PASSWORD="SmokeTest2026!@#"

# 测试用真实姓名 + 测试身份证号(公开文档常用的 fake ID,不会通过核身但能验证 SDK 调用成功)
REAL_NAME="张三"
TEST_ID="110101199003078811"

echo "=== KYC smoke test ==="
echo "BASE: $BASE"
echo "Email: $EMAIL"
echo ""

# 1. 注册
echo "→ 注册账号 $EMAIL"
REG=$(curl -sS -m 10 -k -X POST "$BASE/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"kyc-smoke\",\"companyName\":\"smoke-test-co\",\"roles\":[\"BUYER\"]}")
echo "  $REG" | head -c 300; echo

# 2. 登录拿 JWT
echo ""
echo "→ 登录拿 JWT"
LOGIN=$(curl -sS -m 10 -k -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('accessToken') or d.get('access_token') or d.get('token') or json.dumps(d))" 2>/dev/null || echo "")
if [[ -z "$TOKEN" || "$TOKEN" == "{"* ]]; then
  echo "  ❌ 登录失败: $LOGIN"
  exit 1
fi
echo "  ✅ JWT 拿到 (${#TOKEN} 字符)"

# 3. 个人 KYC 提交
echo ""
echo "→ POST /api/v1/kyc/submit (姓名=$REAL_NAME, 身份证号=测试号)"
SUBMIT=$(curl -sS -m 15 -k -X POST "$BASE/api/v1/kyc/submit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"realName\":\"$REAL_NAME\",\"idNumber\":\"$TEST_ID\"}")
echo "  response: $SUBMIT" | head -c 500; echo

# 期望: status=REJECTED (因为测试 ID 跟姓名不一致,阿里云返回 verifyStatus=0)
# 这是 ALIYUN SDK 真的调成功的证据

# 4. KYC status
echo ""
echo "→ GET /api/v1/kyc/status"
STATUS=$(curl -sS -m 5 -k -X GET "$BASE/api/v1/kyc/status" \
  -H "Authorization: Bearer $TOKEN")
echo "  $STATUS" | head -c 400; echo

# 5. OCR (没传 licenseImageKey 期望 400)
echo ""
echo "→ POST /api/v1/kyc/enterprise/ocr (无 licenseImageKey)"
OCR=$(curl -sS -m 5 -k -X POST "$BASE/api/v1/kyc/enterprise/ocr" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' -w "\nHTTP_CODE=%{http_code}")
echo "  $OCR" | head -c 300; echo

echo ""
echo "✅ smoke 跑完"
echo "📝 看 ECS API 日志验证 AliyunKycClient 调用: tail -50 /tmp/api-test.log | grep VerifyMaterial"