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

preflight() {
  echo "==== preflight: 本地环境检查 ===="
  cd "$PROJECT_ROOT"

  # 1. git working tree
  if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
    echo "  ⚠️  working tree 不干净:"
    git status --short | sed 's/^/      /'
    if [[ -t 0 ]]; then
      read -r -p "  继续? (yes/no): " CONFIRM
      [[ "$CONFIRM" == "yes" ]] || { echo "取消"; exit 1; }
    else
      echo "  (非交互模式 — 自动继续)"
    fi
  else
    echo "  ✅ git working tree 干净"
  fi

  # 2. pnpm install --frozen-lockfile
  echo ""
  echo "  → pnpm install --frozen-lockfile"
  pnpm install --frozen-lockfile || { echo "❌ pnpm install 失败"; exit 1; }
  echo "  ✅ 依赖与 lockfile 一致"

  # ECS 缺新依赖时同步 lockfile(参见 §5.16):
  # 本机 package.json 加新包后必须 git commit pnpm-lock.yaml,ECS 上拉新代码后
  # 再 --frozen-lockfile 才能拉到新包。如果 ECS 报 MODULE_NOT_FOUND,先确认
  # 本机 lockfile 已 commit + 拉取。

  # 3. prisma generate (AGENTS §5.14 — 没跑 IsEnum 装饰器秒 crash)
  echo ""
  echo "  → pnpm prisma:generate"
  pnpm prisma:generate || { echo "❌ prisma generate 失败"; exit 1; }
  echo "  ✅ prisma client 生成"

  echo ""
  echo "✅ preflight 通过 (可跑 build / verify / sync)"
}

verify() {
  echo "==== verify: 本地 build 产物检查 ===="
  cd "$PROJECT_ROOT"

  # 1. 三端 dist 必须存在
  for app in $DEPLOY_TARGETS; do
    if [[ ! -d "apps/$app/dist" ]] || [[ -z "$(ls -A "apps/$app/dist" 2>/dev/null)" ]]; then
      echo "  ❌ apps/$app/dist 不存在或为空,先跑: bash scripts/deploy.sh build"
      exit 1
    fi
  done
  echo "  ✅ 三端 dist 都存在"

  # 2. web/admin dist 不含 localhost:3000 (AGENTS §5.10 vite || vs ?? 陷阱)
  for app in web admin; do
    # 用 || true 防 grep 无匹配时退出码 1 触发 set -e
    HIT=$(grep -roh "localhost:3000" "apps/$app/dist/assets/" 2>/dev/null | wc -l | tr -d ' ' || true)
    HIT=${HIT:-0}
    if [[ "$HIT" -gt 0 ]]; then
      echo "  ❌ apps/$app/dist 仍有 $HIT 处 'localhost:3000' 硬编码 (§5.10)"
      grep -rn "localhost:3000" "apps/$app/dist/assets/" 2>/dev/null | head -3
      exit 1
    else
      echo "  ✅ apps/$app/dist 无 localhost:3000 硬编码"
    fi
  done

  # 3. api main.js 启动 smoke (AGENTS §5.13 DI Symbol + §5.14 prisma generate)
  echo ""
  echo "  → api main.js 启动 smoke (timeout 6s)"
  TEMP_ENV=$(mktemp -t deploy-verify-env.XXXXXX)
  if [[ -f "apps/api/.env" ]]; then
    echo "    (使用 apps/api/.env)"
    cp "apps/api/.env" "$TEMP_ENV"
  else
    echo "    (apps/api/.env 不存在,用 dummy env 让 Nest 进到 DI 解析)"
    cat > "$TEMP_ENV" <<EOF
DATABASE_URL=mysql://localhost:13306/test
REDIS_URL=redis://localhost:16379
JWT_ACCESS_SECRET=$(openssl rand -base64 48 2>/dev/null || echo "placeholder_access_secret_at_least_32_chars_long")
JWT_REFRESH_SECRET=$(openssl rand -base64 48 2>/dev/null || echo "placeholder_refresh_secret_at_least_32_chars_long")
OSS_ACCESS_KEY_ID=PLACEHOLDER_NOT_REAL_KEY
OSS_ACCESS_KEY_SECRET=placeholder_secret_at_least_30_chars_long_for_joi
OSS_BUCKET_PUBLIC=placeholder
OSS_BUCKET_PRIVATE=placeholder
OSS_BUCKET_CONTRACTS=placeholder
NODE_ENV=development
EOF
  fi

  cd apps/api
  # portable timeout (macOS 没自带 timeout 命令)
  OUTFILE=$(mktemp -t deploy-smoke.XXXXXX)
  # 注意:tsconfig 有 rootDir: "./src" 时产物在 dist/main.js,不是 dist/apps/api/src/main.js
  ( set -a; source "$TEMP_ENV"; set +a; node dist/main.js > "$OUTFILE" 2>&1 ) &
  PID=$!
  sleep 6
  if kill -0 $PID 2>/dev/null; then
    kill -TERM $PID 2>/dev/null || true
    sleep 1
    kill -KILL $PID 2>/dev/null || true
  fi
  wait $PID 2>/dev/null || true   # wait 返回非零(node 崩或被杀)不触发 set -e
  STARTUP_OUTPUT=$(cat "$OUTFILE")
  rm -f "$OUTFILE"
  cd "$PROJECT_ROOT"
  rm -f "$TEMP_ENV"

  # 已知 §5.13 DI 错误 (Symbol/string token 不匹配) — 致命
  if echo "$STARTUP_OUTPUT" | grep -qE "Nest can't resolve dependencies"; then
    echo "  ❌ api 启动失败 — §5.13 Nest DI 错误 (Symbol/string token 不匹配?)"
    echo "$STARTUP_OUTPUT" | grep -A 3 "Nest can't resolve" | head -10
    exit 1
  fi

  # 已知 §5.14 prisma generate 缺失 — 致命
  if echo "$STARTUP_OUTPUT" | grep -qE "Cannot convert undefined or null to object"; then
    echo "  ❌ api 启动失败 — §5.14 prisma client 未生成"
    echo "    解法: bash scripts/deploy.sh preflight"
    exit 1
  fi

  # 任何 Error 行 (排除连接类) — 视为致命
  ERRORS=$(echo "$STARTUP_OUTPUT" | grep -E "^Error|TypeError:|ReferenceError|SyntaxError" | grep -vE "ECONNREFUSED|ETIMEDOUT|getaddrinfo ENOTFOUND|Connection refused" || true)
  if [[ -n "$ERRORS" ]]; then
    echo "  ❌ api 启动输出含 Error 行:"
    echo "$ERRORS" | head -10
    exit 1
  fi

  # 成功信号: Nest HTTP server up
  if echo "$STARTUP_OUTPUT" | grep -qE "Nest application successfully started|listening on port"; then
    echo "  ✅ api 启动成功 — Nest HTTP server up"
  # Nest 模块全初始化 (没拿到 listening 是因为 dummy DB URL 卡住,但 DI 解析无错)
  elif echo "$STARTUP_OUTPUT" | grep -qE "AppModule dependencies initialized"; then
    COUNT=$(echo "$STARTUP_OUTPUT" | grep -c "dependencies initialized" || true)
    echo "  ✅ api 启动 smoke 通过 — $COUNT 个模块 DI 解析无错 (DB 连不上是 dummy URL 预期)"
  else
    echo "  ⚠️  api 启动输出无法自动分类,人工 review:"
    echo "$STARTUP_OUTPUT" | head -30
    if [[ -t 0 ]]; then
      read -r -p "  视为通过? (yes/no): " CONFIRM
      [[ "$CONFIRM" == "yes" ]] || exit 1
    else
      echo "  (非交互模式 — 视为失败,deploy 中止)"
      exit 1
    fi
  fi

  echo ""
  echo "✅ verify 通过 (dist 可推 ECS)"
}

build_local() {
  echo "==== [1/4] 本地 build 三端 ===="
  cd "$PROJECT_ROOT"

  # 清 TypeScript incremental 缓存 (tsbuildinfo),防"假成功" — 缓存说"无变化" 但 dist 已被删
  echo "  → 清理 tsbuildinfo (防 incremental 假成功)"
  find apps -maxdepth 3 -name "tsconfig.tsbuildinfo" -delete 2>/dev/null
  rm -rf apps/*/dist 2>/dev/null

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

  # 同步 packages/*/dist — 共享契约 (e.g. @ibi-ren/shared-contracts 改 Symbol/接口必须同步,否则 Nest DI 报 Symbol undefined)
  for pkg in shared-contracts; do
    if [[ -d "$PROJECT_ROOT/packages/$pkg/dist" ]]; then
      echo "  → sync packages/$pkg/dist"
      ssh_run "mkdir -p $ECS_PROJECT_DIR/packages/$pkg/dist"
      (cd "$PROJECT_ROOT/packages/$pkg/dist" && tar czf - .) | ssh_run "(cd $ECS_PROJECT_DIR/packages/$pkg/dist && tar xzf -)"
    fi
  done

  # 同步 package.json + pnpm-lock.yaml (新加依赖时 ECS 需要拿到,否则 MODULE_NOT_FOUND)
  # dist 已经是编译产物,但运行时还需 node_modules (cloudauth/ocr SDK 等)
  echo "  → sync package.json + pnpm-lock.yaml"
  for app in api web admin; do
    ssh_run "mkdir -p $ECS_PROJECT_DIR/apps/$app"
    scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
      "$PROJECT_ROOT/apps/$app/package.json" "$SSH_TARGET:$ECS_PROJECT_DIR/apps/$app/package.json" 2>/dev/null || true
  done
  scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
    "$PROJECT_ROOT/pnpm-lock.yaml" "$SSH_TARGET:$ECS_PROJECT_DIR/pnpm-lock.yaml"

  # ECS 上重新装依赖 (锁文件与本机一致才能 --frozen-lockfile)
  echo "  → pnpm install --frozen-lockfile (on ECS)"
  ssh_run "cd $ECS_PROJECT_DIR && pnpm install --frozen-lockfile 2>&1 | tail -5"

  # 同步 prisma/schema.prisma (改了 schema 必须传,否则 db push 拿不到新字段)
  # §5.X 类坑: 不传的话 prisma db push 会 "already in sync",但 prisma client 还是旧的 → 字段 Unknown
  echo "  → sync apps/api/prisma/schema.prisma"
  ssh_run "mkdir -p $ECS_PROJECT_DIR/apps/api/prisma"
  scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
    "$PROJECT_ROOT/apps/api/prisma/schema.prisma" "$SSH_TARGET:$ECS_PROJECT_DIR/apps/api/prisma/schema.prisma"

  # ECS 上重新生成 prisma client (schema 改了必须重 generate,否则运行时拿不到新字段)
  echo "  → prisma generate (on ECS, schema 同步后)"
  ssh_run "cd $ECS_PROJECT_DIR/apps/api && set -a && source $ECS_PROJECT_DIR/.env && set +a && pnpm exec prisma generate 2>&1 | tail -3"

  # api 的 CJK 字体 (nest build 不打包非 TS 资源,合同 PDF 需要) — apps/api/assets/fonts/
  # 同步到 ECS 的 apps/api/assets/fonts/,否则 onModuleInit 找不到字体,合同 PDF 中文 tofu
  if [[ -d "$PROJECT_ROOT/apps/api/assets" ]]; then
    echo "  → sync apps/api/assets (CJK 字体等 nest 不打包的资源)"
    ssh_run "mkdir -p $ECS_PROJECT_DIR/apps/api/assets"
    (cd "$PROJECT_ROOT/apps/api/assets" && tar czf - .) | ssh_run "(cd $ECS_PROJECT_DIR/apps/api/assets && tar xzf -)"
  fi

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

  # 等 API 真正起来 — NestJS 启动 + DB/OSS 握手约 6-8s,直接 smoke 会 502
  echo "  → 等待 API 启动 (最多 30s)"
  for i in $(seq 1 30); do
    if ssh_run "curl -sS -m 2 http://127.0.0.1:3100/health 2>/dev/null | grep -q '\"status\":\"ok\"'" 2>/dev/null; then
      echo "  ✅ API 健康 (${i}s)"
      return 0
    fi
    sleep 1
  done
  echo "  ⚠️  30s 内 API 未通过 health 检查,smoke 可能看到 502"
}

smoke_ecs() {
  echo "==== [4/4] 三端 smoke ===="
  # Track B Round 1 收尾:smoke 改走 prod 域名(nginx 443),不再打 8080/8081
  bash "$SCRIPT_DIR/smoke.sh" prod
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
  bash "$SCRIPT_DIR/smoke.sh" prod
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
  preflight)
    preflight
    ;;
  build)
    build_local
    ;;
  verify)
    verify
    ;;
  sync)
    build_local
    verify
    make_backup
    sync_to_ecs
    restart_ecs
    smoke_ecs
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
    preflight
    build_local
    verify
    make_backup
    sync_to_ecs
    restart_ecs
    smoke_ecs
    echo ""
    echo "✅ 部署完成"
    ;;
  *)
    echo "用法: $0 {preflight|build|verify|sync|restart|smoke|rollback|backup|all}"
    exit 1
    ;;
esac
