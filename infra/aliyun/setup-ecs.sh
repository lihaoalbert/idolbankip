#!/usr/bin/env bash
# =============================================================
# ibi.ren · ECS 初始化脚本 (Alibaba Cloud Linux 4 / CentOS / RHEL)
# 用 root 执行: bash infra/aliyun/setup-ecs.sh
# =============================================================
set -euo pipefail

APP_USER="ibiren"
APP_DIR="/opt/ibiren"
LOG_DIR="/var/log/ibiren"

echo "==> 1. 基础工具"
yum install -y git curl wget unzip nginx || true

echo "==> 2. Node.js 22 + pnpm"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
  yum install -y nodejs
fi
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@9.12.0
fi

echo "==> 3. PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
  pm2 startup systemd -u root --hp /root
fi

echo "==> 4. 创建应用用户与目录"
id -u "$APP_USER" >/dev/null 2>&1 || useradd -r -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR" "$LOG_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$LOG_DIR"

echo "==> 5. 防火墙(阿里云安全组优先,这里仅兜底)"
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-service=http || true
  firewall-cmd --permanent --add-service=https || true
  firewall-cmd --reload || true
fi

echo "==> 6. 拉取代码(由 CI 注入或手动)"
if [ ! -d "$APP_DIR/.git" ]; then
  echo "提示: 请将代码 rsync 到 $APP_DIR (例: rsync -avz --exclude node_modules ./  root@<ECS_IP>:$APP_DIR/)"
fi

echo "==> 7. systemd 服务(走 PM2 持久化)"
cat > /etc/systemd/system/ibiren-api.service <<'EOF'
[Unit]
Description=ibi.ren API (NestJS)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ibiren/apps/api
EnvironmentFile=/opt/ibiren/.env
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable ibiren-api

echo "==> 8. nginx 站点(占位,容器化部署由 edge 服务接管)"
cat > /etc/nginx/conf.d/ibiren.conf <<'EOF'
server {
    listen 80 default_server;
    server_name _;
    location /api/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location / {
        root /var/www/ibiren/web;
        try_files $uri $uri/ /index.html;
    }
}
EOF
nginx -t && systemctl reload nginx

echo "==> 9. SSL 证书 (acme.sh 申请)"
if [ ! -d /root/.acme.sh ]; then
  curl https://get.acme.sh | sh -s email=ibi@intfocus.com
  # 用 DNS 验证(阿里云解析)签发 *.ibi.ren 通配符证书
  # export Ali_Key="LTAI..." Ali_Secret="..."
  # acme.sh --issue --dns dns_ali -d "ibi.ren" -d "*.ibi.ren"
  # acme.sh --install-cert -d "ibi.ren" \
  #   --cert-file /etc/nginx/ssl/ibi.ren.crt \
  #   --key-file  /etc/nginx/ssl/ibi.ren.key \
  #   --fullchain-file /etc/nginx/ssl/fullchain.pem
fi

echo "==> 10. 日志轮转"
cat > /etc/logrotate.d/ibiren <<'EOF'
/var/log/ibiren/*.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    copytruncate
}
EOF

echo ""
echo "============================================="
echo "✅ ECS 初始化完成"
echo "接下来:"
echo "  1. rsync 代码到 $APP_DIR"
echo "  2. cd $APP_DIR && cp .env.prod.example .env && vim .env"
echo "  3. cd $APP_DIR/apps/api && pnpm install && pnpm prisma:deploy && pnpm build"
echo "  4. systemctl start ibiren-api && systemctl status ibiren-api"
echo "============================================="
