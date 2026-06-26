#!/usr/bin/env bash
# scripts/smoke.sh — 三端冒烟测试
# 用法:
#   bash scripts/smoke.sh local          # 本地: 127.0.0.1 直打 8080/8081/3100
#   bash scripts/smoke.sh prod           # 生产: 走 nginx 域名 (https://ibi.idata.mobi + ibi-admin.idata.mobi)
#   bash scripts/smoke.sh ecs            # 兼容: = prod (旧"ecs"模式已废,8080/8081 不再暴露)
#   bash scripts/smoke.sh <url>          # 自定义 base URL
#
# 域名配置走 deploy.env:
#   PROD_WEB_DOMAIN=https://ibi.idata.mobi          (默认,前台)
#   PROD_ADMIN_DOMAIN=https://ibi-admin.idata.mobi  (默认,后台,独立子域)
#
# 检查项:
#   - web /              (主站 SPA, 应 200 + HTML)
#   - admin /            (后台 SPA, 应 200 + HTML)
#   - /health            (API 健康, 应含 "status":"ok")
#   - /api/v1/ips        (核心 endpoint, 应返回 items[])
#
# 退出码:
#   0 = 全部通过
#   非 0 = 至少一项失败 (脚本会逐项打印,失败的那项用 ❌)
#
# 历史:
#   2026-06-26  重写:生产用 nginx 域名,不再打 8080/8081/3100(Phase C 留下的坑)
#               ECS port 8080/8081 不暴露,API port 3100 是内部端口

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 加载 deploy.env(若存在,用于域名 + ECS IP)
if [[ -f "$SCRIPT_DIR/deploy.env" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/deploy.env"
fi

# 决定 base URL
TARGET="${1:-local}"
case "$TARGET" in
  local)
    BASE="http://127.0.0.1:8080"
    ADMIN_BASE="http://127.0.0.1:8081"
    API_BASE="http://127.0.0.1:3100"
    # 本地: 直打 API 端口(假设 nginx 没起)
    HEALTH_URL="$API_BASE/health"
    MODE_DESC="local(127.0.0.1:8080/8081/3100)"
    ;;
  prod|ecs)
    # 兼容老命令 `ecs`,新写 `prod`
    # 生产环境走 nginx 域名,端口 80/443
    WEB_DOMAIN="${PROD_WEB_DOMAIN:-https://ibi.idata.mobi}"
    ADMIN_DOMAIN="${PROD_ADMIN_DOMAIN:-https://ibi-admin.idata.mobi}"
    BASE="$WEB_DOMAIN"
    ADMIN_BASE="$ADMIN_DOMAIN"
    API_BASE="$WEB_DOMAIN"  # API 跟 web 同域(走 /api/ 反代)
    HEALTH_URL="$BASE/health"
    MODE_DESC="prod(${WEB_DOMAIN} + ${ADMIN_DOMAIN})"
    ;;
  http://*|https://*)
    BASE="$TARGET"
    ADMIN_BASE="$TARGET"
    API_BASE="$TARGET"
    HEALTH_URL="$BASE/health"
    MODE_DESC="custom($TARGET)"
    ;;
  *)
    echo "用法: $0 {local|prod|ecs|<url>}"
    exit 1
    ;;
esac

echo "==== smoke @ $MODE_DESC ===="
echo "    web:  $BASE/"
echo "    admin: $ADMIN_BASE/"
echo "    api:  $API_BASE/api/v1"
echo ""
FAILED=0

# 单项检查: <name> <url> <expected_code> [extra_regex]
check() {
  local name="$1"
  local url="$2"
  local expect_code="${3:-200}"
  local extra="${4:-}"

  local resp
  local code
  resp=$(curl -sS -k -m 8 -o /tmp/smoke-body -w "%{http_code}" "$url" 2>&1) || resp="000"
  code="$resp"

  local ok=0
  if [[ "$code" == "$expect_code" ]]; then
    if [[ -n "$extra" ]]; then
      if grep -qE "$extra" /tmp/smoke-body 2>/dev/null; then
        ok=1
      fi
    else
      ok=1
    fi
  fi

  if [[ "$ok" -eq 1 ]]; then
    printf "  ✅ %-32s %s\n" "$name" "$url → $code"
  else
    printf "  ❌ %-32s %s → %s (期望 %s)\n" "$name" "$url" "$code" "$expect_code"
    [[ -s /tmp/smoke-body ]] && head -c 200 /tmp/smoke-body
    echo ""
    FAILED=1
  fi
}

# 1. 主站 SPA 根 (200, HTML)
check "web-root"          "$BASE/"            200 "<!doctype|<html|<div id"

# 2. admin SPA 根 (200, HTML)
check "admin-root"        "$ADMIN_BASE/"      200 "<!doctype|<html|<div id"

# 3. API 健康 (200, 含 status: ok)
check "api-health"        "$HEALTH_URL"       200 "\"status\":\\s*\"ok\"|status.:.ok"

# 4. 核心 endpoint (200, items 数组存在即可,即便空)
check "api-ips-list"      "$API_BASE/api/v1/ips?size=1" 200 '"items"'

# 5. 检查 dist 时间戳 (仅 prod 模式,且 deploy.env 有 ECS_IP)
if [[ "$TARGET" == "prod" || "$TARGET" == "ecs" ]] && [[ -n "${ECS_IP:-}" ]] && [[ -n "${SSH_KEY_PATH:-}" ]]; then
  echo ""
  echo "==== ECS dist 时间戳 ===="
  # 注意:nginx root 是 /var/www/ibiren/{web,admin}/,不是 /opt/ibiren/apps/
  # api dist 在 /opt/ibiren/apps/api/dist/main.js
  ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    "root@${ECS_IP}" \
    "echo '  api:     ' \$(stat -c '%y' /opt/ibiren/apps/api/dist/main.js 2>/dev/null)
     echo '  web:     ' \$(stat -c '%y' /var/www/ibiren/web/index.html 2>/dev/null)
     echo '  admin:   ' \$(stat -c '%y' /var/www/ibiren/admin/index.html 2>/dev/null)" \
    || true
fi

echo ""
if [[ "$FAILED" -eq 0 ]]; then
  echo "✅ smoke 全过"
  exit 0
else
  echo "❌ smoke 有失败项,见上面 ❌ 行"
  exit 1
fi
