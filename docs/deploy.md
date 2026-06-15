# ibi.ren · 阿里云部署运行手册

> 目标读者:负责 ibi.ren 部署的开发者 (单 dev 也能搞定)
>
> 部署形态:Week 1-2 单 ECS + docker-compose,Week 3+ 可迁 ACK

## 1. 资源清单

| 资源 | 规格 | 月成本 | 备注 |
|---|---|---|---|
| ECS `ecs.g6.large` | 2 vCPU / 8 GB | ¥300 | 跑 api+web+admin+nginx |
| RDS MySQL 8 `rds.mysql.s3.large` | 2 vCPU / 4 GB / 100GB | ¥600 | db 名 `ibi_ren` |
| Redis 7 `redis.amber.1g` | 1 GB | ¥200 | BullMQ + 缓存 |
| OSS cn-shanghai × 3 | 50 GB | ¥10 | public / private / contracts |
| CDN | 100 GB 流量 | ¥25 | 静态加速 |
| DirectMail | free tier | ¥0 | 邮件 |
| 内容安全 Green | pay-per-call | ¥100/月 | 1000+ 次扫描 |
| **合计** | | **~¥1,500/月** | MVP 阶段 |

域名 `ibi.ren`:¥70/年,需 ICP 备案 (首次 5-10 工作日)。

## 2. 前置准备 (一次性)

### 2.1 启用 RDS SSL (生产强制)

RDS MySQL 8.4+ 默认要求 SSL,即使未启用 SSL 也会拒绝 caching_sha2_password 认证。

**步骤:**
1. 阿里云控制台 → 云数据库 RDS → 实例 `rm-uf6px83tcbt52z3xc`
2. 左侧菜单 → **数据安全性** → **SSL 加密**
3. 切换为 **已启用** → 确定 (无需重启实例,秒级生效)
4. 验证:本地用 `mysql` CLI 测试
   ```bash
   mysql -h rm-uf6px83tcbt52z3xc.mysql.rds.aliyuncs.com \
         -u ibi_user01 -p \
         --ssl-mode=REQUIRED \
         ibi_ren -e "SELECT VERSION();"
   ```
5. Prisma 连接串添加 `?ssl-mode=REQUIRED` (或 `?ssl-mode=REQUIRED&ssl-cert=...` 如需证书)

### 2.2 创建 OSS Bucket

```bash
# 用 ossutil 一次性建好 (需先安装 ossutil 并配置 AK)
ossutil mb oss://ibi-public -e oss-cn-shanghai.aliyuncs.com
ossutil mb oss://ibi-private -e oss-cn-shanghai.aliyuncs.com
ossutil mb oss://ibi-contracts -e oss-cn-shanghai.aliyuncs.com

# public bucket 开公读
ossutil set-acl oss://ibi-public public-read

# 配置 CORS
cat > cors-public.json <<'EOF'
[{
  "allowedOrigin": ["https://ibi.ren", "https://www.ibi.ren", "https://admin.ibi.ren"],
  "allowedMethod": ["GET", "HEAD"],
  "allowedHeader": ["*"],
  "exposeHeader": ["ETag", "Content-Length", "Content-Type"],
  "maxAgeSeconds": 3600
}]
EOF
ossutil cors --method put oss://ibi-public cors-public.json

# 配置 Referer 白名单 (防盗链)
ossutil referer --method put oss://ibi-public referer-public.json \
  --referer-white-list "https://ibi.ren https://www.ibi.ren" \
  --allow-empty-referer false
```

### 2.3 新建 RAM 子账号 (强烈建议)

不要用主账号 AK 跑应用。新建子账号 `ibiren-app`,只授权:

- `AliyunOSSFullAccess` (OSS 读写)
- `AliyunGreenWebSocketFullAccess` (内容安全)
- `AliyunDirectMailFullAccess` (邮件)
- 关闭控制台登录权限

拿到子账号的 AccessKey 后填入 `.env`。

### 2.4 域名 + ICP

- 在阿里云万网买 `ibi.ren` (~¥70/年)
- 阿里云 ICP 备案系统提交 (5-10 工作日,免费)
- 期间可在 `/etc/hosts` 加 `8.133.241.103 dev.ibi.ren` 本地访问
- ICP 通过后用 acme.sh 申请 Let's Encrypt 通配符证书 (DNS 验证)

## 3. 部署流程 (Docker Compose)

### 3.1 准备 ECS

```bash
ssh -i intfocus-albert.pem root@8.133.241.103
yum update -y
yum install -y git
curl -fsSL https://get.docker.com | bash
systemctl enable --now docker
```

### 3.2 拉代码 + 配环境

```bash
mkdir -p /opt/ibiren && cd /opt/ibiren
git clone https://github.com/<YOUR_ORG>/ibiren.git .
cp infra/.env.prod.example infra/.env
nano infra/.env
```

填入:

- `DATABASE_URL` 含 `?ssl-mode=REQUIRED`
- `REDIS_URL` (阿里云 Redis 7 内网)
- `OSS_*` 用子账号 AK
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` 用 `openssl rand -base64 48`
- `SEED_ADMIN_PASSWORD` 自定义强密码

### 3.3 跑 migration + 种子

```bash
cd infra
docker compose run --rm api sh -c "
  cd apps/api &&
  npx prisma migrate deploy &&
  cd ../../.. &&
  pnpm seed:users &&
  pnpm seed:ips
"
```

### 3.4 启动

```bash
docker compose up -d
docker compose ps                    # 看健康状态
docker compose logs -f api           # tail API 日志
```

### 3.5 配置 SSL (ICP 完成后)

```bash
# 装 acme.sh
curl https://get.acme.sh | sh
source ~/.bashrc

# 配阿里云 DNS API (从子账号控制台拿)
export Ali_Key="<子账号 AK>"
export Ali_Secret="<子账号 SK>"

# 签 *.ibi.ren 通配符
acme.sh --issue --dns dns_ali -d "ibi.ren" -d "*.ibi.ren"

# 安装到 nginx
mkdir -p /opt/ibiren/infra/docker/nginx/ssl
acme.sh --install-cert -d "ibi.ren" \
  --cert-file      /opt/ibiren/infra/docker/nginx/ssl/ibi.ren.crt \
  --key-file       /opt/ibiren/infra/docker/nginx/ssl/ibi.ren.key \
  --fullchain-file /opt/ibiren/infra/docker/nginx/ssl/fullchain.pem

# edge 服务 reload
docker compose restart edge
```

## 4. 监控 + 告警

### 4.1 SLS 日志 (可选)

阿里云日志服务,免费 500MB/天:

```bash
# 在 API 容器内挂载 sidecar
docker run -d --name ibi-logtail \
  -v /var/lib/docker/containers:/var/lib/docker/containers:ro \
  registry.cn-hangzhou.aliyuncs.com/log-service/logtail:latest
```

在 SLS 控制台配置采集规则:路径 `/var/lib/docker/containers/*/*.log`。

### 4.2 Sentry (可选)

```bash
# .env 加
SENTRY_DSN=https://...@sentry.io/...

# 代码里包一层:在 main.ts 加 Sentry.init({ dsn, tracesSampleRate: 0.1 })
```

### 4.3 阿里云监控 (免费)

云监控控制台 → 告警规则:

- ECS CPU > 80% 持续 5 分钟 → SMS
- RDS 连接数 > 80% → SMS
- Redis 内存 > 80% → SMS

## 5. 备份策略

| 资源 | 频率 | 保留 | 工具 |
|---|---|---|---|
| RDS MySQL | 每日 03:00 | 7 天 | RDS 控制台 → 备份恢复 |
| OSS 资产 | 跨区复制 | 永久 | OSS 跨区复制 |
| Redis | 每日 04:00 | 3 天 | RDB 快照 |

## 6. 升级流程

```bash
# 1. 本地开发并测试
git pull
pnpm install
pnpm test

# 2. 推到 main,GitHub Actions 自动跑 build + test + 推 ACR
git push origin main

# 3. ECS 拉新镜像
ssh root@8.133.241.103
cd /opt/ibiren
git pull
cd infra
docker compose pull
docker compose up -d

# 4. 跑 migration (如果有新版本)
docker compose run --rm api sh -c "cd apps/api && npx prisma migrate deploy"
```

## 7. 故障排查

| 症状 | 原因 | 处理 |
|---|---|---|
| API 起不来,日志 `caching_sha2_password` | RDS SSL 未启用 | 见 §2.1 |
| 前端白屏 | nginx 静态路径错 | `docker compose logs web` |
| OSS 上传 403 | bucket CORS 未配 | 见 §2.2 |
| 区块链存证失败 | mock 链配置错 | 查 `BLOCKCHAIN_DRIVER=mock` |
| 内容安全一直 reject | Green AK 失效 | 重新申请子账号 AK |
| 签名 URL 403 | `expires=300` 已过 | 让用户重新点下载 |

## 8. 域名 ICP 备案期间

备案下来前可:

1. 用 ECS 公网 IP `http://8.133.241.103:8080` 访问 web
2. 申请 `dev.ibi.ren` 子域名 — **注意:子域名也需要 ICP 备案**
3. 用临时域名 `ibiren.xxx.com` 转发到 ECS IP (Cloudflare Worker 反代)
