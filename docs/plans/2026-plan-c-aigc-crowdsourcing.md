# 方案 C — AIGC 众包公开版 完整落地 Plan

> **文档版本**:v1.0
> **撰写日期**:2026-06-30
> **适用范围**:ibi.ren 平台从"虚拟形象 IP 交易市场"扩展为"AIGC 数字人众包美团"
> **决策状态**:待用户(创始人)签字
> **负责人**:创始人(产品/技术/财务) + Claude(技术架构/AI 实施) + 1 运营 + 1 客服 + 外包设计/前端
> **总周期**:24 周(12 周 MVP + 12 周扩张)
> **总预算**:¥320k(6 个月 burn)

---

## 目录

1. [战略定位](#1-战略定位)
2. [商业模式(详细)](#2-商业模式详细)
3. [产品功能架构](#3-产品功能架构)
4. [技术架构(详细)](#4-技术架构详细)
5. [Prisma 数据模型(完整)](#5-prisma-数据模型完整)
6. [12 周 MVP 计划(逐周)](#6-12-周-mvp-计划逐周)
7. [扩张期 12 周(W13-W24)](#7-扩张期-12-周w13-w24)
8. [团队招聘计划](#8-团队招聘计划)
9. [预算 & 现金流](#9-预算--现金流)
10. [运营计划(营销/获客)](#10-运营计划营销获客)
11. [风险清单 & 应急预案](#11-风险清单--应急预案)
12. [关键 KPI & 决策点](#12-关键-kpi--决策点)
13. [附录:模板与脚本](#13-附录模板与脚本)

---

## 1. 战略定位

### 1.1 一句话定位

**"ibi.ren · AIGC 数字人众包 — 中国 AIGC 营销内容领域的美团"**

买家(品牌方 / 中小广告主 / 内容运营)发包 → 平台匹配创作者 → 创作者在站内 workspace 完成 AIGC 数字人广告 / 短视频 / 直播切片 / 营销海报 → 平台担保交付 → 双方评价。

### 1.2 三个关键差异化(为什么是 ibi.ren 而不是 Fiverr / 猪八戒)

| 差异化 | 来源 | 竞品能否复制 |
|---|---|---|
| **数字人 IP 复用** | ibi.ren 已有 100+ 已确权虚拟形象,创作者可选用 | ❌ 竞品需 5 年沉淀 |
| **版权自动确权** | 已对接区块链时间戳 + 阿里云 OSS | ❌ 需法律/技术双投入 |
| **数字人模型二次授权分账** | IP 所有者可获得二次使用分成 | ❌ 全新商业模式,先发优势 |

### 1.3 业务边界(做 / 不做)

| 做 | 不做 |
|---|---|
| ✅ 数字人广告片发包接单 | ❌ 真人代言 / 影视级拍摄 |
| ✅ AIGC 短视频(抖音 / 视频号 / TikTok) | ❌ 直播代运营 |
| ✅ 数字人直播切片 | ❌ 短视频带货供应链 |
| ✅ 营销海报 / 主视觉设计 | ❌ 大型 KV / 品牌 VI 全案 |
| ✅ 3D 数字人形象定制 | ❌ 复杂 3D 场景建模 |
| ✅ 企业 AIGC 营销内容 API | ❌ C 端 "傻瓜式" 自助生成 |

---

## 2. 商业模式(详细)

### 2.1 三层收入结构

```
年收入结构(预测 2027 年 GMV ¥2,000 万)
┌────────────────────────────────────────────────────────┐
│ L3 数字人 IP 二次授权抽佣 30-50%                       │
│    ¥2,000 万 × 8% IP 二次使用 × 40% 抽佣 = ¥64 万       │
├────────────────────────────────────────────────────────┤
│ L2 履约抽佣 5%(买家付)                                  │
│    ¥2,000 万 × 5% = ¥100 万                             │
├────────────────────────────────────────────────────────┤
│ L1 工具订阅 + 入驻费                                    │
│    创作者 Pro ¥199/月 × 500 人 × 12 月 = ¥120 万        │
│    买家 SaaS ¥999/月 × 50 企业 × 12 月 = ¥60 万         │
│    总 L1: ¥180 万                                       │
├────────────────────────────────────────────────────────┤
│ 年总营收 ¥344 万(占 GMV 17.2%,健康比例)                │
└────────────────────────────────────────────────────────┘
```

### 2.2 创作者分级 & 抽佣阶梯

| 等级 | 准入 | 月成单 | 抽佣 | 工具订阅 |
|---|---|---|---|---|
| **Bronze 新手** | KYC 通过 + 1 个作品审核通过 | 0-5 | 8% | 免费 |
| **Silver 银牌** | Bronze + 累计 10 单 + 评分 ≥4.5 | 6-20 | 6% | Pro ¥199/月 |
| **Gold 金牌** | Silver + 累计 50 单 + 评分 ≥4.8 | 21-50 | 5% | Pro ¥199/月 |
| **Platinum 白金** | Gold + 邀请制 + 标杆案例 | 50+ | 4% | Pro ¥199/月 |

**Why 阶梯**:对标美团商家分级(降抽佣换好商家),Fiverr 单一抽佣导致头部创作者跳单到私域。

### 2.3 买家订阅

| 套餐 | 价格 | 含 |
|---|---|---|
| **Starter** | 免费 | 每月 1 单,基础托管 |
| **Growth** | ¥999/月 | 每月 10 单,数据看板,专属客服 |
| **Enterprise** | ¥4,999/月 | 不限单,API 接入,定制工作流,优先匹配 |

**Why 三档**:对标 Shopify(Starter 免费获客 → 转化 Growth → 锁定 Enterprise),中国 B2B SaaS 已被验证。

### 2.4 数字人 IP 二次授权(独家壁垒)

```
创作者 A 用 ibi.ren 平台数字人 IP #007 制作一条广告片
        ↓ 上架 ibi.ren IP 授权市场
买家 B 想用 #007 制作另一条广告片 → 平台抽 30%
        ↓ 分账:IP 所有者 60% / 创作者 A 10% / 平台 30%
```

**收入公式**:GMV × IP 二次使用率 8% × 抽佣 30% = 平台 ¥24 万/年(基于 GMV ¥1 亿)

### 2.5 不做的商业化(明确拒绝)

- ❌ **广告位**(对标美团 banner,污染用户体验,Fiverr 学过)
- ❌ **搜索竞价排名**(百度死路,猪八戒走过的死路)
- ❌ **创作者培训课**(精力分散,边际收益低)
- ❌ **保险 / 担保金理财**(合规复杂,资金占用大)

---

## 3. 产品功能架构

### 3.1 总体功能地图

```
┌─────────────────────────────────────────────────────────────────┐
│  公开站(主站)                                                   │
│  ├─ 首页(整合 IP 交易 + AIGC 服务入口)                          │
│  ├─ 形象库 /ips            ← 现有(无改动)                       │
│  ├─ AIGC 服务 /studio      ← 新建(本次范围)                     │
│  ├─ 创作者中心 /creator    ← 现有 + 扩展 workspace               │
│  ├─ 买家中心 /buyer        ← 新建                                │
│  ├─ 我的订单 /orders       ← 现有 + 扩展履约                     │
│  ├─ 我的资产 /my-assets    ← 现有 + 扩展版权                     │
│  └─ AI 助手 /assistant     ← 现有(只读)+ 升级 brief Copilot      │
├─────────────────────────────────────────────────────────────────┤
│  后台 admin                                                     │
│  ├─ IP 审核 /ips/queue         ← 现有                            │
│  ├─ 创作者审核 /creator/queue  ← 新建                            │
│  ├─ 订单仲裁 /disputes         ← 新建                            │
│  ├─ 财务对账 /finance          ← 新建                            │
│  ├─ LLM Provider /settings/llm ← 现有                            │
│  └─ 数据看板 /analytics        ← 新建                            │
├─────────────────────────────────────────────────────────────────┤
│  创作者 workspace(站内工作台)                                   │
│  ├─ 我的项目 /workspace/projects                                │
│  ├─ 工具链 /workspace/tools   ← 集成 Sora/可灵/即梦/Runway       │
│  ├─ 资产库 /workspace/assets  ← 我的数字人模型 / Prompt 库       │
│  ├─ 收益 /workspace/earnings                                    │
│  └─ 培训 /workspace/academy  ← 暂缓(W8 后决定)                  │
├─────────────────────────────────────────────────────────────────┤
│  买家端(买家中心)                                               │
│  ├─ 发布需求 /buyer/brief/new                                   │
│  ├─ 进行中订单 /buyer/orders                                    │
│  ├─ 我的数字人 /buyer/my-ips  ← 二次授权入口                     │
│  └─ 数据看板 /buyer/dashboard                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 核心用户旅程

**买家旅程(发包 → 履约 → 交付)**
```
1. 进入 /buyer/brief/new → 选择品类(广告 / 短视频 / 海报...)
2. LLM Copilot 自动拆任务 + 推荐套餐 + 预估价格
3. 选择数字人 IP(可多选)+ 平台(可多选)+ 截止时间
4. 托管支付(Starter 30% / Growth 50% / Enterprise 100%)
5. 平台推送至匹配创作者池(2 小时内响应)
6. 创作者在 workspace 履约 → 中间稿可评论
7. 创作者交付 → 买家验收 → 释放尾款 → 评价
8. 可选:数字人 IP 进入"我的 IP" → 二次授权获分账
```

**创作者旅程(抢单 → 履约 → 收款)**
```
1. KYC + 技能标签认证 → 通过审核
2. 浏览 /creator/briefs → 抢单 / 报价
3. 中标后进入 /workspace/[id] → 调用工具链生成
4. 提交中间稿 → 等待买家反馈 → 修改
5. 交付成片 → 平台担保 → 验收通过 → 收款(到账 1-3 工作日)
6. 累计成单 / 评分 → 自动晋升等级 → 降抽佣
7. 自有数字人模型上架"IP 授权市场" → 长期被动收入
```

---

## 4. 技术架构(详细)

### 4.1 现有技术栈(复用)

| 层 | 技术 | 状态 |
|---|---|---|
| 后端 | NestJS 10 + Prisma 5 + MySQL 8 | ✅ 已有 |
| 前端 | Vue 3 + Vite 6 + Tailwind | ✅ 已有 |
| 对象存储 | 阿里云 OSS(3 buckets) | ✅ 已有 + CORS 已配置 |
| AI Provider | LLM Provider Config(AES-256-GCM 加密) | ✅ 已有 |
| 版权 | 区块链时间戳 + 阿里云 OSS watermark | ✅ 已有 |
| 部署 | ECS + nginx + systemd | ✅ 已有 |

### 4.2 新增技术栈

| 模块 | 技术选型 | 理由 |
|---|---|---|
| **实时 IM** | Socket.IO 4 + Redis 适配器 | 站内私聊强制经平台必备;NestJS Gateway 原生支持 |
| **IM 持久化** | MySQL 表(消息存档 7 年,法务要求) | 不上 MongoDB,统一 MySQL 简化运维 |
| **文件上传/下载** | OSS 临时凭证(STS) | 已有 OSS 经验,创作者 5GB+ 文件直传 |
| **支付** | 数字人民币 + 微信 + 支付宝(三选一) | 已有数字人民币通道;同时支持提现灵活 |
| **后台任务** | Bull 4 + Redis | LLM 报价、视频转码、AI 生成成本核算 |
| **LLM 集成** | 复用现有 LLM Provider Config | 已有 AES 加密,直接调用 |
| **多平台发布 API** | 抖音开放平台 + 视频号助手 + 小红书 + YouTube + TikTok | W4-W6 接入,首期 3 个 |
| **信用分算法** | 自研评分引擎(订单量 × 评分 × 响应率 × 履约率) | 简单线性加权,后期引入 ML |
| **视频转码** | 阿里云媒体处理 MTS | 多平台适配(9:16 / 16:9 / 1:1) |
| **CDN** | 阿里云 CDN(已有) | 创作者成片分发 |
| **监控** | Sentry + Prometheus + Grafana(轻量自建) | 已有 Sentry,补齐 metrics |

### 4.3 服务拆分(微服务 vs 单体决策)

**决策:保持单体,不拆微服务**

**Why**:
- 当前流量 < 100 QPS,单体足够
- 微服务运维成本对单人团队是灾难
- 12 周 MVP 期内微服务是 over-engineering
- **单体内模块边界清晰**,后期流量到 1000+ QPS 再拆(预计 2027 H2)

### 4.4 模块划分(新增)

```
apps/api/src/
├── brief/           # 发包:发布、拆任务、匹配
├── bid/             # 报价:抢单、定向邀请
├── workspace/       # 工作台:工具集成、生成记录
├── deliverable/     # 交付:成片、多平台适配
├── review/          # 评价:评分、信用
├── dispute/         # 仲裁:申诉、平台介入
├── pricing/         # LLM 报价引擎
├── royalty/         # IP 二次授权分账
├── im/              # 站内 IM(Socket.IO Gateway)
├── finance/         # 财务:对账、提现
└── analytics/       # 数据看板

apps/web/src/pages/
├── studio/          # AIGC 服务大厅(新)
├── buyer/           # 买家中心(新)
└── creator/         # 创作者中心(扩展 workspace)

apps/web/src/components/workspace/
├── BriefComposer.vue     # 智能发包(LLM Copilot)
├── BidList.vue           # 创作者看抢单
├── Toolchain.vue         # 工具集成面板
├── AssetLibrary.vue      # 我的资产(数字人 / Prompt)
└── Earnings.vue          # 收益看板
```

### 4.5 关键 API 设计(示例)

```typescript
// POST /api/v1/briefs - 买家发包
{
  category: 'shortvideo',
  title: '晶新 AI 7 月新品发布短视频',
  platformSet: ['douyin', 'xiaohongshu', 'wechat'],
  ipIds: ['ip_007', 'ip_023'],
  budgetMin: 5000,
  budgetMax: 8000,
  packageTier: 'standard',
  deadlineAt: '2026-07-15T18:00:00Z',
  spec: { duration: 30, count: 5, language: 'zh-CN' }
}
// Response: { id, suggestedPrice, matchedCreators: 12 }

// POST /api/v1/bids/:briefId - 创作者报价
{
  price: 6800,
  deliveryDays: 7,
  proposal: '使用可灵 + 即灵双工具链...'
}

// POST /api/v1/workspace/:id/generations - 记录 AI 生成
{
  toolName: 'kling',
  modelName: 'kling-v2',
  prompt: '...',
  outputUrl: 'oss://...',
  costCents: 120,
  durationMs: 45000
}

// POST /api/v1/deliverables - 创作者提交成片
{
  briefId: '...',
  type: 'video',
  platform: 'douyin',
  url: 'oss://...',
  spec: { duration: 30, ratio: '9:16', resolution: '1080p' }
}

// POST /api/v1/disputes - 申诉
{
  briefId: '...',
  reason: 'quality_issue',
  description: '...',
  evidence: ['oss://...']
}
```

---

## 5. Prisma 数据模型(完整)

```prisma
// =========================================================
// 现有表(不改动)略去:
// User / IP / Order / KYC / Copyright / Notification / ...
// =========================================================

// 1. Brief 发包单
model Brief {
  id            String   @id @default(cuid())
  buyerId       String
  title         String
  description   String?  @db.Text
  category      String   // ad / shortvideo / livestream_clip / poster / 3d
  platformSet   Json     // ["douyin","xiaohongshu","wechat",...]
  ipIds         Json     // 选用的虚拟形象 ID 列表
  budgetMin     Decimal  @db.Decimal(10, 2)
  budgetMax     Decimal  @db.Decimal(10, 2)
  packageTier   String   // essential / standard / premium
  deadlineAt    DateTime
  status        String   // draft / bidding / in_progress / delivered / closed / disputed
  spec          Json     // LLM 拆解的详细规格
  attachments   Json?    // 买家上传的参考资料
  estimatedPrice Decimal? @db.Decimal(10, 2)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  buyer         User     @relation("BuyerBriefs", fields: [buyerId], references: [id])
  bids          Bid[]
  workspace     Workspace?
  deliverables  Deliverable[]
  review        Review?
  dispute       Dispute?
  royaltyRecords RoyaltyRecord[]

  @@index([buyerId, status])
  @@index([category, status])
  @@index([createdAt])
}

// 2. SkillTag 技能标签字典
model SkillTag {
  id          String   @id @default(cuid())
  name        String   @unique
  category    String   // video / image / 3d / copywriting / tool
  description String?
  creators    CreatorSkill[]

  @@index([category])
}

// 3. CreatorSkill 创作者技能(多对多)
model CreatorSkill {
  id          String   @id @default(cuid())
  creatorId   String
  skillId     String
  level       Int      // 1-5 评级
  verifiedAt  DateTime?
  certified   Boolean  @default(false)
  portfolioUrl String? // 作品集

  creator     User     @relation(fields: [creatorId], references: [id])
  skill       SkillTag @relation(fields: [skillId], references: [id])

  @@unique([creatorId, skillId])
  @@index([creatorId])
}

// 4. CreatorProfile 创作者档案(扩展 User)
model CreatorProfile {
  id              String   @id @default(cuid())
  userId          String   @unique
  displayName     String
  bio             String?  @db.Text
  avatarUrl       String?
  level           String   @default("bronze") // bronze / silver / gold / platinum
  completedOrders Int      @default(0)
  totalEarnings   Decimal  @default(0) @db.Decimal(12, 2)
  ratingAvg       Float    @default(0)
  ratingCount     Int      @default(0)
  responseRate    Float    @default(0) // 0-1
  fulfillmentRate Float    @default(0) // 0-1
  commissionRate  Float    @default(0.08) // 当前抽佣比例
  proSubscribed   Boolean  @default(false)
  proExpiresAt    DateTime?
  joinedAt        DateTime @default(now())

  user            User     @relation(fields: [userId], references: [id])

  @@index([level, ratingAvg])
  @@index([completedOrders])
}

// 5. Bid 报价 / 抢单
model Bid {
  id           String   @id @default(cuid())
  briefId      String
  creatorId    String
  price        Decimal  @db.Decimal(10, 2)
  deliveryDays Int
  proposal     String   @db.Text
  status       String   @default("pending") // pending / accepted / rejected / withdrawn
  acceptedAt   DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  brief        Brief    @relation(fields: [briefId], references: [id])
  creator      User     @relation("CreatorBids", fields: [creatorId], references: [id])

  @@unique([briefId, creatorId])
  @@index([briefId])
  @@index([creatorId, status])
}

// 6. Workspace 工作台
model Workspace {
  id          String   @id @default(cuid())
  briefId     String   @unique
  creatorId   String
  toolchain   Json     // {sora:true, runway:true, kling:true, ...}
  scripts     Json?    // 分镜脚本
  status      String   @default("active") // active / submitted / approved / revision
  startedAt   DateTime @default(now())
  submittedAt DateTime?
  finishedAt  DateTime?
  revisionCount Int    @default(0)

  brief       Brief    @relation(fields: [briefId], references: [id])
  creator     User     @relation(fields: [creatorId], references: [id])
  generations AIGenerationRecord[]
  messages    WorkspaceMessage[]

  @@index([creatorId, status])
}

// 7. WorkspaceMessage 工作台消息(任务沟通)
model WorkspaceMessage {
  id          String   @id @default(cuid())
  workspaceId String
  fromUserId  String
  content     String   @db.Text
  attachments Json?
  type        String   @default("text") // text / system / file
  createdAt   DateTime @default(now())

  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  from        User      @relation(fields: [fromUserId], references: [id])

  @@index([workspaceId, createdAt])
}

// 8. AIGenerationRecord AI 生成记录
model AIGenerationRecord {
  id          String   @id @default(cuid())
  workspaceId String
  toolName    String   // sora / runway / kling / jimeng / luma / pika / mjvideo / veo
  modelName   String   // 具体模型
  prompt      String   @db.Text
  outputUrl   String?  // 失败的为 null
  costCents   Int      // 创作者实际成本(分)
  durationMs  Int      // 调用耗时
  status      String   // success / failed / timeout
  errorMsg    String?
  createdAt   DateTime @default(now())

  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@index([workspaceId])
  @@index([toolName, createdAt])
}

// 9. Deliverable 成片交付
model Deliverable {
  id          String   @id @default(cuid())
  briefId     String
  workspaceId String
  type        String   // video / image / copy
  platform    String   // douyin / xiaohongshu / wechat / youtube / tiktok / ...
  url         String   // OSS 路径
  thumbnailUrl String?
  spec        Json     // {duration, ratio, resolution, fileSize}
  status      String   @default("pending") // pending / approved / rejected
  approvedAt  DateTime?
  rejectedReason String?
  publishedAt DateTime?
  publishedUrl  String?  // 多平台分发后的实际链接
  createdAt   DateTime @default(now())

  brief       Brief    @relation(fields: [briefId], references: [id])

  @@index([briefId])
  @@index([platform, status])
}

// 10. Review 评价
model Review {
  id          String   @id @default(cuid())
  briefId     String   @unique
  fromUserId  String
  toUserId    String
  role        String   // buyer_to_creator / creator_to_buyer
  rating      Int      // 1-5
  content     String   @db.Text
  tags        Json?    // 标签: ["专业","响应快"]
  createdAt   DateTime @default(now())

  brief       Brief    @relation(fields: [briefId], references: [id])
  from        User     @relation("ReviewFrom", fields: [fromUserId], references: [id])
  to          User     @relation("ReviewTo", fields: [toUserId], references: [id])

  @@index([toUserId])
}

// 11. Dispute 仲裁
model Dispute {
  id          String   @id @default(cuid())
  briefId     String   @unique
  initiatorId String   // buyer / creator
  reason      String   // quality_issue / deadline_miss / scope_change / payment_issue / other
  description String   @db.Text
  evidence    Json     // 证据 OSS URL 列表
  status      String   @default("open") // open / mediating / resolved / closed
  resolution  String?  // refund_full / refund_partial / no_refund / redo
  refundAmount Decimal? @db.Decimal(10, 2)
  mediatorId  String?  // 平台仲裁员
  resolvedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  brief       Brief    @relation(fields: [briefId], references: [id])
  initiator   User     @relation("DisputeInitiator", fields: [initiatorId], references: [id])
  mediator    User?    @relation("DisputeMediator", fields: [mediatorId], references: [id])

  @@index([status])
  @@index([createdAt])
}

// 12. RoyaltyRecord 数字人 IP 二次授权分账记录
model RoyaltyRecord {
  id            String   @id @default(cuid())
  briefId       String
  ipId          String   // 被二次使用的 IP
  originalCreatorId String  // 原始创作者(广告片创作者)
  ipOwnerId     String   // IP 所有者
  buyerId       String   // 二次使用方
  usageType     String   // direct_use / derivative_use
  usageCount    Int      @default(1)
  totalAmount   Decimal  @db.Decimal(10, 2)
  ipOwnerShare  Decimal  @db.Decimal(10, 2)  // 60%
  creatorShare  Decimal  @db.Decimal(10, 2)  // 10%
  platformShare Decimal  @db.Decimal(10, 2)  // 30%
  settledAt     DateTime?
  createdAt     DateTime @default(now())

  brief         Brief    @relation(fields: [briefId], references: [id])
  ip            IP       @relation(fields: [ipId], references: [id])
  originalCreator User   @relation("OriginalCreator", fields: [originalCreatorId], references: [id])
  ipOwner       User     @relation("IPOwner", fields: [ipOwnerId], references: [id])
  buyer         User     @relation("BuyerRoyalty", fields: [buyerId], references: [id])

  @@index([ipId])
  @@index([originalCreatorId])
  @@index([ipOwnerId])
}

// 13. BuyerSubscription 买家订阅
model BuyerSubscription {
  id          String   @id @default(cuid())
  buyerId     String
  plan        String   // starter / growth / enterprise
  priceMonthly Decimal @db.Decimal(10, 2)
  startedAt   DateTime @default(now())
  expiresAt   DateTime
  autoRenew   Boolean  @default(true)
  status      String   @default("active") // active / cancelled / expired

  buyer       User     @relation(fields: [buyerId], references: [id])

  @@index([buyerId, status])
  @@index([expiresAt])
}

// 14. Withdrawal 提现申请
model Withdrawal {
  id          String   @id @default(cuid())
  userId      String
  amount      Decimal  @db.Decimal(10, 2)
  fee         Decimal  @db.Decimal(10, 2)
  netAmount   Decimal  @db.Decimal(10, 2)
  channel     String   // wechat / alipay / digital_rmb / bank
  accountInfo Json     // 收款账号(脱敏)
  status      String   @default("pending") // pending / processing / success / failed
  processedAt DateTime?
  failReason  String?
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id])

  @@index([userId, status])
  @@index([status, createdAt])
}

// 15. PlatformAnalytics 平台数据看板(预聚合)
model PlatformAnalytics {
  id          String   @id @default(cuid())
  date        DateTime @unique @db.Date
  briefsNew   Int      @default(0)
  briefsClosed Int     @default(0)
  gmvCents    BigInt   @default(0)
  commissionCents BigInt @default(0)
  activeBuyers Int     @default(0)
  activeCreators Int   @default(0)
  disputesOpened Int   @default(0)
  disputesResolved Int @default(0)
  avgRating   Float    @default(0)
  createdAt   DateTime @default(now())
}

// =========================================================
// User 表扩展字段(添加到现有 User model)
// =========================================================
// roles               Json  // 加 "CREATOR" 或 "BUYER" 或 "BOTH"
// isCreatorVerified   Boolean @default(false)
// canWithdraw         Boolean @default(false)
// lastActiveAt        DateTime?
```

---

## 6. 12 周 MVP 计划(逐周)

> **关键节点**:W12 公开版上线 + 主站入口开放
> **每周五 review**:KPI 数据 + 风险评估 + 下周调整

### Week 1 — 基础架构(2026-07-01 ~ 07-07)

**目标**:数据库 + 基础模块搭建

**任务清单**:
- [ ] 14 张新表写入 `apps/api/prisma/schema.prisma`,运行 `pnpm exec prisma generate` + `prisma db push`(本地)
- [ ] 部署到 ECS:schema 推送到 RDS,验证无破坏现有数据
- [ ] `brief` 模块:Controller + Service + DTO + 单元测试
- [ ] `bid` 模块:Controller + Service
- [ ] 前端:`/buyer/brief/new` 静态页面 + `/creator/briefs` 静态页面
- [ ] LLM Provider Config 加 3 个 prompt 模板(brief 拆任务 / 报价 / 分类)
- [ ] CI/CD:`pnpm --filter @ibi-ren/api run build` + `pnpm --filter @ibi-ren/web run build` 通过

**验收**:
- `POST /api/v1/briefs` 能创建 + 列表
- `POST /api/v1/bids` 能报价
- 本地 `bash scripts/smoke.sh local` 全绿

**风险**:14 张表改动大,需仔细 review 现有 User 表扩展(`isCreatorVerified` 等)。**应对**:`prisma db push` 前先 backup RDS 一次。

---

### Week 2 — Brief 与 Bid 闭环(2026-07-08 ~ 07-14)

**目标**:买家能完整发包,创作者能抢单

**任务清单**:
- [ ] Brief LLM 自动拆任务(调 LLM Provider Config 已有 LLM)
- [ ] Brief 匹配算法(基于 skill / level / rating / 历史订单)
- [ ] 推送通知:新 brief 推送匹配创作者(站内 + 邮件 + 微信)
- [ ] 创中心页面:`/creator/briefs` 接入真实 API
- [ ] 买家中心页面:`/buyer/brief/new` 接入真实 API
- [ ] 报价倒计时、过期自动 close
- [ ] 客服机器人(常见问题自动回复,简单 NLP)

**验收**:
- 端到端:买家发包 → 3 个创作者收到通知 → 创作者报价 → 买家选择 → 进入 workspace
- LLM 拆任务准确率 ≥70%(内部 5 个测试 brief)

---

### Week 3 — Workspace + 工具集成(2026-07-15 ~ 07-21)

**目标**:创作者能在站内 workspace 调用 AI 工具生成

**任务清单**:
- [ ] Workspace 模块:页面 + 后端
- [ ] 集成 4 个 AI 工具:Sora / 可灵 / 即梦 / Runway(API Key 已申请或 mock)
- [ ] AIGenerationRecord 记录每次调用(成本核算基础)
- [ ] 我的资产:创作者上传自有数字人模型 / Prompt 模板
- [ ] 工具链选择面板(UI):勾选可用工具 + 显示成本预估
- [ ] 中间稿上传:创作者上传过程稿,买家评论

**验收**:
- 创作者在 workspace 输入 prompt → 调用 Sora 生成视频 → 记录成本 → 上传中间稿
- 买家在 workspace 看到中间稿 + 评论

**风险**:4 个工具 API Key 申请可能慢,**应对**:每个工具先用 mock 数据,真实 Key 到位后切换。

---

### Week 4 — 多平台适配(2026-07-22 ~ 07-28)

**目标**:成片能自动适配 + 发布到 3 个平台(抖音 / 视频号 / 小红书)

**任务清单**:
- [ ] Deliverable 模块
- [ ] 阿里云媒体处理 MTS:9:16 / 16:9 / 1:1 自动转码
- [ ] 抖音开放平台 API 接入(发布视频)
- [ ] 视频号助手 API 接入
- [ ] 小红书蒲公英 API 接入
- [ ] 发布状态同步:pending → uploading → published / failed
- [ ] 买家工作台:看到所有发布链接

**验收**:
- 创作者交付一条 16:9 视频 → 平台自动转 9:16 + 1:1 → 推送抖音 / 视频号 / 小红书 → 3 个平台都返回成功

**风险**:平台 API 申请周期长,首期只接 3 个(YouTube / TikTok / Instagram 等 W6 再说)。

---

### Week 5 — LLM 报价引擎 + 评价(2026-07-29 ~ 08-04)

**目标**:买家发包 30 秒拿到预估报价

**任务清单**:
- [ ] pricing 模块:LLM 拆任务 + 估工时 + 推荐套餐
- [ ] 复用 `/Users/app/Ads` 的 brief 模板(14 类目)作为 LLM prompt 上下文
- [ ] Review 模块:买家给创作者评分 + 创作者给买家评分
- [ ] 信用分算法 v1:线性加权(订单量 × 评分 × 响应率 × 履约率)
- [ ] 创作者主页:`/u/[id]/creator` 展示等级 + 评分 + 作品

**验收**:
- 买家发包 30 秒内看到 3 档推荐价格 + 匹配创作者列表
- 完成订单后双方可评价
- 创作者主页实时显示信用分

---

### Week 6 — 站内 IM + 私聊强制(2026-08-05 ~ 08-11)

**目标**:站内私聊闭环,防跳单

**任务清单**:
- [ ] im 模块:Socket.IO Gateway + NestJS
- [ ] MySQL 消息存档(7 年合规)
- [ ] IM UI:买家 ↔ 创作者 ↔ 平台客服
- [ ] 用户协议 v2:加入"站内交易唯一性"条款
- [ ] 跳单检测:IM 中识别关键金额 / 支付宝号 / 微信号 → 触发审核
- [ ] 违规处理:5 倍罚款 + 永久封号流程

**验收**:
- 买家 ↔ 创作者在 IM 沟通需求
- IM 中提到"加微信 ¥5000" → 系统识别并警告
- 协议版本所有用户强制同意

**风险**:**法务审核**,协议条款要专业律师看一眼。**应对**:第 1 周就找律师,不卡上线。

---

### Week 7 — 仲裁 + 财务(2026-08-12 ~ 08-18)

**目标**:纠纷处理 + 资金流闭环

**任务清单**:
- [ ] Dispute 模块:申诉 → 平台介入 → 判定 → 退款 / 重做
- [ ] admin 后台:`/disputes` 仲裁工作台
- [ ] 财务模块:对账 + 提现
- [ ] 接入数字人民币(已有)+ 微信 + 支付宝(三选一)
- [ ] 托管支付:买家付全款 → 平台托管 → 验收通过 → 创作者收款
- [ ] 提现审核:大额(>¥5000)人工审核,小额自动到账

**验收**:
- 买家申诉"质量不达标" → 平台 48 小时介入 → 判定退款 50%
- 创作者提现 ¥1000 → 微信零钱自动到账
- 财务对账日报:GMV / 抽佣 / IP 分账 / 提现 四项总和匹配

---

### Week 8 — IP 二次授权 + 后台(2026-08-19 ~ 08-25)

**目标**:独家壁垒落地,admin 后台可用

**任务清单**:
- [ ] royalty 模块:数字人 IP 二次授权分账
- [ ] IP 授权市场页面:`/ips/licensing`(买家可浏览可用 IP + 申请使用)
- [ ] admin 后台:`/creator/queue`(创作者审核)+ `/disputes`(仲裁)+ `/finance`(对账)+ `/analytics`(看板)
- [ ] 创作者等级自动晋升逻辑(Bronze → Silver → Gold)
- [ ] 抽佣自动按等级调整

**验收**:
- 数字人 IP #007 被两条广告片使用 → 平台自动分账(原创者 10% / IP 所有者 60% / 平台 30%)
- admin 后台能看到全部数据

---

### Week 9 — 内测 + 营销站(2026-08-26 ~ 09-01)

**目标**:50 创作者 + 30 买家内测,营销站上线

**任务清单**:
- [ ] 招募 50 创作者:从 ibi.ren 现有用户转化 + 朋友圈招募
- [ ] 招募 30 买家:从晶新 AI 等现有客户转化 + 行业群
- [ ] 营销站:`/studio` 介绍页 + 创作者招募 + 买家招募
- [ ] 文档中心:`/guide/creator-studio` + `/guide/buyer-studio`
- [ ] 客服系统:智齿 / 美洽 / 自建(对比后选)
- [ ] 数据埋点:GA4 + 神策(国内合规)

**验收**:
- 50 创作者全部完成入驻 + 技能认证
- 30 买家全部完成企业认证 + 发布过至少 1 个 brief

---

### Week 10 — 内测优化(2026-09-02 ~ 09-08)

**目标**:解决内测反馈 + 关键 bug

**任务清单**:
- [ ] 收集 100 个用户反馈,优先级排序
- [ ] 修复 P0/P1 bug(预估 30 个)
- [ ] LLM 报价准确率优化(从 70% → 85%)
- [ ] 创作者分级算法调整
- [ ] 性能优化:Lighthouse ≥80

**验收**:
- P0/P1 bug 全部修复
- 内测 NPS ≥30(可用即可)

**风险**:内测反馈可能暴露出架构问题。**应对**:每天 review 反馈,严重问题立即停其他工作修。

---

### Week 11 — 公测准备(2026-09-09 ~ 09-15)

**目标**:为公开版上线做准备

**任务清单**:
- [ ] 开放 100 创作者 + 50 买家公测
- [ ] KYC + 实名认证流程压力测试
- [ ] 客服 24h 待命
- [ ] 数据看板实时监控(Grafana)
- [ ] 法律合规:广告法 / 数字人标识 / 隐私政策 / 用户协议终版
- [ ] 应急响应 SOP:创作者刷单 / 买家恶意违约 / 平台宕机

**验收**:
- 公测 100 创作者日活 ≥40
- 公测 50 买家日活 ≥15
- 客服平均响应 <30 分钟

---

### Week 12 — 公开版上线(2026-09-16 ~ 09-22)

**目标**:主站入口开放 + 媒体发布

**任务清单**:
- [ ] 主站顶栏加 "AIGC 服务" 入口
- [ ] 首页 banner 改:突出"数字人众包"
- [ ] 媒体发稿:36Kr / 虎嗅 / 量子位(创始人 CEO 出面)
- [ ] 创作者大会(线上直播):宣布平台上线
- [ ] GMV 目标 W12 末 ¥100 万(月度)
- [ ] 准备扩张期预算

**验收**:
- 主站日 PV ≥10 万(从当前 1k 提升 100x)
- 公开版上线当天 500+ 创作者注册
- W12 末 GMV ¥10 万(首周)

---

## 7. 扩张期 12 周(W13-W24)

> 目标:GMV 从 ¥10 万 → ¥100 万/月,创作者从 500 → 3000,买家从 200 → 1000

### 三个阶段

**W13-W16:横向扩张品类**
- 新增 3 个品类:3D 数字人定制 / 直播切片 / 营销海报
- 多平台扩到 9 个(YouTube / TikTok / Instagram 加入)
- 类目横向 = GMV 翻倍

**W17-W20:纵向深耕**
- Enterprise 套餐:大客户定制(API 接入 / 私有部署 / 专属对接)
- 标杆案例包装:每 2 周 1 个客户案例(博客 + 视频 + 案例库)
- 内容营销:Sora / 可灵 教程 + 数字人广告创意奖项

**W21-W24:壁垒加固**
- 数字人 IP 二次授权市场 GMV 占 15%
- 创作者分层:白金 50 人 + 金牌 200 人
- 数据资产:平台积累 5000+ 真实广告片(训练自有 AIGC 模型的基础)

### W24 末 KPI 验收
- 月 GMV ≥¥100 万
- 月活创作者 ≥800
- 月活买家 ≥300
- 平台月营收 ≥¥17 万(L1+L2)
- NPS ≥40

---

## 8. 团队招聘计划

### 8.1 当前团队

| 角色 | 状态 |
|---|---|
| 创始人(产品 / 技术 / 财务) | ✅ 1 人(你) |
| AI 工程师(Claude / 我) | ✅ |
| 运营 | ❌ |
| 客服 | ❌ |
| 前端 | ❌ |
| 设计 | ❌ |

### 8.2 招聘时间线

| 时间 | 招聘 | 月薪 | 来源 |
|---|---|---|---|
| **W1(7月第1周)** | **运营经理**(全职) | ¥12k-15k | boss 直聘 / 拉勾 |
| **W3(7月第3周)** | **客服专员**(全职) | ¥7k-9k | boss 直聘 |
| **W5(8月第1周)** | **前端开发**(外包) | ¥15k/月 | 程序员客栈 / 兼职 |
| **W5(8月第1周)** | **设计师**(兼职) | ¥8k/月 | 站酷 / 猪八戒(只用人才库) |
| **W9(9月第1周)** | **运营专员 x2**(全职) | ¥8k x 2 | 校园招聘 + boss 直聘 |
| **W12(9月第4周)** | **法务顾问**(兼职) | ¥5k/月 | 法律公司外包 |

### 8.3 关键岗位职责

**运营经理**(W1 到位)
- 创作者社区运营(招募 / 培训 / 留存)
- 买家 BD(企业客户 / 行业群)
- 活动策划(创作者大赛 / 案例营销)
- 数据周报(用户行为 / GMV / 留存)

**客服专员**(W3 到位)
- IM 在线客服(工作时间 10:00-22:00)
- 仲裁处置
- FAQ 整理
- 用户反馈汇总

**前端开发**(外包)
- workspace UI 实现
- IM 前端实现
- 买家 / 创作者中心页面

**设计师**(兼职)
- 营销物料(banner / 海报 / 视频)
- workspace UI 优化
- 品牌设计

### 8.4 招聘总成本估算(6 个月)

| 岗位 | 月薪 | 6 个月成本 | 备注 |
|---|---|---|---|
| 运营经理 | ¥13k | ¥78k | |
| 客服专员 | ¥8k | ¥48k | |
| 前端外包 | ¥15k | ¥90k | |
| 设计师兼职 | ¥8k | ¥48k | |
| 运营专员 x2 | ¥8k x 2 = ¥16k | ¥48k(W9 开始) | |
| 法务顾问 | ¥5k | ¥20k(W12 开始) | |
| **人力小计** | | **¥332k** | |

---

## 9. 预算 & 现金流

### 9.1 月度成本结构

| 项 | 月度 | 6 个月 |
|---|---|---|
| **人力** | ¥55k → ¥62k(扩张期) | ¥332k |
| **LLM API 成本**(买家 LLM Copilot + 创作者工具) | ¥5k → ¥15k | ¥60k |
| **OSS / CDN / 短信 / 邮件** | ¥2k → ¥4k | ¥18k |
| **多平台 API 调用费**(抖音 / 视频号等) | ¥3k | ¥18k |
| **阿里云 MTS 转码** | ¥2k → ¥5k | ¥21k |
| **客服系统**(智齿 SaaS) | ¥1k | ¥6k |
| **营销推广**(SEM / KOL / 活动) | ¥20k → ¥40k | ¥180k |
| **杂项**(办公 / 差旅 / 法务) | ¥5k | ¥30k |
| **小计** | **¥93k → ¥134k** | **¥665k** |

### 9.2 收入预测(保守)

| 月 | GMV | L1 订阅 | L2 抽佣 | L3 IP | 月营收 |
|---|---|---|---|---|---|
| W1-W4 | 0(开发) | 0 | 0 | 0 | 0 |
| W5-W8 | 0(开发) | 0 | 0 | 0 | 0 |
| W9(内测) | ¥2 万 | 0 | 0 | 0 | 0 |
| W10 | ¥5 万 | ¥2k | ¥2.5k | 0 | ¥4.5k |
| W11 | ¥8 万 | ¥5k | ¥4k | 0 | ¥9k |
| W12 | ¥10 万 | ¥8k | ¥5k | ¥1k | ¥14k |
| W13-W16 | ¥15-20 万/月 | ¥10k | ¥10k | ¥2k | ¥22k |
| W17-W20 | ¥30-50 万/月 | ¥15k | ¥20k | ¥5k | ¥40k |
| W21-W24 | ¥80-100 万/月 | ¥25k | ¥50k | ¥10k | ¥85k |
| **6 个月总计** | **¥900 万 GMV** | | | | **¥450 万营收** |

### 9.3 资金需求

**保守方案**:第 1 个月起每月烧 ¥100k,6 个月总 burn ¥600k。
**你的现有现金**?(待你提供)
**建议**:准备 ¥600k 现金(¥400k 自有 + ¥200k 天使或借款)。

**Why ¥600k**:即使 W12 后 GMV 跑通到 ¥10 万/月,营收仅 ¥14k/月,覆盖不了 ¥130k 月成本,需继续烧到 W20(W17-W20 营收 ¥40k/月,接近盈亏平衡)。W24 月营收 ¥85k,接近覆盖运营成本(¥130k)。

### 9.4 盈亏平衡预测

**盈亏平衡点**:W26(2027 年 1 月)左右,前提:
- W24 月 GMV ¥100 万
- L1+L2+L3 月营收 ¥100k
- 人力成本稳定在 ¥130k/月
- 创始人可全职投入(无收入)

**为何 6 个月内盈亏平衡?**:对标 Fiverr(2010 年成立,2014 年盈利,4 年)和美团(2010,2015 盈亏平衡,5 年)。AIGC 行业爆发期 + 平台 + 美团位置真空 → 速度比 Fiverr 快 2x,**2-3 年内可盈利**(待验证)。

---

## 10. 运营计划(营销 / 获客)

### 10.1 创作者获取(冷启动 50 → 500 → 3000)

**Phase 1 (W9-W12,目标 500)**
- 现有 ibi.ren 100+ 创作者全部转化(已有版权意识)
- 朋友圈 / 微博 / X 发"首批创作者招募"
- 5 个 AIGC 垂直社群(抖音 AI 工具交流群 / Sora 中国用户群 / ...)
- 创作者推荐奖励:邀请 1 个创作者奖励 ¥200
- **目标**:W12 末 500 创作者

**Phase 2 (W13-W20,目标 1500)**
- 标杆案例包装 + 创作者专访
- 创作者大会(线下,北京 / 上海 / 深圳)
- 与 AIGC 工具厂商合作(可灵 / 即梦 推荐创作者)
- **目标**:W20 末 1500 创作者

**Phase 3 (W21-W24,目标 3000)**
- 内容营销(短视频教程)
- 行业奖项(年度最佳 AIGC 数字人创作者)
- 入驻渠道(猪八戒挖角 / Upwork 中国创作者迁移)
- **目标**:W24 末 3000 创作者

### 10.2 买家获取

**Phase 1 (W9-W12,目标 200)**
- 现有 ibi.ren 客户(晶新 AI 等 30 个)转化
- 创始人个人 BD(30 个行业群投放)
- **目标**:W12 末 200 买家

**Phase 2-W3 同理,目标 1000 买家**

### 10.3 媒体 & 品牌

- W12 公开版上线:36Kr / 虎嗅 / 量子位同步发稿
- 创始人 CEO 出面讲故事(AI 时代美团 / 数字人众包赛道)
- 季度行业报告(发布"中国 AIGC 营销内容市场报告")
- 行业大会赞助(全球数字商业创新大会等)

### 10.4 内容营销

| 渠道 | 内容 | 频次 |
|---|---|---|
| 公众号 / 视频号 | 行业洞察 + 客户案例 | 2 篇/周 |
| B站 | 创作者教程 + 工具评测 | 1 条/周 |
| 小红书 | 数字人广告创意 | 3 条/周 |
| 抖音 | 创作者故事 + 案例 | 5 条/周 |
| 知乎 | 长文深度分析 | 1 篇/月 |
| X(海外) | 英文案例 + 国际 AIGC 趋势 | 3 条/周 |

---

## 11. 风险清单 & 应急预案

### 11.1 P0 级风险(可能让项目死)

| 风险 | 概率 | 影响 | 应急预案 |
|---|---|---|---|
| **客服崩盘**(创作者投诉处理不及时) | 高 | 创作者流失,口碑崩 | W3 就招客服;先做 FAQ + 智齿机器人;承诺 2h 响应 |
| **买家跑单 / 恶意违约** | 中 | 创作者亏时间 | 托管支付 + 履约保证金(创作者预交 ¥500);黑名单 |
| **创作者刷单 / 虚假交付** | 中 | 买家体验崩 | AI 内容检测(原创度 / 重复率);抽查 10% 订单人工审核 |
| **AI 工具涨价**(Sora / Runway 提价) | 高 | 创作者成本上升 | 多供应商备份(同时支持 4 个工具);合同约定成本传导 |
| **数字人广告法律风险**(广告法 / 隐私) | 中 | 平台被处罚 | 法务审核(W12 前);数字人必须打"AI 生成"标识 |
| **主站 IP 交易市场被拖累**(精力分散) | 高 | 老业务下滑 | 严格 W12 之前不动主站;团队分工(创始人 50% 主站 50% AIGC) |

### 11.2 P1 级风险

| 风险 | 应急预案 |
|---|---|
| **多平台 API 申请失败** | 首期只接 3 个;走人工上传 |
| **LLM 报价准确率低** | 持续优化 prompt;首期内测手工报价兜底 |
| **创作者分级算法被吐槽** | 透明规则 + 申诉通道;季度调整 |
| **资金链断裂** | W12 末若 GMV <¥5 万,启动应急:收缩人员 + 找天使 |
| **团队招聘慢** | 提前 W1 投 boss 直聘;W2 面试 W3 入职 |

### 11.3 P2 级风险

- 监管政策变化(数字人广告专项法规)
- 竞品跟进(Fiverr / 猪八戒 转型 AIGC)
- 国际形势(中美 AI 工具脱钩)

---

## 12. 关键 KPI & 决策点

### 12.1 每周 Review KPI

| 类别 | KPI | W12 目标 |
|---|---|---|
| **流量** | 主站日 PV | ≥10 万 |
| **用户** | 注册创作者 | ≥500 |
| | 注册买家 | ≥200 |
| **交易** | 月 GMV | ≥¥10 万 |
| | 完成订单数 | ≥50 单 |
| | 平均订单金额 | ≥¥2000 |
| **质量** | 创作者平均评分 | ≥4.5 |
| | 买家复购率 | ≥30% |
| | 投诉率 | ≤5% |
| **财务** | 平台月营收 | ≥¥14k |
| | 抽佣到账率 | ≥95% |
| **运营** | 客服平均响应 | ≤30 分钟 |
| | IM 日活 | ≥100 |

### 12.2 四个关键决策点

**决策点 1(W4 末):"基础架构 OK 吗?"**
- 通过:继续 W5
- 不通过:再延期 2 周,但不超过 W6
- 终止条件:核心模块崩溃超过 1 周

**决策点 2(W8 末):"内测值得做吗?"**
- 通过:内测 50 创作者 + 30 买家(W9)
- 不通过:缩减到 20 + 10,先验证模型
- 终止条件:创作者 / 买家任一方招募 <10

**决策点 3(W12 末):"公开版上线?"**
- 通过:全量上线,启动媒体营销
- 不通过:延长内测到 W16,不上媒体
- 终止条件:W12 末 GMV <¥5 万

**决策点 4(W20 末):"扩张 / 收缩 / 转型?"**
- GMV ≥¥30 万/月 → 招 1 运营 + 1 客服,加速扩张
- GMV ¥10-30 万/月 → 维持现状,优化
- GMV <¥10 万/月 → 收缩到 2 人,找原因
- 连续 2 月 GMV <¥5 万 → **终止项目,主站回归**

### 12.3 失败模式预设

**失败模式 A:创作者不来**
- 现象:W9 内测招募 <20
- 原因:竞品已建立池子 / 创作者不信任平台
- 应对:提高创作者补贴(前 10 单 0 抽佣)+ 创始人个人 IP 邀请

**失败模式 B:买家不来**
- 现象:W9 内测招募 <10
- 原因:价格没优势 / 担心质量
- 应对:首单 50% 折扣 + 标杆案例包装

**失败模式 C:履约崩盘**
- 现象:投诉率 >20%
- 原因:创作者质量差 / 客服不到位
- 应对:暂停接单 + 创作者淘汰 + 客服扩招

**失败模式 D:资金断裂**
- 现象:现金 <¥200k
- 应对:收缩团队(留 1 运营)+ 找天使 + 主站回血

---

## 13. 附录:模板与脚本

### 13.1 实施检查清单(总)

**W1 前必做**:
- [ ] 用户签字确认方案 C
- [ ] 招聘运营经理(jd 已写好,W1 入职)
- [ ] 法务顾问签约(广告法 + 用户协议)
- [ ] 资金准备 ¥600k 到账
- [ ] 阿里云账号开通 MTS / 媒体处理
- [ ] 多平台 API 申请(抖音 / 视频号 / 小红书)

**W12 末必做**:
- [ ] 备份策略(数据库每日 + OSS 文件每周)
- [ ] Sentry 监控配置
- [ ] Grafana 看板
- [ ] 客服 SOP 文档
- [ ] 应急响应 SOP

### 13.2 文档链接(待创建)

- [ ] Prisma Schema 完整版:`apps/api/prisma/schema.prisma`
- [ ] API 文档(Swagger):`/api/docs`
- [ ] 创作者指南:`/guide/creator-studio`
- [ ] 买家指南:`/guide/buyer-studio`
- [ ] 客服 SOP:`docs/customer-service-sop.md`
- [ ] 法务文档:用户协议 v2 / 隐私政策 v2 / 数字人广告合规指南
- [ ] 应急响应 SOP:`docs/incident-response.md`

### 13.3 关键脚本(待写)

- `scripts/seed-creators.ts`:批量导入 50 个种子创作者
- `scripts/seed-buyer-templates.ts`:14 个 brief 模板
- `scripts/setup-mts-cors.mjs`:阿里云 MTS 配置
- `scripts/setup-multi-platform.mjs`:多平台 API 配置
- `scripts/monthly-analytics.ts`:月度数据报表
- `scripts/dispute-stats.ts`:仲裁数据周报

---

## 签字栏

| 角色 | 姓名 | 日期 | 签字 |
|---|---|---|---|
| 创始人 / CEO | 李浩 | 2026-07-01 | ☐ |
| AI 架构师 | Claude | 2026-07-01 | ✅ |
| 运营经理(待招) | ___ | ___ | ☐ |
| 法务顾问(待招) | ___ | ___ | ☐ |

---

**Plan 版本**:v1.0
**最后更新**:2026-06-30
**下次 Review**:W1 末(2026-07-07)
**维护人**:Claude
**归档**:`docs/plans/2026-plan-c-aigc-crowdsourcing.md`

---

> **致创始人**:这份 Plan 是 24 周的"作战地图",不是"路线图"。**每周末 Review KPI,每月末 Review 决策点**,有偏离就调整。**最大的风险不是市场,是精力分散** —— 主站 + AIGC 双线作战,请 W1 就把运营招到位,让自己专注产品和战略。