#!/usr/bin/env bash
# =============================================================
# ibi.ren · ECS 一键引导脚本
# 用法: 阿里云控制台 Workbench 终端粘贴执行
# 完成: 装 Docker + 克隆仓库 + 配置 .env + 启动全栈
#
# 重要: 本脚本不入仓时携带任何凭据。所有 secret 走 env 注入
#   或在 Workbench 中临时 set,执行完后 unset
# =============================================================
set -e

# ---------- 可调参数 (默认值,可被 env 覆盖) ----------
GIT_REPO="${GIT_REPO:-https://github.com/lihaoalbert/idolbankip.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/ibiren}"
RDS_HOST="${RDS_HOST:-rm-uf6px83tcbt52z3xc.mysql.rds.aliyuncs.com}"
RDS_USER="${RDS_USER:-ibi_user01}"
RDS_PASS="${RDS_PASS:-}"
RDS_DB="${RDS_DB:-ibi_ren}"
OSS_AK="${OSS_AK:-}"
OSS_SK="${OSS_SK:-}"
OSS_REGION="${OSS_REGION:-oss-cn-shanghai}"
SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-Focus_2026!}"

# 端口 (避开常用 80/443,改用 8088/8443)
API_PORT=3100
WEB_PORT=8080
ADMIN_PORT=8081
EDGE_HTTP_PORT=8088
EDGE_HTTPS_PORT=8443

echo "========================================="
echo "  ibi.ren · ECS 一键引导"
echo "  时间: $(date '+%F %T')"
echo "========================================="

# ---------- 0. 凭据检查 ----------
MISSING=()
[ -z "$RDS_PASS" ] && MISSING+=("RDS_PASS")
[ -z "$OSS_AK" ] && MISSING+=("OSS_AK")
[ -z "$OSS_SK" ] && MISSING+=("OSS_SK")
if [ ${#MISSING[@]} -gt 0 ]; then
  echo ""
  echo "❌ 缺少必要凭据: ${MISSING[*]}"
  echo ""
  echo "   请在执行本脚本前,先 set 环境变量,例如:"
  echo "     export RDS_PASS='你的RDS密码'"
  echo "     export OSS_AK='你的AccessKeyID'"
  echo "     export OSS_SK='你的AccessKeySecret'"
  echo ""
  echo "   或一行 export 一起执行:"
  echo "     RDS_PASS='xxx' OSS_AK='LTAIxxx' OSS_SK='xxx' bash $0"
  echo ""
  exit 1
fi

# ---------- 1. 系统信息 ----------
echo ""
echo "▶ [1/8] 系统信息"
cat /etc/os-release | grep -E '^(NAME|VERSION)='
echo "  内核: $(uname -r)"
echo "  内存: $(free -h | awk 'NR==2{print $2}')"
echo "  磁盘: $(df -h / | awk 'NR==2{print $4}') 可用"

# ---------- 2. 装 Docker (静态二进制法) ----------
echo ""
echo "▶ [2/8] 装 Docker (静态二进制)"

if command -v docker >/dev/null 2>&1; then
  echo "  ✅ docker 已装: $(docker --version)"
else
  echo "  下载 docker 静态包 ..."
  # 多个 mirror 依次试
  DOCKER_TGZ=""
  for URL in \
    "https://mirrors.aliyun.com/docker-ce/linux/static/stable/x86_64/docker-27.4.1.tgz" \
    "https://mirrors.tuna.tsinghua.edu.cn/docker-ce/linux/static/stable/x86_64/docker-27.4.1.tgz" \
    "https://download.docker.com/linux/static/stable/x86_64/docker-27.4.1.tgz"; do
    echo "    尝试: $URL"
    if curl -fsSL --max-time 60 -o /tmp/docker.tgz "$URL" 2>/dev/null; then
      DOCKER_TGZ="/tmp/docker.tgz"
      echo "    ✅ 下载成功"
      break
    else
      echo "    ❌ 失败"
    fi
  done

  if [ -z "$DOCKER_TGZ" ]; then
    echo "  ⚠️ 所有 mirror 不可达,改用 dnf 装 (Aliyun Linux 4 系统自带)"
    dnf install -y docker 2>&1 | tail -3
  else
    tar -xzf $DOCKER_TGZ -C /tmp
    cp /tmp/docker/* /usr/local/bin/
    echo "  ✅ Docker 二进制部署到 /usr/local/bin/"
  fi

  # systemd service
  cat > /etc/systemd/system/docker.service <<'EOF'
[Unit]
Description=Docker Application Container Engine
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/local/bin/dockerd -H unix:///var/run/docker.sock --data-root=/var/lib/docker
ExecReload=/bin/kill -s HUP $MAINPID
LimitNOFILE=infinity
LimitNPROC=infinity
TimeoutStartSec=0
Delegate=yes
KillMode=process
Restart=on-failure
StartLimitBurst=3
StartLimitInterval=60s

[Install]
WantedBy=multi-user.target
EOF

  # config dir
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
EOF

  systemctl daemon-reload
  systemctl enable --now docker
  sleep 3
  echo "  ✅ docker 启动: $(docker --version)"
  docker info 2>&1 | grep -E "Server Version|Storage Driver|Registry Mirrors" | head -5
fi

# ---------- 3. 装 docker-compose (standalone) ----------
echo ""
echo "▶ [3/8] 装 docker-compose"
if command -v docker-compose >/dev/null 2>&1; then
  echo "  ✅ 已装: $(docker-compose --version)"
else
  for URL in \
    "https://mirrors.aliyun.com/docker-toolbox/linux/compose/v2.32.0/docker-compose-linux-x86_64" \
    "https://github.com/docker/compose/releases/download/v2.32.0/docker-compose-linux-x86_64"; do
    echo "    尝试: $URL"
    if curl -fsSL --max-time 60 -o /usr/local/bin/docker-compose "$URL" 2>/dev/null; then
      chmod +x /usr/local/bin/docker-compose
      echo "  ✅ docker-compose: $(docker-compose --version)"
      break
    fi
  done
fi

# ---------- 4. 克隆仓库 ----------
echo ""
echo "▶ [4/8] 克隆仓库到 $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  echo "  ✅ 仓库已存在,cd 进去"
  cd "$APP_DIR"
  git fetch --all 2>&1 | tail -2
  git reset --hard origin/$GIT_BRANCH 2>&1 | tail -2
else
  mkdir -p "$(dirname $APP_DIR)"
  # HTTPS 克隆 (无需 SSH key)
  if git clone --branch $GIT_BRANCH "$GIT_REPO" "$APP_DIR" 2>&1 | tail -5; then
    echo "  ✅ 克隆成功"
  else
    echo "  ❌ 克隆失败,请检查网络或 GitHub 访问"
    exit 1
  fi
  cd "$APP_DIR"
fi

# ---------- 5. 配 .env ----------
echo ""
echo "▶ [5/8] 写入 .env (生产)"
JWT_ACCESS_SECRET=$(openssl rand -base64 48 | tr -d '\n')
JWT_REFRESH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
OSS_CALLBACK_SECRET=$(openssl rand -base64 32 | tr -d '\n')

cat > "$APP_DIR/infra/.env" <<EOF
# ibi.ren 生产环境变量 (自动生成于 $(date '+%F %T'))

NODE_ENV=production
APP_BASE_URL=http://8.133.241.103:$WEB_PORT
API_BASE_URL=http://8.133.241.103:$API_PORT

# ---------- 数据库 (RDS SSL 已启用) ----------
DATABASE_URL="mysql://${RDS_USER}:${RDS_PASS}@${RDS_HOST}:3306/${RDS_DB}?ssl-mode=REQUIRED&charset=utf8mb4&parseTime=True&loc=Local"

# ---------- Redis (本地容器) ----------
REDIS_URL="redis://redis:6379"

# ---------- JWT ----------
JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET}"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET}"
JWT_REFRESH_TTL="30d"

# ---------- OSS ----------
OSS_REGION="${OSS_REGION}"
OSS_ACCESS_KEY_ID="${OSS_AK}"
OSS_ACCESS_KEY_SECRET="${OSS_SK}"
OSS_BUCKET_PUBLIC="ibi-public"
OSS_BUCKET_PRIVATE="ibi-private"
OSS_BUCKET_CONTRACTS="ibi-contracts"
OSS_CALLBACK_SECRET="${OSS_CALLBACK_SECRET}"

# ---------- 内容安全 (暂 mock) ----------
ALIYUN_GREEN_ACCESS_KEY_ID=""
ALIYUN_GREEN_ACCESS_KEY_SECRET=""
ALIYUN_GREEN_REGION="${OSS_REGION}"
MODERATION_DRIVER="mock"

# ---------- 外部服务 (全 mock) ----------
BLOCKCHAIN_DRIVER="mock"
ESIGN_DRIVER="mock"
PAYMENT_DRIVER="mock"
KYC_DRIVER="mock"
WATERMARK_DRIVER="mock"

# ---------- 监控 ----------
LOG_LEVEL="info"
SENTRY_DSN=""

# ---------- 创世管理员 ----------
SEED_ADMIN_EMAIL="admin@ibi.ren"
SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD}"

# ---------- 端口 ----------
API_PORT=${API_PORT}
EOF
echo "  ✅ .env 已生成"
echo "     管理员: admin@ibi.ren / ${SEED_ADMIN_PASSWORD}"

# ---------- 6. 调端口 (避开 80/443) ----------
echo ""
echo "▶ [6/8] 调 docker-compose 端口 (避开 80/443)"
# 修改 docker-compose.yml 的 edge 服务端口
sed -i "s|\"80:80\"|\"${EDGE_HTTP_PORT}:80\"|g" "$APP_DIR/infra/docker/docker-compose.yml"
sed -i "s|\"443:443\"|\"${EDGE_HTTPS_PORT}:443\"|g" "$APP_DIR/infra/docker/docker-compose.yml"
echo "  ✅ edge: 80→${EDGE_HTTP_PORT}, 443→${EDGE_HTTPS_PORT}"

# ---------- 7. docker compose up ----------
echo ""
echo "▶ [7/8] 构建并启动 (首次 ~3-5 分钟)"
cd "$APP_DIR/infra"
docker compose pull 2>&1 | tail -3 || true
docker compose build --parallel 2>&1 | tail -10
docker compose up -d 2>&1 | tail -10
echo ""
echo "  容器状态:"
docker compose ps

# ---------- 8. 跑 prisma migration + seed ----------
echo ""
echo "▶ [8/8] Prisma migration + 种子"
docker compose exec -T api sh -c "cd apps/api && npx prisma migrate deploy 2>&1 | tail -10"
docker compose exec -T api sh -c "cd apps/api && pnpm seed:users 2>&1 | tail -5"
docker compose exec -T api sh -c "cd apps/api && pnpm seed:ips 2>&1 | tail -5"

echo ""
echo "========================================="
echo "  ✅ 全部完成"
echo "========================================="
echo ""
echo "📍 访问入口:"
echo "   主站:  http://8.133.241.103:${WEB_PORT}"
echo "   后台:  http://8.133.241.103:${ADMIN_PORT}"
echo "   API:   http://8.133.241.103:${API_PORT}/api/v1/health"
echo "   文档:  http://8.133.241.103:${API_PORT}/api/docs"
echo "   边缘:  http://8.133.241.103:${EDGE_HTTP_PORT}"
echo ""
echo "🔑 登录凭据:"
echo "   管理员:   admin@ibi.ren / ${SEED_ADMIN_PASSWORD}"
echo "   创作者:   creator_001@ibi.ren / Focus_2026!"
echo "   采购方:   buyer_001@ibi.ren / Focus_2026!"
echo ""
echo "📋 常用命令 (在 $APP_DIR/infra 下):"
echo "   docker compose ps              # 容器状态"
echo "   docker compose logs -f api     # API 实时日志"
echo "   docker compose restart api     # 重启 API"
echo "   docker compose down            # 停全栈"
echo ""
echo "⚠️ 阿里云安全组入方向记得放行端口: ${API_PORT} ${WEB_PORT} ${ADMIN_PORT} ${EDGE_HTTP_PORT}"
