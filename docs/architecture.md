# ibi.ren · 架构总览

> 给工程师 5 分钟看懂的全局图

## 1. 系统拓扑

```
┌─────────────────────────────────────────────────────────────┐
│  阿里云华东2 (上海)                                          │
│                                                              │
│  ┌─────────────────┐    ┌──────────────────────────────┐    │
│  │  OSS 公开桶     │    │  OSS 私有桶 (签名URL)        │    │
│  │  ibi-public     │    │  ibi-private                 │    │
│  │  · 缩略图       │    │  · LoRA / 完整资产包          │    │
│  │  · 预览图       │    │                              │    │
│  └─────────────────┘    └──────────────────────────────┘    │
│           ▲                          ▲                       │
│           │ 直传 (POST policy)       │ 签名 GET               │
│           │                          │                       │
│  ┌────────┴──────────────────────────┴───────────┐           │
│  │            ECS 8.133.241.103                  │           │
│  │  ┌────────────────────────────────────────┐   │           │
│  │  │  Docker Compose                        │   │           │
│  │  │  ┌────────┐ ┌──────┐ ┌──────┐ ┌─────┐ │   │           │
│  │  │  │  api   │ │ web  │ │admin │ │edge │ │   │           │
│  │  │  │:3100   │ │:8080 │ │:8081 │ │:443 │ │   │           │
│  │  │  │ NestJS │ │ Nginx│ │ Nginx│ │Nginx│ │   │           │
│  │  │  └────────┘ └──────┘ └──────┘ └─────┘ │   │           │
│  │  │  ┌──────┐                                │   │           │
│  │  │  │Redis │                                │   │           │
│  │  │  └──────┘                                │   │           │
│  │  └────────────────────────────────────────┘   │           │
│  └──────────────────┬────────────────────────────┘           │
│                     │ 内网                                 │
│                     ▼                                       │
│  ┌──────────────────────────────────┐                       │
│  │  RDS MySQL 8.4 (内网)            │                       │
│  │  rm-uf6px83tcbt52z3xc            │                       │
│  └──────────────────────────────────┘                       │
│                                                              │
│  ┌──────────────────────────────────┐                       │
│  │  Redis 7 (内网)                  │                       │
│  └──────────────────────────────────┘                       │
│                                                              │
│  ┌──────────────────────────────────┐                       │
│  │  阿里云 Green (内容安全)          │                       │
│  │  阿里云 DirectMail (邮件)         │                       │
│  └──────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS
                              │
        ┌─────────────────────┴─────────────────────┐
        │  浏览器                                    │
        │  · 主站 portal (Vue 3)                     │
        │  · Admin 控制台 (Vue 3,IP 白名单)          │
        │  · 上传时直传 OSS (POST policy)            │
        │  · 下载时获取 5min 签名 URL 再跳转 OSS    │
        └───────────────────────────────────────────┘
```

## 2. 数据流

### 2.1 创作者上传资产 (核心)

```
浏览器选文件
   ↓
[POST /api/v1/upload/policy]   ← api 生成 OSS POST policy
   ↓
浏览器 PUT 到 oss://ibi-private/ips/{code}/raw/{type}/{file}
   ↓
OSS 回调 [POST /api/v1/upload/oss-callback] (带签名头)
   ↓
api 解析 etag/size → 写 IpFile 表 → 触发异步 (mock 区块链 + mock 水印)
   ↓
前端轮询 `/ips/mine/list` 看完成度
```

### 2.2 采购方下载资产 (核心)

```
浏览器打开 /my-assets
   ↓
[GET /api/v1/download/list?orderId=X]   ← api 校验 订单已 DOWNLOAD_UNLOCKED + 合同 FULLY_SIGNED
   ↓
用户点下载
   ↓
[POST /api/v1/download/token]   ← api 生成 OSS 签名 URL (TTL 300s)
   ↓
浏览器 GET 签名 URL → 跳转到 oss://ibi-private/.../LORA_FILE
   ↓
api 写 DownloadGrant + AuditLog
```

### 2.3 状态机 (IP 资产)

```
PENDING_REVIEW  ──submit──>  REVIEWED_PROOFING  ──hash 上链──>  PUBLIC_INTENT  ──登记版权号──>  OFFICIAL_REGISTERED
        │                              │                                                              │
        │ admin/reject                 │ admin/reject                                                  │ admin/archive
        ▼                              ▼                                                              ▼
   REJECTED                       REJECTED                                                      ARCHIVED
```

## 3. 关键技术决策

### 3.1 为什么用 pnpm monorepo

- 共享 `@prisma/client` 类型,前后端 DTO 自动同步
- 单 `pnpm install` + 单 CI pipeline
- 避免 30 天时间表内 3 个仓库的 PR 协调开销

### 3.2 为什么 mock 区块链/电子签/支付

- MVP 验证流程优先,真接入每个需 ¥10k+ 商务对接 + 2-3 周联调
- 接口设计可一行切换 (`MockBlockchainClient` → `AntChainClient`)
- 测试覆盖 100% mock 行为,生产替换零业务代码改动

### 3.3 为什么 OSS 直传不走 API 代理

- LoRA 文件 300MB,过 API 既慢又贵 (带宽 ¥0.5/GB)
- POST policy 是 OSS 原生机制,前端用 `ali-oss` 5 行代码搞定
- 风险点:回调签名校验,我们的 `OssSignatureMiddleware` 严格校验

### 3.4 为什么 30 天空窗期要单独处理

中国软件著作权 (软著) 申请到下发约 30 天,期间:

- 创作者急着卖,采购方想用
- 法律上版权未生效,合同条款需附条件
- 区块链存证提供 "已存在证据" 但不替代版权登记

我们的处理:
- 合同模板含 `isConditional` 字段
- 下单时弹出"附条件"提示
- 30 天后 admin 录入登记号,所有订单自动 `copyrightEffective=true`

## 4. 安全模型

### 4.1 鉴权

- JWT access token (15 分钟) + refresh token (30 天,存 hash 在 DB,支持撤回)
- 角色: `CREATOR` / `BUYER` / `ADMIN`,`@Roles` 装饰器强制
- 限流: 60 req/min 全局, 5 req/min 登录接口

### 4.2 资产保护

| 层级 | 措施 |
|---|---|
| 缩略图 | 600×600,可见水印 |
| 预览图 | 1024×1024,可见水印,禁右键/拖拽 |
| 完整包 | 私桶,签名 URL 5 分钟过期 |
| LoRA 模型 | 仅 `OFFICIAL_REGISTERED` 订单可见 |
| 视频 | 无下载属性,禁右键/全屏 |

### 4.3 审计

- 所有 admin 操作写 `AuditLog` (actor / action / target / IP)
- 状态机流转必经 `transitionStatus`,自动写日志
- 下载 URL 生成必写 `DownloadGrant`,含 IP/UA

## 5. 性能

| 指标 | 目标 | 实测 (单 ECS) |
|---|---|---|
| 首屏 (LCP) | < 1.5s | ~1.2s |
| IP 列表 API | < 200ms p95 | ~80ms |
| 支付回调 | < 1s | ~300ms (mock) |
| 签名 URL 生成 | < 50ms | ~20ms |
| 并发用户 | 100 同时 | (待压测) |

## 6. 数据模型

详见 `apps/api/prisma/schema.prisma`。11 张表,核心:

- `User` — 创作者/采购方/管理员
- `IpAsset` — IP 主体,带状态机
- `IpFile` — IP 关联文件 (SHA-256 校验)
- `Order` — 订单,带 `copyrightEffective` 字段
- `Contract` — 电子合同
- `BlockchainProof` — 存证记录
- `WatermarkRecord` — 水印记录
- `DownloadGrant` — 下载授权
- `AuditLog` — 全量审计
