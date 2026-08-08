#!/usr/bin/env bash
# scripts/brief-auto-close.sh — W2 #31 过期 brief 自动 close
# 调用 POST /api/v1/admin/briefs/auto-close-expired (admin token)
# 用法:
#   bash scripts/brief-auto-close.sh           # 跑一次
#   bash scripts/brief-auto-close.sh install   # 装到 ECS crontab (每小时跑一次)
#
# 安全: 凭据从 /opt/ibiren/.env 读 (deploy.sh 已同步),不在命令行里写
# 调用方: crontab 每小时 (避开 :00 和 :30 峰值)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$SCRIPT_DIR/deploy.env" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/deploy.env"
fi
: "${ECS_IP:?需要 ECS_IP}"
: "${SSH_KEY_PATH:?需要 SSH_KEY_PATH}"
: "${ECS_PROJECT_DIR:?需要 ECS_PROJECT_DIR}"
: "${ADMIN_EMAIL:?需要 ADMIN_EMAIL (scripts/deploy.env)}"
: "${ADMIN_PASSWORD:?需要 ADMIN_PASSWORD (scripts/deploy.env)}"

API_BASE="${API_BASE:-https://ibi.ren/api/v1}"
PERM=$(stat -f%Lp "$SSH_KEY_PATH" 2>/dev/null || stat -c%a "$SSH_KEY_PATH")
[[ "$PERM" != "600" ]] && chmod 600 "$SSH_KEY_PATH"

SSH_BASE=(-i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10)
SSH_TARGET="root@${ECS_IP}"

# 在 ECS 上跑:登录拿 token → 调 auto-close-expired
# 完整命令走 ssh,把 admin 凭据和 API URL 通过 env 注入,避免在 ssh 命令行 quote 问题
install_cron() {
  echo "==== 装 auto-close 到 ECS crontab (每小时第 7 分) ===="
  ssh "${SSH_BASE[@]}" "$SSH_TARGET" bash -s <<'REMOTE'
set -e
# 检查是否已存在
EXISTING=$(crontab -l 2>/dev/null | grep -c 'brief-auto-close' || true)
if [[ "$EXISTING" -gt 0 ]]; then
  echo "  → crontab 已存在 brief-auto-close 条目 (count=$EXISTING),跳过"
  exit 0
fi
# 装:每小时第 7 分跑(避开 :00 和 :30)
(crontab -l 2>/dev/null; echo "7 * * * * /opt/ibiren/scripts/brief-auto-close.sh >> /var/log/ibiren/brief-auto-close.log 2>&1") | crontab -
echo "  ✅ crontab 已装"
crontab -l | grep brief-auto-close
REMOTE
}

run_once_remote() {
  echo "==== 跑一次 auto-close-expired ===="
  ssh "${SSH_BASE[@]}" "$SSH_TARGET" bash -s <<REMOTE
set -e
set -a
source $ECS_PROJECT_DIR/.env
set +a
TOKEN=\$(curl -s -X POST -H "Content-Type: application/json" \\
  -d '{"email":"$ADMIN_EMAIL","password":"$ADMIN_PASSWORD"}' \\
  ${API_BASE}/auth/login | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
echo "  admin_token_len=\${#TOKEN}"
RESULT=\$(curl -s -X POST -H "Authorization: Bearer \$TOKEN" ${API_BASE}/admin/briefs/auto-close-expired)
echo "  result=\$RESULT"
REMOTE
}

case "${1:-once}" in
  install) install_cron ;;
  once|'') run_once_remote ;;
  *)
    echo "usage: $0 {once|install}"
    exit 1
    ;;
esac