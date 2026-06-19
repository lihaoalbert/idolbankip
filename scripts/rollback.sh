#!/usr/bin/env bash
# scripts/rollback.sh — 一键回滚 ECS 到上一个 backup
# 用法:
#   bash scripts/rollback.sh                  # 用最近一个 /opt/ibiren-backup-*
#   bash scripts/rollback.sh <backup-path>    # 用指定的 backup
#   bash scripts/rollback.sh --list           # 列出所有可用 backup,不执行回滚
#
# 自动:
#   1. 找 backup (默认最新)
#   2. ssh 解压到 ECS (覆盖 dist)
#   3. restart ibiren-api + reload nginx
#   4. 跑 smoke 验证
#
# 参考: AGENTS.md §5.16 (三端 dist 同步) + §4.6 (改 .env 必 restart)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$SCRIPT_DIR/deploy.env" ]]; then
  echo "❌ 缺少 scripts/deploy.env"
  echo "   首次使用请执行: cp scripts/deploy.env.example scripts/deploy.env"
  exit 1
fi

# shellcheck disable=SC1091
source "$SCRIPT_DIR/deploy.env"

: "${ECS_IP:?需要 ECS_IP}"
: "${SSH_KEY_PATH:?需要 SSH_KEY_PATH}"
: "${ECS_PROJECT_DIR:?需要 ECS_PROJECT_DIR}"
: "${ECS_API_SERVICE:?需要 ECS_API_SERVICE}"

if [[ ! -f "$SSH_KEY_PATH" ]]; then
  echo "❌ SSH_KEY_PATH 不存在: $SSH_KEY_PATH"
  exit 1
fi

PERM=$(stat -f%Lp "$SSH_KEY_PATH" 2>/dev/null || stat -c%a "$SSH_KEY_PATH")
if [[ "$PERM" != "600" ]]; then
  chmod 600 "$SSH_KEY_PATH"
fi

SSH_BASE=(-i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10)
SSH_TARGET="root@${ECS_IP}"

# ---- 参数解析 ----
ACTION="${1:-}"
LIST_ONLY=0
BACKUP=""

if [[ "$ACTION" == "--list" ]]; then
  LIST_ONLY=1
elif [[ -n "$ACTION" ]]; then
  BACKUP="$ACTION"
fi

# ---- 列出 backup ----
list_backups() {
  echo "==== 可用 backup (ECS) ===="
  ssh "${SSH_BASE[@]}" "$SSH_TARGET" \
    "ls -lht /opt/ibiren-backup-*.tar.gz 2>/dev/null | head -20" \
    || echo "  (无 backup 文件)"
}

if [[ "$LIST_ONLY" -eq 1 ]]; then
  list_backups
  exit 0
fi

# ---- 找 backup ----
if [[ -z "$BACKUP" ]]; then
  BACKUP=$(ssh "${SSH_BASE[@]}" "$SSH_TARGET" \
    "ls -dt /opt/ibiren-backup-*.tar.gz 2>/dev/null | head -1" \
    || true)
fi

if [[ -z "$BACKUP" ]]; then
  echo "❌ 没找到 backup"
  echo "   期待路径: /opt/ibiren-backup-YYYY-MM-DD.tar.gz"
  echo "   deploy.sh deploy 时会自动生成"
  echo ""
  list_backups
  exit 1
fi

# ---- 确认 ----
echo "==== rollback 目标: $BACKUP ===="
echo "   ECS: $ECS_IP"
echo "   影响: $ECS_PROJECT_DIR/apps/{api,web,admin}/dist + $ECS_WEB_DIR + $ECS_ADMIN_DIR"
echo ""
read -r -p "确认回滚? (yes/no): " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "取消"
  exit 1
fi

# ---- 执行回滚 ----
echo "==== 解压 $BACKUP ===="
ssh "${SSH_BASE[@]}" "$SSH_TARGET" "cd / && tar xzf $BACKUP -C /"

echo "==== 重启服务 ===="
ssh "${SSH_BASE[@]}" "$SSH_TARGET" "systemctl restart $ECS_API_SERVICE && nginx -s reload"
sleep 2

# ---- smoke 验证 ----
echo "==== smoke 验证 ===="
bash "$SCRIPT_DIR/smoke.sh" ecs

echo ""
echo "✅ rollback 完成"
