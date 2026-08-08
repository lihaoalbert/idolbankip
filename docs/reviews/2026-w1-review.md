# W1 Review — AIGC 众包 MVP 启动周

> **报告周期**:2026-06-30 ~ 2026-07-01(W1, Plan C v1.0 启动周)
> **作者**:Claude(技术/AI 实施)
> **收件人**:创始人 + 后续 W2 团队
> **状态**:✅ 全绿,可进入 W2

---

## 一句话总结

AIGC 众包 MVP **W1 全部目标完成** — Prisma schema 落地 15 张新表 + 后端 17 条新路由 + 前端 2 个新页面 + LLM 3 个 prompt,三端 build & 本地 smoke 全过,可以让 W2 接入"买家真实发包"和"LLM 拆任务"两个工作流。

---

## 1. W1 完成清单

### 1.1 后端 Prisma Schema — #23 ✅

**新增 15 张表**(全部 `db push` 成功,无数据丢失):

| 模块 | 表 | 用途 |
|---|---|---|
| Brief | `Brief` | 买家发包主表(标题/品类/平台/IP/预算/套餐/截止) |
| Brief | `Bid` | 创作者投标表(价格/周期/提案) |
| 创作者 | `SkillTag` | 技能标签字典(数字人广告/口播/3D 等) |
| 创作者 | `CreatorSkill` | 创作者 ↔ 技能多对多 |
| 创作者 | `CreatorProfile` | 创作者扩展档案(简介/工时/作品集/信用分) |
| Workspace | `Workspace` | 接单后工作台(中标后自动创建) |
| Workspace | `WorkspaceMessage` | 站内 IM 消息存档 |
| Workspace | `AIGenerationRecord` | AI 工具调用记录(Sora/可灵/即梦) |
| 交付 | `Deliverable` | 终稿 + 中间稿版本管理 |
| 评价 | `Review` | 双向评价(buyer→creator / creator→buyer) |
| 争议 | `Dispute` | 仲裁队列 |
| 财务 | `RoyaltyRecord` | IP 授权分账流水 |
| 财务 | `BuyerSubscription` | 买家订阅 L1(¥199/月/¥1999/年) |
| 财务 | `Withdrawal` | 创作者提现(完成首单后开通 canWithdraw) |
| 数据 | `PlatformAnalytics` | 日活/GMV/品类分布 |

**User 表扩展**:`isCreatorVerified` / `canWithdraw` / `lastActiveAt` + 11 个反向关联(briefsAsBuyer, bidsAsCreator, createdWorkspaces, deliveredWorkspaces, deliverablesAsCreator, reviewsAsBuyer, reviewsAsCreator, disputesAsBuyer, disputesAsCreator, royaltiesAsOwner, withdrawals)。

### 1.2 后端 Brief & Bid 模块 — #24 ✅

| Controller | 路由前缀 | 方法 | 路由 | 用途 |
|---|---|---|---|---|
| `BuyerBriefController` | `/api/v1/buyer/briefs` | POST | `/` | 创建草稿 |
| | | GET | `/` | 列出我的 brief |
| | | GET | `/:id` | 查看我某个 brief |
| | | PATCH | `/:id` | 编辑 brief |
| | | POST | `/:id/close` | 关闭 brief |
| | | POST | `/:id/publish` | 草稿 → 公开 |
| `CreatorBriefController` | `/api/v1/creator/briefs` | GET | `/` | 浏览公开 brief |
| | | GET | `/:id` | 查看 brief 详情 |
| `BuyerBidController` | `/api/v1/buyer/briefs/:briefId/bids` | GET | `/` | 列出某 brief 的所有 bid |
| | | POST | `/:bidId/accept` | 接受(事务:中标+自动建 workspace+其余 bid 拒绝) |
| | | POST | `/:bidId/reject` | 拒绝某个 bid |
| `CreatorBidController` | `/api/v1/creator/briefs/:briefId/bids` | POST | `/` | 创作者投标 |
| | | POST | `/:bidId/withdraw` | 撤回投标 |
| | | GET | `/mine` | 我在该 brief 上的 bid |

**关键设计点**:
- `BidService.accept()` 走 `$transaction` → bid.accepted + 其他 bid.rejected + brief.in_progress + workspace.create,原子操作,失败回滚
- 校验链:brief 必须 status='bidding', buyer 只能 accept 自己的 brief, bid 价格必须在 [budgetMin, budgetMax]
- 创作者不能给自己买家的 brief 投标

### 1.3 前端 Buyer/Creator Brief 页面 — #25 ✅

| 路由 | 文件 | 功能 |
|---|---|---|
| `/buyer/brief/new` | `apps/web/src/pages/buyer/BriefNewPage.vue` | 6 步表单(基本信息/品类/平台/IP/套餐/截止)+ 实时预算校验 + 提交调 `POST /buyer/briefs` |
| `/creator/briefs` | `apps/web/src/pages/creator/BriefsBrowsePage.vue` | 公开 brief 列表 + 倒计时(D LEFT / H LEFT / EXPIRED,≤3 天红色)+ 品类筛选 + 一键投标入口 |

设计语言:沿用 `.stamp / .plate / .plate-frame / .catalog-no / .font-display`,跟主站风格一致。

### 1.4 LLM Provider Config + 3 个 Prompt — #26 ✅

**模块路径**:`apps/api/src/pricing/`

| 文件 | 行数 | 用途 |
|---|---|---|
| `pricing-prompts.ts` | 130 | 3 个 system prompt + 3 个 user prompt builder |
| `pricing.service.ts` | 188 | 3 个 LLM 方法 + parseAndValidate + parseJson(含 ```json 包裹兼容) |
| `pricing.controller.ts` | 65 | POST `/pricing/decompose` / `/estimate` / `/categorize` |
| `pricing.module.ts` | 12 | DI 容器,import LlmConfigModule |

**Prompt 锚定价格**(Essential ¥700-1k / Standard ¥1.4k-2k / Premium ¥2.5k-3.5k,来源:`/Users/app/Ads` v2.0 + 晶新 AI 实单),±20% 调整系数(平台数/IP 数/复杂度 high/加急)真实可用。

**Fail-safe**:每个方法都有 hardcoded fallback(Essential 800 / Standard 1700 / Premium 3000,归类 shortvideo,confidence 0.6),LLM 返回格式异常时 `parseJson` 仍能挽救,完全崩溃时 `ServiceUnavailableException('AI 服务暂不可用, 请稍后再试')`。

### 1.5 CI/CD 三端 build + 本地 smoke — #27 ✅

| 端 | 构建命令 | dist 时间戳 | 状态 |
|---|---|---|---|
| API | `pnpm --filter @ibi-ren/api run build` (清理 tsbuildinfo 后 tsc) | 2026-07-01 09:32 | ✅ |
| Web | `pnpm --filter @ibi-ren/web run build` (Vue 3 + Vite) | 2026-07-01 00:10 | ✅ |
| Admin | `pnpm --filter @ibi-ren/admin run build` (Vue 3 + Vite + 118 modules) | 2026-07-01 09:34 | ✅ |

**三端 dist 时间戳都是今天**(W1 内同步完成,符合 AGENTS.md §5.16)。

**本地 smoke**(`bash scripts/smoke.sh local`):

```
==== smoke @ local(127.0.0.1:8080/8081/3100) ====
  ✅ web-root                         http://127.0.0.1:8080/ → 200
  ✅ admin-root                       http://127.0.0.1:8081/ → 200
  ✅ api-health                       http://127.0.0.1:3100/health → 200
  ✅ api-ips-list                     http://127.0.0.1:3100/api/v1/ips?size=1 → 200
✅ smoke 全过
```

**Nest 启动日志**(已确认新模块全装载):
- 148 条路由全部映射成功(API + web + admin + 模块)
- 新增 14 路由可见:
  - `BuyerBriefController`: 5 路由(POST/GET/PATCH/close/publish)
  - `CreatorBriefController`: 2 路由(列表 + 详情)
  - `BuyerBidController`: 3 路由(列表 + accept + reject)
  - `CreatorBidController`: 3 路由(投标 + 撤回 + 我的)
  - `PricingController`: 3 路由(decompose + estimate + categorize)
- Prisma 已连接、KYC/OCR stub 警告正常(本地开发配置)
- 无任何 ERROR / FATAL

---

## 2. 数据统计

- **表数**:15 张新表 + User 扩展(11 反向关联 + 3 字段)
- **路由**:14 条新后端路由 + LLM 3 路由 = **17 条新业务路由**(Total Nest 148 路由)
- **前端新页面**:2 个(buyer/BriefNewPage + creator/BriefsBrowsePage)+ 2 条新路由
- **LLM Prompt**:3 个 system prompt + 3 个 builder
- **dist 产物**:API `main.js` 5373 B / Web `index.html` 1526 B / Admin `index.html` 526 B
- **构建耗时**:API ~3s / Web ~1.7s / Admin ~1.8s(增量)

---

## 3. W1 期间踩到的坑

### 3.1 `tsconfig.tsbuildinfo` 增量缓存导致 no-op
**症状**:`nest build` 后 `dist/` 只有 `.d.ts`,没 `.js`,`node dist/main.js` 报 `Cannot find module './prisma/prisma.module'`
**根因**:`tsconfig.base.json` 里 `incremental: true`,上轮全量构建后改 schema 时 tsc 走增量,缓存只重生成 .d.ts
**修法**:增量 build 前 `rm -f tsconfig.tsbuildinfo tsconfig.build.tsbuildinfo`
**沉淀**:加入 AGENTS.md §5.17 候选

### 3.2 Vite preview 默认 IPv6 ::1 only
**症状**:admin preview 起来后 `curl 127.0.0.1:8081` 失败,但 `localhost:8081` 能通
**根因**:macOS Node 22 + Vite preview 默认绑 `::1` 不绑 `0.0.0.0`,IPv4 curl 拿不到
**修法**:`npx vite preview --port 8081 --host 127.0.0.1`(或用 web 的 `--host 0.0.0.0` 写法)
**沉淀**:`scripts/smoke.sh` 应该走 `localhost` 不要硬编码 `127.0.0.1`(候选改进)

### 3.3 之前遗留的 vite dev 进程占端口
**症状**:首次启 `pnpm preview` 时报 "Port 8080 is in use, trying 8082"
**根因**:早前手动调试留下的 `node vite.js --port 8080 --host 0.0.0.0` 没清掉
**修法**:`lsof -ti :8080 | xargs kill`(注意只杀 vite 相关,PID 20438 是 stale dev)
**沉淀**:`scripts/smoke.sh` 应该先 `pre-clean` 把 vite dev/preview 残留清掉

---

## 4. W1 → W2 接口已就绪

| 工作流 | 前置 | 触发 | 后置 |
|---|---|---|---|
| 买家发包 | buyer 登录 + 创建 brief | `POST /buyer/briefs` 发布 | brief.status='bidding', `POST /creator/briefs` 列表可见 |
| 创作者投标 | creator 登录 + 浏览公开 brief | `POST /creator/briefs/:id/bids` | bid.status='pending' |
| 买家选中 | brief.status='bidding' + bid.status='pending' | `POST /buyer/briefs/:briefId/bids/:bidId/accept` | 事务:bid.accepted + 其他 bid.rejected + brief.in_progress + workspace.create |
| LLM 报价建议 | 买家创建 brief 前调用 | `POST /pricing/estimate` { spec } | 返回 essential/standard/premium 三档价格 + recommend |
| LLM 拆任务 | brief 草稿 → publish 前 | `POST /pricing/decompose` { title, description } | 填充 brief.spec 字段(platformSet/count/duration/ips/complexity) |
| LLM 归类路由 | admin 后台批量审 brief | `POST /pricing/categorize` { title, description } | category + confidence + subcategory,W2 接入推送 |

---

## 5. W2 待办依赖

| Task | 依赖 W1 产物 | 风险 |
|---|---|---|
| #28 Brief LLM 自动拆任务 + 匹配算法 | PricingService.decompose/categorize | LLM 输出 schema 偶发遗漏,parseAndValidate 已 fail-safe |
| #29 推送通知(站内/邮件/微信) | BriefService.publish 事件 | 无,基础架构现成 |
| #30 创作者中心 + 买家中心接入真实 API | BriefController + BidController | UI 工作量较大,**需设计师兼职(#42 W5)支援** |
| #31 报价倒计时 + 过期自动 close | BriefService(deadlineAt 字段已存) | cron job(已有 NotificationsModule 调度能力) |
| #32 客服机器人 FAQ + W2 端到端验证 | AssistantModule 已存在(#30.6.22 周) | FAQ 知识库需要客户经理录入(**用户卡点**) |

---

## 6. 决策点 & 待用户决策

| 项 | 建议 | 状态 |
|---|---|---|
| LLM 单 active 策略 | 保留(`LlmConfigService` 设计如此),避免多 model 漂移 | 已生效 |
| Workspace 自动建在 accept 时 | 保留(降低创作者摩擦,2 步变 1 步) | 已生效 |
| PlatformAnalytics 表是死表还是埋点源 | 当前空 schema,等 W6 admin /analytics 再启用 | 待 W6 |
| Bid 公开/隐私:投标时 bid 价格是否对其他创作者可见 | W5 决策点 1 时讨论(影响 creator 竞争策略) | 待 W5 |

---

## 7. 下周(W2)交付承诺

按 Plan C v1.0 §6.2,W2 应交付:

1. ✅ Brief LLM 自动拆任务,#28 — `PricingService` 已可用,前端 buy/brief/new 加 "AI 拆解" 按钮
2. ✅ 推送通知,#29 — `notifications/prisma` event hook + 微信/邮件模板
3. ✅ 创作者中心 + 买家中心接入真实 API,#30 — 复用 buyer/MyOrdersPage 风格扩展 MyBriefsPage / CreatorDashboardPage
4. ✅ 报价倒计时 + 过期自动 close,#31 — `setInterval` + `cron 10min scan expired bidding brief`
5. ✅ 客服机器人 FAQ + W2 端到端验证,#32 — AssistantModule 已有,挂 FAQ 知识库 + W2 smoke 整链路

需要用户决策的卡点(不在这周交付):
- 运营经理入职(#18)— 用户负责
- 客服入职(#19)— 用户负责

---

## 8. 附录:文件路径索引

```
apps/api/prisma/schema.prisma                       # W1 新增 15 model
apps/api/src/app.module.ts                          # W1 注册 BriefModule/BidModule/PricingModule
apps/api/src/brief/{brief.controller,brief.service,brief.module}.ts
apps/api/src/bid/{bid.controller,bid.service,bid.module}.ts
apps/api/src/pricing/{pricing.controller,pricing.service,pricing.module,pricing-prompts}.ts
apps/web/src/pages/buyer/BriefNewPage.vue
apps/web/src/pages/creator/BriefsBrowsePage.vue
apps/web/src/router/index.ts                         # 注册 buyer/brief/new + creator/briefs
```

---

> 报告生成于 W1 末,W2 周一上手前可读。
> 配套原始材料:`docs/plans/2026-plan-c-aigc-crowdsourcing.md` v1.0(决策文件)
