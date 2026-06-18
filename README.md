# ibi.ren (Idol Bank IP)

> AI 虚拟人资产与版权交易平台 · MVP 单仓库实现
>
> 单开发者、30 天可上线、阿里云 ECS + RDS + OSS 全栈

## 项目目标

构建中国首个标准化的 AI 虚拟人资产 (AI 数字人 IP) 交易平台。核心循环:

```
创作者上传资产包 (三视图/表情/立绘/LoRA/小传)
  → 平台审核 + 阿里云内容安全扫描
  → 区块链存证 (mock) → 国家版权局登记 (admin 手动)
  → 公开展示 + 意向金 (¥199) / 正式授权
  → 自动电子合同 + OSS 签名 URL 解锁下载
```

## 仓库结构 (pnpm monorepo)

```
ibi.ren/
├── apps/
│   ├── api/         NestJS + Prisma 后端 (端口 3100)
│   ├── web/         Vue 3 主站 (端口 5173/8080)
│   └── admin/       Vue 3 运营控制台 (端口 8081)
├── packages/
│   ├── shared-types/       共享 TS 类型 (DTO, enum)
│   ├── shared-contracts/    外部服务接口 + mock 实现
│   └── ui-kit/             可选 UI 组件库
├── scripts/         种子数据 + 资源生成
├── infra/           Docker / nginx / 部署脚本
│   ├── docker/
│   │   ├── api.Dockerfile
│   │   ├── web.Dockerfile
│   │   ├── admin.Dockerfile
│   │   └── nginx/{web,admin,edge}.conf
│   ├── docker-compose.yml
│   ├── .env.prod.example
│   ├── ecosystem.config.cjs  (PM2)
│   └── aliyun/setup-ecs.sh
├── docs/            设计/调研/部署文档
└── seed-assets/     种子图 (pnpm gen:images 生成)
```

## 30 分钟跑起来 (本地)

### 0. 前置要求

- Node.js ≥ 20
- pnpm ≥ 9 (`npm install -g pnpm@9.12.0`)
- MySQL 8 (本地或 Docker)
- Redis 7 (本地或 Docker)

### 1. 装依赖 + 配环境

```bash
cd ibi.ren
pnpm install
cp .env.example .env       # 编辑 DATABASE_URL / REDIS_URL / JWT_*
```

### 2. 初始化数据库

```bash
pnpm prisma:generate
pnpm prisma:migrate --name init
pnpm seed:all              # 1 管理员 + 3 创作者 + 5 采购方 + 100 占位 IP
```

### 3. 启动开发

```bash
pnpm dev                   # 同时启 api:3100 + web:5173 + admin:8081
```

访问:

- 主站: http://localhost:5173
- 后台: http://localhost:8081 (默认管理员账号见种子脚本或项目记忆)
- API:  http://localhost:3100/api/v1
- 文档: http://localhost:3100/api/docs

## 部署到阿里云

### 路径 A:Docker Compose (推荐)

```bash
# 1. ECS 上拉代码 (主机 IP / SSH key 见项目记忆: reference_ecs_deploy_paths)
ssh root@<ECS_IP>
cd /opt && git clone <REPO> ibi.ren && cd ibi.ren

# 2. 配环境
cp infra/.env.prod.example infra/.env
vim infra/.env  # 填 DATABASE_URL / OSS_* / JWT_*

# 3. 启用 RDS SSL (重要!)
#    阿里云控制台 → RDS → 数据安全性 → SSL → 启用
#    启用后 .env 里的 DATABASE_URL 必须含 ?ssl-mode=REQUIRED

# 4. 跑 Prisma migration
docker compose run --rm api sh -c "cd apps/api && npx prisma migrate deploy && pnpm seed:all"

# 5. 启动
cd infra && docker compose up -d
```

### 路径 B:PM2 直跑 (单 ECS 免 Docker)

```bash
# 1. 初始化 ECS
bash infra/aliyun/setup-ecs.sh

# 2. 推代码
rsync -avz --exclude node_modules --exclude .git ./ root@<ECS>:/opt/ibiren/

# 3. 装依赖 + 编译
cd /opt/ibiren && pnpm install --frozen-lockfile
pnpm --filter @ibi-ren/api run prisma:deploy
pnpm --filter @ibi-ren/api run build
pnpm --filter @ibi-ren/web run build
pnpm --filter @ibi-ren/admin run build

# 4. 写静态文件到 nginx 目录
mkdir -p /var/www/ibiren/{web,admin}
cp -r apps/web/dist/* /var/www/ibiren/web/
cp -r apps/admin/dist/* /var/www/ibiren/admin/

# 5. 启动 API
systemctl start ibiren-api
systemctl status ibiren-api
```

### 路径 C:容器化 + ACK (week-3+)

待 1k+ UV 后再迁。详见 [部署文档](docs/deploy.md)。

## 关键功能验收

| 流程 | 命令/路径 | 状态 |
|---|---|---|
| 用户注册 | `POST /api/v1/auth/register` | ✅ |
| 创作者登录 | `POST /api/v1/auth/login` | ✅ |
| 创建 IP (shell) | `POST /api/v1/ips` | ✅ |
| 上传资产 (直传 OSS) | `POST /api/v1/upload/policy` + OSS PUT | ✅ |
| 提交审核 | `POST /api/v1/ips/:id/submit` | ✅ (自动上链 + 转公示) |
| 平台审核 | `POST /api/v1/admin/ips/:id/approve` | ✅ |
| 登记版权号 | `POST /api/v1/admin/ips/:id/register-cert` | ✅ |
| 浏览形象库 | `GET /api/v1/ips` | ✅ |
| 意向金下单 | `POST /api/v1/orders` + `POST /api/v1/orders/:id/pay` | ✅ |
| 自动电子合同 | 支付成功后异步生成 | ✅ (mock 法大大) |
| 签名 URL 下载 | `POST /api/v1/download/token` | ✅ (5 分钟 TTL) |

## 反盗版机制

- 缩略图 600×600,预览图 1024×1024,LoRA 不直接下载
- 全站水印叠加 (SVG 瓦片, -30° 倾斜, 0.05-0.30 透明度)
- 关键图片禁止右键 / 拖拽 (`.no-pirate` CSS class)
- OSS 签名 URL 5 分钟过期,单次有效
- 私桶永不开公读,所有访问走签名
- CDN Referer 白名单 + HTTPS-only

## 30 天 (软著) 空窗期处理

`PUBLIC_INTENT` 状态表示已完成区块链存证,正在等版权局下发登记号 (约 30 天)。期间:

- 平台对所有 `DEPOSIT_INTENT` 订单的合同标记 `isConditional=true`
- 创作者端 B 端下单时弹出黄色横幅告知
- 30 天后 admin 录入 `officialCertNo`,订单自动 `copyrightEffective=true`
- 若 30 天未获批,平台按"全额退款 + 已交付资产下架"兜底

## 外部服务 mock 接口

所有外部集成在 `packages/shared-contracts/` 后接 `mock`,可一行切换为真实实现:

| 服务 | 接口 | Mock 行为 | 生产替换 |
|---|---|---|---|
| 区块链存证 | `BlockchainClient` | 随机 txId | 蚂蚁链 / 长安链 |
| 电子签 | `ESignClient` | 内存流模拟 | 法大大 / e签宝 |
| 实名 KYC | `KycClient` | 直接通过 | 阿里云实人认证 |
| 支付 | `PaymentClient` | 直接成功 | 支付宝 / 微信 |
| 水印 | `WatermarkClient` | SVG 叠加 | OpenCV DWT-SVD |
| 内容安全 | `ModerationClient` | 放行 | 阿里云 Green |

## 常用命令

```bash
# 开发
pnpm dev                       # 全栈并行
pnpm dev:api                   # 仅后端 (nodemon)
pnpm dev:web                   # 仅 web (vite)
pnpm dev:admin                 # 仅 admin (vite)

# 数据库
pnpm prisma:generate
pnpm prisma:migrate            # 开发
pnpm prisma:deploy             # 生产
pnpm prisma:studio             # GUI

# 种子
pnpm seed:all                  # 用户 + 100 IP
pnpm gen:images                # 生成 100 个占位缩略图 (600+1024)
pnpm upload:thumbs             # 上传到 OSS public bucket

# 代码质量
pnpm lint
pnpm --filter @ibi-ren/api run typecheck
pnpm --filter @ibi-ren/web run typecheck
```

## 阿里云安全配置

- ECS 公网 IP / SSH 私钥 / RDS 实例 ID / OSS bucket 名: 见项目记忆 `reference_ecs_deploy_paths.md`(不入 git)
- ✅ AccessKey 使用 RAM 子账号,权限已受控 (建议最少包含 OSS / 内容安全 / 短信)
- ⚠️ RDS SSL 默认关闭,生产前必须启用 (控制台 → 数据安全性 → SSL → 启用)
- ⚠️ 域名 ibi.ren 需先 ICP 备案,期间用 ECS 公网 IP 访问

## License

Proprietary. © 2026 ibi.ren.
