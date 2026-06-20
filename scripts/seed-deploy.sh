#!/usr/bin/env bash
# scripts/seed-deploy.sh — 在 ECS 上跑种子/数据生成脚本
# 用法:
#   bash scripts/seed-deploy.sh users         # 创世用户 (admin + creators + buyers)
#   bash scripts/seed-deploy.sh ips           # 占位 IP (IBI-2026-0001..0100)
#   bash scripts/seed-deploy.sh all           # users + ips
#   bash scripts/seed-deploy.sh gen-images    # 生成占位图
#   bash scripts/seed-deploy.sh upload-thumbs # 缩略图上传 OSS
#   bash scripts/seed-deploy.sh honor         # 荣誉系统规则 (HonorRule/HonorLevel/HonorBadge)
#
# 替换 AGENTS.md §3.3 的 4 行手敲命令:
#   cd /opt/ibiren/apps/api
#   set -a && source /opt/ibiren/.env && set +a
#   pnpm exec tsx ../../scripts/seed-users.ts
#   pnpm exec tsx ../../scripts/seed-ips.ts

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$SCRIPT_DIR/deploy.env" ]]; then
  echo "❌ 缺少 scripts/deploy.env"
  exit 1
fi

# shellcheck disable=SC1091
source "$SCRIPT_DIR/deploy.env"

: "${ECS_IP:?需要 ECS_IP}"
: "${SSH_KEY_PATH:?需要 SSH_KEY_PATH}"
: "${ECS_PROJECT_DIR:?需要 ECS_PROJECT_DIR}"

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

CMD="${1:-all}"

# 在 ECS 上跑: cd apps/api → source .env → 跑命令
# 用 bash -c 包裹,确保 set -a 在子 shell 里生效
run_ecs_seed() {
  local remote_cmd="$1"
  echo "  → ssh $ECS_IP: cd apps/api && source .env && $remote_cmd"
  ssh "${SSH_BASE[@]}" "$SSH_TARGET" "bash -c 'cd $ECS_PROJECT_DIR/apps/api && set -a && source $ECS_PROJECT_DIR/.env && set +a && $remote_cmd'"
}

# 警告:已存在的数据会被怎么处理? 大多数 seed 是 idempotent (upsert),但 gen-images / upload-thumbs 会重新生成
warn_idempotent() {
  local label="$1"
  cat <<EOF

⚠️  $label
   - 会写入/更新生产数据库 (RDS MySQL)
   - 会写 OSS (生成图 + 缩略图上传)
   - 不可逆 — 跑前确认你确实想跑

EOF
  read -r -p "确认继续? (yes/no): " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "取消"
    exit 1
  fi
}

case "$CMD" in
  users)
    warn_idempotent "seed-users: 创世管理员 + 测试账号"
    run_ecs_seed "pnpm exec tsx ../../scripts/seed-users.ts"
    ;;
  ips)
    warn_idempotent "seed-ips: 100 个占位 IP (IBI-2026-0001..0100)"
    run_ecs_seed "pnpm exec tsx ../../scripts/seed-ips.ts"
    ;;
  all)
    warn_idempotent "seed-all: users + ips"
    run_ecs_seed "pnpm exec tsx ../../scripts/seed-all.ts"
    ;;
  gen-images)
    warn_idempotent "gen-images: 重新生成占位图"
    run_ecs_seed "pnpm run gen:images"
    ;;
  upload-thumbs)
    warn_idempotent "upload-thumbs: 缩略图上传 OSS"
    run_ecs_seed "pnpm run upload:thumbs"
    ;;
  honor)
    warn_idempotent "seed-honor: 荣誉系统规则 (HonorRule 23 + HonorLevel 24 + HonorBadge 35)"
    run_ecs_seed "pnpm exec tsx ../../scripts/seed-honor.ts"
    ;;
  status)
    # 不写,只查看当前 ECS 上的数据状态
    echo "==== ECS 数据库状态 ===="
    ssh "${SSH_BASE[@]}" "$SSH_TARGET" \
      "cd $ECS_PROJECT_DIR/apps/api && set -a && source $ECS_PROJECT_DIR/.env && set +a && \
       pnpm exec tsx -e \"
         import { PrismaClient } from '@prisma/client';
         const p = new PrismaClient();
         const u = await p.user.count();
         const i = await p.ipAsset.count();
         const o = await p.order.count();
         console.log(\\\"users: \\\" + u);
         console.log(\\\"ips:   \\\" + i);
         console.log(\\\"orders:\\\" + o);
         await p.\\\$disconnect();
       \" 2>&1 | tail -10"
    ;;
  *)
    echo "用法: $0 {users|ips|all|gen-images|upload-thumbs|honor|status}"
    exit 1
    ;;
esac

echo ""
echo "✅ $CMD 完成"
