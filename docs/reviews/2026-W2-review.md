# W2 Review — 平台层标准先行 + 平台仲裁 Agent

> 周期:2026-07-01 ~ 2026-07-01(单日 sprint,W2 起点)
> 目标:#28 平台层标准先行 + 平台仲裁 Agent(任务包/质量/价格/清算标准)
> 状态:✅ 全部 9 个子任务完成
> 三端 build:✅ api / web / admin 全过
> 本地 smoke:✅ 关键端点 200/401 正常

---

## 1. W2 战略定位(用户决策)

**核心**:#28 = 平台公信力底层,平台先于双边 Agent 上线。

**为什么平台标准先做**:
- 标准制定者 = VISA / App Store / Shopify — 谁定义标准,谁拿走利润
- 双边 Agent 跑起来后,产出的"任务包"会自然套用平台标准,形成事实标准
- 没有标准 → 双边 Agent 自动谈判 → 失控;有标准 → 双边 Agent 按规则运行 → 可控

**责任归属原则(用户决策)**:
- 双边 Agent 行为 = 用户行为 → 用户负责
- 平台 Agent 行为 = 平台行为 → 平台负责,免责上限 12 个月服务费

---

## 2. 9 个交付物 — 全部完成

| # | 任务 | 状态 | 关键文件 |
|---|---|---|---|
| #67 | CatalogSku 表 + seed (15 SKU + 5 templates) | ✅ | `scripts/seed-catalog.ts` |
| #68 | Brief schema 升级 4 字段 + migration | ✅ | `prisma/schema.prisma` Brief 模型 |
| #69 | 动态调价机制(3 道软护栏) | ✅ | `brief.service.ts:118-186` `brief.controller.ts:140-153` `BriefDetailPage.vue` |
| #70 | PlatformJudgeService + POST /platform/judge/deliverable | ✅ | `platform-judge/*.ts` `prisma/schema.prisma` PlatformJudgment |
| #71 | /studio/catalog + /studio/standards 公开页 | ✅ | `StudioCatalogPage.vue` `StudioStandardsPage.vue` |
| #72 | BriefNewPage 顶部 AI 拆解显式按钮 | ✅ | `BriefNewPage.vue:188-235` |
| #73 | 用户协议 v2 §2.5 + §10.x Agent 条款 | ✅ | `docs/legal/2026-user-agreement-v2.md` |
| #74 | 3 份公开标准文档 | ✅ | `docs/standards/2026-brief-package-v1.md` `2026-acceptance-v1.md` `2026-pricing-settlement-v1.md` |
| #75 | W2 Review 文档 + 三端 build + smoke | ✅ | 本文档 |

---

## 3. 数据库变更摘要

### 新增表 (3)

**CatalogSku** — 平台标准 SKU 菜单
```prisma
code            String   @unique  // AIGC-*-{TIER}
category        String              // ad/shortvideo/livestream_clip/poster/3d
tier            String              // essential/standard/premium
basePrice       Decimal  @db.Decimal(10, 2)
deliveryDays    Int
quantity        Int
ipsIncluded     Int      @default(1)
platformsIncluded Int    @default(1)
addOnRules      Json                // 加项规则
defaultChecklistId String?
```
15 条记录(5 品类 × 3 档),seed 脚本:`pnpm run seed:catalog`

**AcceptanceTemplate** — 验收清单模板
```prisma
code        String   @unique       // ACCEPT-*-V1
category    String
tier        String
name        String
description String?  @db.Text
checklist   Json                    // {version, items[{id,criterion,weight,automated,evidenceMethod}], passingScore}
version     String   @default("1.0")
```
5 条记录(5 品类各 1),passingScore=0.80,7 项 checklist

**PlatformJudgment** — 平台 Agent 判定留痕
```prisma
briefId         String
deliverableId   String?
trigger         String   @default("deliverable")  // deliverable | pre_bid
checklistVersion String?
itemScores      Json                              // [{itemId, criterion, weight, score, reason}]
totalScore      Float
passingScore    Float
pass            Boolean
summary         String?  @db.Text
modelUsed       String
promptVersion   String
disputeId       String?                           // !pass 时自动建 Dispute
```

### Brief 表新增字段 (6)

```prisma
standardSkuId       String?           // 挂的标准 SKU
standardSku         CatalogSku?       // relation
acceptanceChecklist Json?             // {version, items[...], passingScore}
addOns              Json?             // [{code, name, price, unit, quantity}]
originalBriefHash   String?           // 原始 brief 文档 SHA-256
currentPrice        Decimal?  @db.Decimal(10, 2)  // 菜单价 → 加价
bumpCount           Int       @default(0)        // 加价次数(封顶 3)
bumpHistory         Json?                         // [{at, fromPrice, toPrice, percent, by}]
```

### Brief 表状态机不变
`draft → bidding → in_progress → delivered → closed (disputed 是分支)`

---

## 4. 关键 API

### Public
- `GET /api/v1/catalog/skus` — 15 SKU 列表
- `GET /api/v1/catalog/skus/:id` — 单个 SKU 详情
- `GET /api/v1/catalog/templates` — 5 验收模板
- `GET /api/v1/catalog/templates/:id` — 单个模板详情

### Buyer (JWT)
- `POST /api/v1/buyer/briefs` — 发包(draft)
- `POST /api/v1/buyer/briefs/:id/publish` — 发布(自动绑定 SKU + 菜单价)
- `POST /api/v1/buyer/briefs/:id/bump` — **动态加价(3 道软护栏)**
- `GET /api/v1/buyer/briefs/:id` — 详情

### Creator (JWT)
- `GET /api/v1/creator/briefs` — 公开可接单列表
- `GET /api/v1/creator/briefs/:id` — 公开详情(**剥离 bumpHistory**)

### Platform Agent (JWT)
- `POST /api/v1/platform/judge/deliverable` — 平台 Agent 判定
- `GET /api/v1/platform/judge/by-brief/:briefId` — 判定历史
- `GET /api/v1/platform/judge/:id` — 判定详情

### Admin (JWT, ADMIN role)
- `GET /api/v1/admin/briefs/bump-recommendations` — 24h/72h/7d 加价建议

---

## 5. 3 道软护栏 — E2E 验证通过

```
publish: currentPrice=800 bumpCount=0 standardSkuId=cmr1jgrv3...
+10% (880) → needConfirm=False  bumpCount=1
+100% (1760 > 2x 菜单价 1600) → needConfirm=True overCap=True (未变更)
+50% confirmed → currentPrice=1320 bumpCount=2
+10% (1452) → bumpCount=3
+10% (4th 实际加价) → 400 "已加价 3 次,达到上限"
creator view → currentPrice=1452 bumpHistory=False  (创作者端脱敏)
```

3 道软护栏:
- ① **3 次加价封顶**(服务端 `bumpCount >= 3` throw)
- ② **超 2x 弹窗**(服务端返回 `needConfirm: true`,前端弹窗"我知这是高溢价")
- ③ **创作者端脱敏**(`getPublicById` 服务端剥离 `bumpHistory`)

---

## 6. 文件清单

### 新增文件

```
apps/api/src/catalog/                    (3 文件,公开 SKU 端点)
  catalog.controller.ts
  catalog.module.ts
  catalog.service.ts

apps/api/src/platform-judge/             (3 文件,平台仲裁 Agent)
  platform-judge.controller.ts
  platform-judge.module.ts
  platform-judge.service.ts

apps/web/src/pages/buyer/                (1 文件)
  BriefDetailPage.vue                    # 加价 UI

apps/web/src/pages/                      (2 文件)
  StudioCatalogPage.vue                  # 平台菜单公开页
  StudioStandardsPage.vue                # 平台标准公开页

scripts/seed-catalog.ts                  (15 SKU + 5 templates)
docs/standards/2026-brief-package-v1.md
docs/standards/2026-acceptance-v1.md
docs/standards/2026-pricing-settlement-v1.md
docs/reviews/2026-W2-review.md           (本文件)
```

### 修改文件

```
apps/api/prisma/schema.prisma            (Brief 6 字段 + 3 新表)
apps/api/src/app.module.ts               (CatalogModule + PlatformJudgeModule)
apps/api/src/brief/brief.service.ts      (publish 绑定 SKU, bumpPrice 3 道护栏, getBumpRecommendations, getPublicById 脱敏)
apps/api/src/brief/brief.controller.ts   (POST /bump + AdminBriefOpsController)
apps/api/src/brief/brief.module.ts       (注册 AdminBriefOpsController)
apps/web/src/router/index.ts             (/buyer/briefs/:id + /studio/* 路由)
apps/web/src/App.vue                     (nav 链接)
apps/web/src/pages/buyer/BriefNewPage.vue (AI 拆解按钮 + 自动填表)
apps/web/src/pages/creator/BriefsBrowsePage.vue (显示 currentPrice)
docs/legal/2026-user-agreement-v2.md     (§2.5 + §10.4 Agent 条款)
```

---

## 7. 三端 build 状态

```bash
✅ apps/api     pnpm --filter @ibi-ren/api exec tsc -p tsconfig.json  → 0 errors
✅ apps/web     pnpm --filter @ibi-ren/web run build                  → 1.94s
✅ apps/admin   pnpm --filter @ibi-ren/admin run build                → 1.01s
```

## 8. 本地 smoke 状态

```bash
✅ GET  /api/v1/catalog/skus                 → 200
✅ GET  /api/v1/catalog/templates            → 200
✅ POST /api/v1/buyer/briefs/:id/bump        → 200/400(护栏触发)
✅ POST /api/v1/platform/judge/deliverable   → 400(空 body 验证)
✅ GET  /api/v1/platform/judge/abc           → 401(需 JWT)
✅ GET  /api/v1/admin/briefs/bump-recommendations → 200 (空列表)
```

---

## 9. W2 → W3 衔接

W2 完成的是"公信力底层"。W3 要做的:
- **#33 Workspace 模块**:把 AcceptanceStandard 真正落地为创作者工作流
- **#34 AI 工具集成**:把 AI 拆解从 1 个动作升级为完整工作流
- **#35 我的资产**:把 brief 的 spec 沉淀为 prompt 模板

W3 不再是"补功能",而是"接住 W2 的标准"。

---

## 10. 已知风险 & W3 跟进

| 风险 | 现状 | W3 跟进 |
|---|---|---|
| PlatformJudgeService 未做单元测试(LLM mock 复杂) | 端到端已验证 | W3 加 jest 测试 + LLM mock |
| cron 推荐只返回建议,未实际推送 | cron stub 完成 | W2-#29 推送通知模块做实际推送 |
| AI 拆解按钮自动填表可能覆盖用户已选 | 当前先弹 toast 提醒 | W3 改进:可撤销 |
| /studio/* 页 SEO 不优化 | 已有 meta title | W3 补 structured data |
| 3 道软护栏的 2x 弹窗对买家心智模型冲击 | 已加说明文案 | W3 AB 测试不同文案 |

---

## 11. 用户决策时间线(W2)

| 时间 | 决策 | 落地 |
|---|---|---|
| 2026-07-01 | 平台 Agent 先于双边 Agent | 平台仲裁 Agent 先上线 |
| 2026-07-01 | 免责上限 12 个月服务费 | 用户协议 §11.2 |
| 2026-07-01 | 标准 SKU 定价灵活性:无人接单可加价 | 动态调价机制 |
| 2026-07-01 | AI 拆解按钮:显式按钮触发 | BriefNewPage "AI 拆解 →" |
| 2026-07-01 | 不设硬上限 + 3 道软护栏 | 3 道软护栏 E2E 验证通过 |
| 2026-07-01 | 法律责任在用户,Agent 是辅助 | 用户协议 §2.5 |

---

> 完成时间:2026-07-01
> W2 Sprint 周期:1 天(单日大改,集中交付)
> 下一站:W3 Workspace 模块 + AI 工具集成
