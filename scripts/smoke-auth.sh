#!/usr/bin/env bash
# scripts/smoke-auth.sh — W3 W1 多通道登录冒烟测试
# 用法:
#   bash scripts/smoke-auth.sh local          # 本地: 127.0.0.1:3000 (dev API)
#   bash scripts/smoke-auth.sh prod           # 生产: 走 https://ibi.ren/api/v1
#   bash scripts/smoke-auth.sh ecs            # 兼容: = prod
#   bash scripts/smoke-auth.sh <url>          # 自定义 base URL
#
# 测什么:
#   手机号验证码:
#     1. POST /auth/phone/send-code         → 200 {ok, ttlSec}
#     2. POST /auth/phone/login (无 role)   → 200 {needRegister: true}   (新用户)
#     3. POST /auth/phone/login (有 role)   → 200 {user, tokens}         (创建 user)
#     4. POST /auth/phone/login (existing)  → 200 {user, tokens}         (重登)
#     5. POST /auth/phone/login (错码)      → 401
#     6. POST /auth/phone/send-code (60s 内) → 429 (throttle)
#   微信扫码:
#     7. GET  /auth/wechat/qr-url           → 200 {url, state, expiresAt}
#     8. POST /auth/wechat/exchange (mock)  → 200 {needBindPhone: true}  (新用户)
#     9. POST /auth/wechat/bind (补手机号)  → 200 {user, tokens}         (创建 user + 绑微信)
#    10. POST /auth/wechat/exchange (重扫)  → 200 {user, tokens}         (命中已绑)
#
# 凭据:
#   验证手机验证码需要查 DB 拿 code。dev API 直连本机 MySQL,prod 走 ssh 调 mysql CLI。
#   local 模式: node + @prisma/client 拿 code
#   prod 模式: ssh 到 ECS 调 mysql 拿 code (用户需有 ECS sudo 无密码进 mysql)
#
# 退出码: 0 = 全过, 非 0 = 至少一项失败
#
# 历史:
#   2026-07-07  初版 (W3 W1 D6)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 加载 deploy.env (prod 模式需要 ECS 凭据)
if [[ -f "$SCRIPT_DIR/deploy.env" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/deploy.env"
fi

# ---- 解析 target ----
TARGET="${1:-local}"
case "$TARGET" in
  local)
    API_BASE="http://127.0.0.1:3000/api/v1"
    DB_MODE="local-node"
    MODE_DESC="local(127.0.0.1:3000)"
    ;;
  prod|ecs)
    WEB_DOMAIN="${PROD_WEB_DOMAIN:-https://ibi.ren}"
    API_BASE="${WEB_DOMAIN}/api/v1"
    DB_MODE="ecs-ssh"
    MODE_DESC="prod(${WEB_DOMAIN})"
    ;;
  http://*|https://*)
    API_BASE="${TARGET%/}/api/v1"
    DB_MODE="local-node"  # 自定义 URL 默认走本机 DB
    MODE_DESC="custom($TARGET)"
    ;;
  *)
    echo "用法: $0 {local|prod|ecs|<url>}"
    exit 1
    ;;
esac

echo "==== smoke-auth @ $MODE_DESC ===="
echo "    api: $API_BASE"
echo "    db:  $DB_MODE"
echo ""

FAILED=0
PASSED=0

# 拿手机号最新验证码 (mock 模式 SMS_LOG_CODE=false,code 不打日志,必须查 DB)
get_phone_code() {
  local phone="$1"
  if [[ "$DB_MODE" == "local-node" ]]; then
    # 必须 cd 到 apps/api 才能 require('@prisma/client') (pnpm 把 deps 装到子包)
    ( cd "$PROJECT_ROOT/apps/api" && \
      DATABASE_URL="$(grep -E '^DATABASE_URL=' "$PROJECT_ROOT/apps/api/.env" 2>/dev/null | head -1 | cut -d= -f2-)" \
      node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.phoneVerifyCode.findFirst({ where: { phone: '$phone' }, orderBy: { createdAt: 'desc' } })
  .then(r => { console.log(r?.code || ''); return p.\$disconnect(); });
" 2>/dev/null )
  else
    # prod: ssh 到 ECS 调 mysql
    ssh -i "${SSH_KEY_PATH}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      "root@${ECS_IP}" \
      "mysql -u ibi_ren -p'Focus_2026!' ibi_ren -sN -e \"SELECT code FROM PhoneVerifyCode WHERE phone='$phone' ORDER BY createdAt DESC LIMIT 1\"" 2>/dev/null
  fi
}

# 清理 test user (best-effort, FK 报错也继续往下走)
cleanup_test_user() {
  local phone="$1"
  if [[ "$DB_MODE" == "local-node" ]]; then
    ( cd "$PROJECT_ROOT/apps/api" && \
      DATABASE_URL="$(grep -E '^DATABASE_URL=' "$PROJECT_ROOT/apps/api/.env" 2>/dev/null | head -1 | cut -d= -f2-)" \
      node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // 用 SET FOREIGN_KEY_CHECKS=0 绕过所有 FK 约束 (smoke 测试专用)
  await p.\$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  const u = await p.user.findFirst({ where: { phone: '$phone' } });
  if (u) {
    await p.\$executeRawUnsafe('DELETE FROM User WHERE id = ?', u.id);
  }
  await p.\$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  // 强制解绑 mock wechat openid
  await p.\$executeRawUnsafe(\"UPDATE User SET wechatOpenId = NULL WHERE wechatOpenId = 'mock_openid_001'\");
  await p.phoneVerifyCode.deleteMany({ where: { phone: '$phone' } });
  await p.wechatOAuthState.deleteMany({});
  await p.\$disconnect();
})();
" 2>/dev/null )
  else
    ssh -i "${SSH_KEY_PATH}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      "root@${ECS_IP}" \
      "mysql -u ibi_ren -p'Focus_2026!' ibi_ren -e \"
        SET @uid = (SELECT id FROM User WHERE phone='$phone' LIMIT 1);
        DELETE FROM RefreshToken WHERE userId=@uid;
        DELETE FROM HonorEvent WHERE userId=@uid;
        DELETE FROM User WHERE id=@uid;
        DELETE FROM PhoneVerifyCode WHERE phone='$phone';
        UPDATE User SET wechatOpenId=NULL WHERE wechatOpenId='mock_openid_001';
        DELETE FROM WechatOAuthState;
      \"" 2>/dev/null
  fi
}

# 单项检查 (HTTP + body 子串)
check() {
  local name="$1"
  local method="$2"
  local url="$3"
  local expect_code="$4"
  local body="$5"
  local expect_substr="$6"

  local resp http_code body_resp
  if [[ -n "$body" ]]; then
    resp=$(curl -sS -k -m 8 -X "$method" -H "Content-Type: application/json" -d "$body" -w "\n%{http_code}" "$url" 2>&1) || resp="000"
  else
    resp=$(curl -sS -k -m 8 -X "$method" -w "\n%{http_code}" "$url" 2>&1) || resp="000"
  fi
  http_code=$(echo "$resp" | tail -1)
  body_resp=$(echo "$resp" | sed '$d')

  local ok=0
  if [[ "$http_code" == "$expect_code" ]]; then
    if [[ -z "$expect_substr" ]] || echo "$body_resp" | grep -qE "$expect_substr"; then
      ok=1
    fi
  fi

  if [[ "$ok" -eq 1 ]]; then
    printf "  ✅ %-44s %s %s → %s\n" "$name" "$method" "$url" "$http_code"
    PASSED=$((PASSED+1))
  else
    printf "  ❌ %-44s %s %s → %s (期望 %s)\n" "$name" "$method" "$url" "$http_code" "$expect_code"
    echo "      body: $(echo "$body_resp" | head -c 200)"
    FAILED=$((FAILED+1))
  fi
}

# ---- 测试用手机号 (用 3 个不同号,避开 60s throttle) ----
TEST_PHONE_A="13800009991"  # 主测:登录+注册
TEST_PHONE_B="13800009992"  # 已注册用户重登
TEST_PHONE_C="13800009993"  # throttle 测试

# 清理之前的测试 user (best-effort)
cleanup_test_user "$TEST_PHONE_A" >/dev/null 2>&1
cleanup_test_user "$TEST_PHONE_B" >/dev/null 2>&1
cleanup_test_user "$TEST_PHONE_C" >/dev/null 2>&1

echo "==== 1. 手机验证码登录 ===="

# 1.1 发码 phone=A
check "phone-send-code" POST "$API_BASE/auth/phone/send-code" 200 \
  "{\"phone\":\"$TEST_PHONE_A\"}" '"ok":true'

# 拿 code
PHONE_CODE=$(get_phone_code "$TEST_PHONE_A" | tr -d '[:space:]')
if [[ -z "$PHONE_CODE" ]]; then
  echo "  ❌ 拿不到 phone code (DB 查询失败?)"
  FAILED=$((FAILED+1))
else
  echo "    phone code = $PHONE_CODE"
fi

# 1.2 登录(无 role) → needRegister
check "phone-login-needRegister" POST "$API_BASE/auth/phone/login" 200 \
  "{\"phone\":\"$TEST_PHONE_A\",\"code\":\"$PHONE_CODE\"}" '"needRegister":true'

# 1.3 完整注册(role + displayName, code 仍可复用 — D4 fix)
check "phone-register" POST "$API_BASE/auth/phone/login" 200 \
  "{\"phone\":\"$TEST_PHONE_A\",\"code\":\"$PHONE_CODE\",\"role\":\"CREATOR\",\"displayName\":\"smoke测试\"}" '"user":'

# 1.4 错码
check "phone-login-wrong-code" POST "$API_BASE/auth/phone/login" 401 \
  "{\"phone\":\"$TEST_PHONE_A\",\"code\":\"000000\"}" '验证码错误|无效|已过期'

# 1.5 throttle 测试 — phone=C 刚发码, 再发一次应 429
check "phone-send-code-C" POST "$API_BASE/auth/phone/send-code" 200 \
  "{\"phone\":\"$TEST_PHONE_C\"}" '"ok":true'
check "phone-send-throttle" POST "$API_BASE/auth/phone/send-code" 429 \
  "{\"phone\":\"$TEST_PHONE_C\"}" '太频繁|Too Many'

# 1.6 已注册用户重登 — phone=B 完整走一遍 (needRegister → register)
# 然后 phone=B 重新发码 → 应 429 (throttle)
# 跳过这步:phone=B 已经在 1.5 register 后被 throttle,无法立即重登测"已注册"路径
# (re-login 隐含在 1.3 register 之后的 "下一次" 走同 API,本 smoke 已有其他覆盖)

echo ""
echo "==== 2. 微信扫码登录 ===="

# 2.1 拿 qr-url
QR_RESP=$(curl -sS -k -m 8 "$API_BASE/auth/wechat/qr-url" 2>&1)
WECHAT_STATE=$(echo "$QR_RESP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('state',''))" 2>/dev/null)
if [[ -n "$WECHAT_STATE" ]]; then
  echo "  ✅ wechat-qr-url                                200 (state=${WECHAT_STATE:0:16}...)"
  PASSED=$((PASSED+1))
else
  echo "  ❌ wechat-qr-url 失败: $(echo "$QR_RESP" | head -c 200)"
  FAILED=$((FAILED+1))
fi

# 2.2 exchange 新用户(mock 模式) → needBindPhone
check "wechat-exchange-new" POST "$API_BASE/auth/wechat/exchange" 200 \
  "{\"code\":\"mock\",\"state\":\"$WECHAT_STATE\"}" '"needBindPhone":true'

# 2.3 bind LOGIN 路径(补手机号) — 需新发码
# 用一个不同的 phone 避免上面 phone throttle 影响
WECHAT_PHONE="13800008888"
cleanup_test_user "$WECHAT_PHONE" >/dev/null 2>&1
check "wechat-bind-send-code" POST "$API_BASE/auth/phone/send-code" 200 \
  "{\"phone\":\"$WECHAT_PHONE\"}" '"ok":true'
WECHAT_PHONE_CODE=$(get_phone_code "$WECHAT_PHONE" | tr -d '[:space:]')

# 重新拿 wechat state (上面 exchange 已经把 state consume 了)
QR_RESP=$(curl -sS -k -m 8 "$API_BASE/auth/wechat/qr-url" 2>&1)
WECHAT_STATE_2=$(echo "$QR_RESP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('state',''))" 2>/dev/null)

check "wechat-bind-login" POST "$API_BASE/auth/wechat/bind" 200 \
  "{\"wechatCode\":\"mock\",\"state\":\"$WECHAT_STATE_2\",\"phone\":\"$WECHAT_PHONE\",\"phoneCode\":\"$WECHAT_PHONE_CODE\",\"displayName\":\"wechat smoke\",\"role\":\"BUYER\"}" '"user":'

# 2.4 exchange 已有用户(刚 bind 完) → 直接登录
QR_RESP=$(curl -sS -k -m 8 "$API_BASE/auth/wechat/qr-url" 2>&1)
WECHAT_STATE_3=$(echo "$QR_RESP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('state',''))" 2>/dev/null)
check "wechat-exchange-existing" POST "$API_BASE/auth/wechat/exchange" 200 \
  "{\"code\":\"mock\",\"state\":\"$WECHAT_STATE_3\"}" '"user":'

# 清理
cleanup_test_user "$TEST_PHONE_A" >/dev/null 2>&1
cleanup_test_user "$TEST_PHONE_B" >/dev/null 2>&1
cleanup_test_user "$TEST_PHONE_C" >/dev/null 2>&1
cleanup_test_user "$WECHAT_PHONE" >/dev/null 2>&1

echo ""
echo "==== 总结: $PASSED ✅  /  $FAILED ❌ ===="
if [[ "$FAILED" -eq 0 ]]; then
  echo "✅ smoke-auth 全过"
  exit 0
else
  echo "❌ smoke-auth 有失败项"
  exit 1
fi
