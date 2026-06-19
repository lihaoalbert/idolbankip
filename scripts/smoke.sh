#!/usr/bin/env bash
# scripts/smoke.sh — 三端冒烟测试 (本地/ECS 通用)
# 用法:
#   bash scripts/smoke.sh local          # 本地: 127.0.0.1
#   bash scripts/smoke.sh ecs            # ECS: 走 deploy.env 里的 IP
#   bash scripts/smoke.sh http://x:y     # 自定义 URL base
#
# 检查项:
#   - web:8080 /    (主站 SPA, 应 200)
#   - admin:8081 /  (后台 SPA, 应 200)
#   - /health       (API 健康, 应含 "status":"ok")
#   - /api/v1/ips   (核心 endpoint, 应返回 items[])
#
# 退出码:
#   0 = 全部通过
#   非 0 = 至少一项失败 (脚本会逐项打印,失败的那项用 ❌)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 决定 base URL
TARGET="${1:-local}"
case "$TARGET" in
  local)
    BASE="http://127.0.0.1:8080"
    ADMIN_BASE="http://127.0.0.1:8081"
    API_BASE="http://127.0.0.1:3100"
    # 本地: 直接打 API 端口 (假设 nginx 没起)
    HEALTH_URL="$API_BASE/health"
    ;;
  ecs)
    if [[ -f "$SCRIPT_DIR/deploy.env" ]]; then
      # shellcheck disable=SC1091
      source "$SCRIPT_DIR/deploy.env"
    fi
    BASE="http://${ECS_IP}:${SMOKE_WEB_PORT:-8080}"
    ADMIN_BASE="http://${ECS_IP}:${SMOKE_ADMIN_PORT:-8081}"
    API_BASE="http://${ECS_IP}:${SMOKE_API_PORT:-3100}"
    # ECS: 走 nginx 公网路径 (8080/health) — ECS port 3100 内部端口,外部不可达
    HEALTH_URL="$BASE/health"
    ;;
  http://*|https://*)
    BASE="$TARGET"
    ADMIN_BASE="$TARGET"
    API_BASE="$TARGET"
    HEALTH_URL="$BASE/health"
    ;;
  *)
    echo "用法: $0 {local|ecs|<url>}"
    exit 1
    ;;
esac

echo "==== smoke @ $BASE / $ADMIN_BASE / $API_BASE ===="
FAILED=0

# 单项检查: <name> <url> <expected_code> [extra_regex]
check() {
  local name="$1"
  local url="$2"
  local expect_code="${3:-200}"
  local extra="${4:-}"

  local resp
  local code
  resp=$(curl -sS -m 8 -o /tmp/smoke-body -w "%{http_code}" "$url" 2>&1) || resp="000"
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
check "api-ips-list"      "$BASE/api/v1/ips?size=1" 200 '"items"'

# 5. 检查 dist 时间戳 (仅 ECS 模式)
if [[ "$TARGET" == "ecs" && -f "$SCRIPT_DIR/deploy.env" ]]; then
  source "$SCRIPT_DIR/deploy.env"
  echo ""
  echo "==== ECS dist 时间戳 ===="
  # 用 || true 容忍 brace expansion 部分文件不存在 (api/dist/main.js 有,web/admin/dist 没有 main.js)
  ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    "root@${ECS_IP}" \
    "stat -c '%y %n' $ECS_PROJECT_DIR/apps/{api,web,admin}/dist/main.js $ECS_PROJECT_DIR/apps/{api,web,admin}/dist/index.html 2>/dev/null" \
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
