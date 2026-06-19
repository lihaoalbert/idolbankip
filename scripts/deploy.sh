#!/usr/bin/env bash
# scripts/deploy.sh — 一键部署 ibi.ren 到阿里云 ECS
# 用法:
#   bash scripts/deploy.sh              # 默认部署 (build + sync + restart + smoke)
#   bash scripts/deploy.sh build        # 只 build, 不上传
#   bash scripts/deploy.sh sync         # 只 sync dist 到 ECS, 不 restart
#   bash scripts/deploy.sh restart      # 只 restart + smoke
#   bash scripts/deploy.sh smoke        # 只 smoke (不改动 ECS)
#   bash scripts/deploy.sh rollback     # 回滚到上一个 backup
#
# 凭据走 scripts/deploy.env (gitignored),首次使用:
#   cp scripts/deploy.env.example scripts/deploy.env
#   # 编辑 deploy.env 填 ECS_IP 和 SSH_KEY_PATH
#
# 参考:
#   - AGENTS.md §3.5 (部署命令)
#   - AGENTS.md §4.6 (环境变量)
#   - AGENTS.md §5.16 (三端 dist 必须都同步 — 最常见踩坑)
#   - CLAUDE.md §4 (部署 SOP)

set -euo pipefail

# ---- 1. 加载本机凭据 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$SCRIPT_DIR/deploy.env" ]]; then
  echo "❌ 缺少 scripts/deploy.env"
  echo "   首次使用请执行: cp scripts/deploy.env.example scripts/deploy.env"
  echo "   然后填入 ECS_IP 和 SSH_KEY_PATH"
  exit 1
fi

# shellcheck disable=SC1091
source "$SCRIPT_DIR/deploy.env"

# ---- 2. 校验 ----
: "${ECS_IP:?需要 ECS_IP}"
: "${SSH_KEY_PATH:?需要 SSH_KEY_PATH}"

if [[ ! -f "$SSH_KEY_PATH" ]]; then
  echo "❌ SSH_KEY_PATH 不存在: $SSH_KEY_PATH"
  exit 1
fi

# SSH key 权限必须是 600,否则 ssh 拒绝连接
PERM=$(stat -f%Lp "$SSH_KEY_PATH" 2>/dev/null || stat -c%a "$SSH_KEY_PATH")
if [[ "$PERM" != "600" ]]; then
  echo "⚠️  SSH_KEY_PATH 权限是 $PERM,建议 chmod 600"
  echo "   自动修复: chmod 600 \"$SSH_KEY_PATH\""
  chmod 600 "$SSH_KEY_PATH"
fi

SSH_BASE=(-i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10)
SSH_TARGET="root@${ECS_IP}"

# ---- 3. 子命令分发 ----
CMD="${1:-all}"

ssh_run() {
  ssh "${SSH_BASE[@]}" "$SSH_TARGET" "$@"
}

build_local() {
  echo "==== [1/4] 本地 build 三端 ===="
  cd "$PROJECT_ROOT"
  for app in $DEPLOY_TARGETS; do
    echo "  → build @ibi-ren/$app"
    pnpm --filter "@ibi-ren/$app" run build
  done
}

sync_to_ecs() {
  echo "==== [2/4] 同步 dist 到 ECS (tar 走 ssh, 避免 rsync 路径空格问题) ===="
  cd "$PROJECT_ROOT"
  for app in $DEPLOY_TARGETS; do
    echo "  → sync apps/$app/dist"
    (
      cd "apps/$app/dist"
      tar czf - .
    ) | ssh_run "(cd $ECS_PROJECT_DIR/apps/$app/dist && tar xzf -)"
  done

  # web/admin 静态文件额外同步到 nginx 目录 (AGENTS §3.5)
  if [[ -d "$PROJECT_ROOT/apps/web/dist" && "$ECS_WEB_DIR" != "" ]]; then
    echo "  → sync web → $ECS_WEB_DIR"
    ssh_run "mkdir -p $ECS_WEB_DIR && rm -rf $ECS_WEB_DIR/*"
    (cd "$PROJECT_ROOT/apps/web/dist" && tar czf - .) | ssh_run "(cd $ECS_WEB_DIR && tar xzf -)"
  fi
  if [[ -d "$PROJECT_ROOT/apps/admin/dist" && "$ECS_ADMIN_DIR" != "" ]]; then
    echo "  → sync admin → $ECS_ADMIN_DIR"
    ssh_run "mkdir -p $ECS_ADMIN_DIR && rm -rf $ECS_ADMIN_DIR/*"
    (cd "$PROJECT_ROOT/apps/admin/dist" && tar czf - .) | ssh_run "(cd $ECS_ADMIN_DIR && tar xzf -)"
  fi

  # .env 软链 (systemd WorkingDirectory 是 apps/api, §5.15)
  echo "  → 软链 .env 到 apps/api"
  ssh_run "cd $ECS_PROJECT_DIR/apps/api && ln -sf $ECS_PROJECT_DIR/.env .env"

  # 三端 dist 时间戳必须都是今天 (§5.16)
  echo "====  校验 dist 时间戳 ===="
  ssh_run "ls -la $ECS_PROJECT_DIR/apps/{api,web,admin}/dist/{main.js,index.html} 2>&1 | grep -E 'main.js|index.html'"
}

restart_ecs() {
  echo "==== [3/4] 重启 ECS 服务 ===="
  ssh_run "systemctl restart $ECS_API_SERVICE && nginx -s reload"
  sleep 2
}

smoke_ecs() {
  echo "==== [4/4] 三端 smoke ===="
  bash "$SCRIPT_DIR/smoke.sh" ecs
}

rollback_ecs() {
  echo "==== rollback: 恢复到上一个 backup ===="
  # 找最近一个 backup
  LATEST_BACKUP=$(ssh_run "ls -dt $ECS_PROJECT_DIR/../ibiren-backup-* 2>/dev/null | head -1" || echo "")
  if [[ -z "$LATEST_BACKUP" ]]; then
    echo "❌ 没找到 backup (期望 /opt/ibiren-backup-YYYY-MM-DD)"
    exit 1
  fi
  echo "  → 恢复自 $LATEST_BACKUP"
  ssh_run "cd / && tar xzf $LATEST_BACKUP -C /"
  ssh_run "systemctl restart $ECS_API_SERVICE && nginx -s reload"
  bash "$SCRIPT_DIR/smoke.sh" ecs
}

make_backup() {
  echo "==== 备份当前 ECS 三端 dist ===="
  local stamp
  stamp=$(date +%F)
  ssh_run "tar czf /opt/ibiren-backup-${stamp}.tar.gz \
    -C / $ECS_PROJECT_DIR/apps/api/dist \
    -C / $ECS_PROJECT_DIR/apps/web/dist \
    -C / $ECS_PROJECT_DIR/apps/admin/dist"
  echo "  → /opt/ibiren-backup-${stamp}.tar.gz"
}

case "$CMD" in
  build)
    build_local
    ;;
  sync)
    build_local
    sync_to_ecs
    ;;
  restart)
    restart_ecs
    smoke_ecs
    ;;
  smoke)
    smoke_ecs
    ;;
  rollback)
    rollback_ecs
    ;;
  backup)
    make_backup
    ;;
  all)
    build_local
    make_backup
    sync_to_ecs
    restart_ecs
    smoke_ecs
    echo ""
    echo "✅ 部署完成"
    ;;
  *)
    echo "用法: $0 {build|sync|restart|smoke|rollback|backup|all}"
    exit 1
    ;;
esac
