# R11 体验走查报告 — buyer_001 + creator_001 双侧全路径

> 日期:2026-07-14 · 环境:本地(vite 5173 + api 3100,proxy)· 走查人:Claude
> 账号:`buyer_001@ibi.ren`(张制片,BUYER)/ `creator_001@ibi.ren`(林雾工作室,CREATOR)
> 目的:**功能迭代顺序以本报告为准**。下方「建议迭代顺序」即 R11 backlog。

---

## 一、结论速览

R10 三条 P0 修复经本轮回归**全部确认生效**;但双侧走查又暴露 **3 个新 P0 断链**,核心是 **「中标 → 支付」整段缺失** 和 **创作者投标后无处回看 workspace**。平台目前能"发包→投标→中标→建 workspace",但**中标后无法付款、创作者找不到自己的活儿** —— 业务流仍未真正闭环。

| 优先级 | 数量 | 一句话 |
|---|---|---|
| **P0 断链** | 3 | 支付闭环缺失 · 创作者 workspace 无列表 · buyer 端 /ips/mine/list 403 |
| **P1 可用性** | 6 | IP 无管理列表 · 工作区无闭环出口 · /orders 无快捷支付 · 通知覆盖 · KYC 门槛 · chat 误判意图 |
| **P2 一致性** | 8 | 时间格式 3 种混用 · "我的资产"跨角色歧义 · dev 脚注未隐藏 · 罗马数字徽标 · 列表管理能力 等 |
| **数据卫生** | 1 | buyer/creator 账号被 E2E 残留数据淹没,demo 无法看 |

### R10 修复回归(全 ✅)
- **R10 P0-1**:in_progress brief 详情页显示「进入工作区 →」,点击进 `/workspaces/:id` ✅
- **R10 P0-3**:accept bid 同步建 Order,`/orders` 正确显示所有中标单(19 条)✅
- **R10 P0-4**:创作者任务板 0 条 EXPIRED,双重过滤生效 ✅
- **R10.2 P1**:撤回后「重新报价」入口 + 投标表单校验(越界红字 + 提交 disabled,合规后 enable)✅

---

## 二、P0 断链(必须先修 —— 决定业务能否闭环)

### P0-1 · 「中标 → 支付」整段缺失 〔[T][U]〕
买家中标后**无法付款**,业务流断在最关键的收钱环节。三处连锁 bug:
1. `MyOrdersPage.vue:131` —— brief 中标单的行 link 指向 `/buyer/briefs/:briefId`,**不是** `/orders/:orderId`。
2. `OrderDetailPage.vue:215` —— 直接取 `order.ip.displayName`,brief 单 `ip=null` → **页面崩**。
3. brief 详情页 + 订单详情页 **都没有「去支付」按钮**,只有状态展示。
- **修复**:
  1. `/orders` 行 link 统一到 `/orders/:orderId`;
  2. `OrderDetailPage` 兼容 brief 单(`ip` 为空时渲染 `brief.title` + briefId 跳转);
  3. 订单 `status=CREATED` 时加「💳 去支付」CTA;brief 详情页顶部同步加。

### P0-2 · 创作者无「我中标/进行中 workspace」列表 〔[Z]〕
- nav「我的任务」(`/creator/tasks`)点进去是**「官方形象征集任务板 · 接单后版权归平台」**(0 ACTIVE)—— 与"我中标的发包"是两码事。
- 全站**没有一个页面**列出创作者中标/进行中的 workspace;`bid mine` 接口是 per-brief 的,无全局聚合;workspace 只能靠 `/creator/workspace/:id` 深链进入。
- **后果**:创作者投完标就"失联",比买家侧还严重(买家至少能从 brief 详情进 workspace)。
- **修复**:新增 `GET /creator/workspaces`(列 accepted bid → workspace)+ `/creator/workspaces` 列表页;「我的任务」nav 指向它;官方征集板改名/挪位。

### P0-3 · buyer 端 `/ips/mine/list` 返回 403 〔[J]〕
- `BriefNewPage.vue:267` 为买家调 `/ips/mine/list`,但 `ips.controller.ts:154` 用 `@Roles(CREATOR)` 只允许创作者 → 403,前端 `catch` 静默吞掉。
- **后果**:买家发包时「04 数字人 IP」章节直接消失,"让创作者用我买过的 IP 出镜"选项断链。
- **修复**:后端放开买家可查自己关联的 IP(或新增 buyer 版接口);前端 catch 至少 `console.warn` 不静默。

---

## 三、P1 可用性(闭环后立刻补)

- **P1-1 无 `/creator/ips` 列表** 〔[AA]〕:创作者传了 IP(现有 1 个,PUBLIC_INTENT)却无处回看/查审核状态/管理,只能深链 `/creator/ips/:id`。上传→审核→上架 断在"看不到我传了什么"。→ 加 `/creator/ips` 列表页。
- **P1-2 工作区无闭环出口** 〔[W]〕:买家在 workspace 看满意的中间稿后,没有「去验收/去支付」CTA,要退回 brief 详情。工作区应是决策中心。
- **P1-3 chat 误判发包意图** 〔[H][I]〕:输入"我想做一个 30 秒 AI 形象广告"(CREATE_BRIEF 强信号)被当 FAQ 答,CTA 给"去形象库/联系商务"无帮助。→ intent 分类调优 + 优先给「开始创建发包 →」。
- **P1-4 通知覆盖待补** 〔[Y]〕:通知中心机制良好,但目前只见"过期关闭"。投标到达/中标/中间稿上传/验收提醒 等核心事件是否发通知需确认并补全,否则双侧错过关键节点。
- **P1-5 /orders 无快捷支付** 〔[S]〕:19 条"中标待付"要逐个点进详情才能付;列表行应有「去支付」按钮 + 「待支付/已支付/已退款」状态 tab。
- **P1-6 KYC 门槛缺失** 〔[AE]〕:creator_001 未 KYC 却已能投标 + 上传 IP;onboard 页永远是空表单,不反映"审核中/已认证"。→ KYC 前置到投标/上传前,或至少反映三态。

---

## 四、P2 一致性 & 打磨(体验债,批量清)

- **P2-1 时间格式 3 种混用** 〔[L][X]〕:brief 列表 ISO(`2026-07-21T08:23Z`)· 工作区美式(`7/21/2026`)· orders zh-CN。→ 统一为"3 小时前 / 7月21日截止"人性化格式 + 全站 `formatDate` util。
- **P2-2「我的资产」跨角色同名异义** 〔[AC]〕:买家 `/my-assets`=买到的 IP 授权包;创作者 `/creator/assets`=Prompt模板/模型。同名不同义,切角色会懵。→ 创作者侧改名(如"我的素材/模板库")。
- **P2-3 dev 脚注 prod 未隐藏** 〔[C]〕:"R2 三分屏·R3 将开放·R4 全量上线""R9 上线·ResultsPane 各自独立"等内部标记还挂在页面。→ `import.meta.env.DEV` 包裹或删除。
- **P2-4 罗马数字状态徽标不直观**:orders 状态"I 待支付"普通用户不懂"I"含义。→ 去掉罗马数字或加 tooltip。
- **P2-5 /buyer/briefs 列表管理能力弱** 〔[M][N][O][P][Q]〕:状态徽标只 4 种(缺待支付/已交付)· 无排序 · 无分页(20 条全渲染)· 卡片缺投标数/距截止/中标人 · 无批量操作 · tab 切换不进 URL。
- **P2-6 当前价越界 budgetMax** 〔[AD]〕:brief 预算 ¥500-1,000 但"当前价 ¥1,500";投标框 prefill 1500 一进来就不过自己的校验。→ 查 bump 逻辑是否越界 / seed 数据。
- **P2-7 chat 体验细节** 〔[D][E][F][G][K]〕:卡片信息密度低(缺投标数/截止/缩略图)· 无按日期分组 · 附件按钮可点性不明 · 发送按钮无 aria-label · 右栏无"全部 →"入口 · 无导出/删除对话。
- **P2-8 登录后首屏 & 通知红点** 〔[A][B]〕:登录用户首屏仍是营销页(缺"最近在做什么"入口)· 通知红点不显示类型。

---

## 五、数据卫生(demo 前必做)

buyer_001 有 20+ 条 E2E 残留 brief + 19 条残留 order;创作者任务板全是 `W6-R6 T1 撤回bid-test...` 测试 brief。**真实体验被测试垃圾淹没,无法做演示。**
→ 写一个"区分 seed 真实数据 vs E2E 残留"的清理脚本(按 title 前缀 `W6-`/`E2E`/`smoke`/`test` + createdAt 判定),或给 E2E 单独的测试账号,不复用 buyer_001/creator_001。

---

## 六、建议迭代顺序(R11 backlog)

按"业务能否闭环 → 可用性 → 一致性"排序,ROI 从高到低:

### R11.1 — 支付闭环 + 双侧 workspace 可达(P0,最高优先)
> 打通「中标 → 支付 → 交付」和创作者侧入口,平台从"能建 workspace"升级为"能收钱、能交付"。
- P0-1 支付闭环(orders link 统一 + OrderDetailPage 兼容 brief 单 + 去支付 CTA)
- P0-2 `/creator/workspaces` 列表 + 后端聚合接口 +「我的任务」nav 归位
- P0-3 buyer `/ips/mine/list` 403 放开 + 前端不静默
- 附:数据清理脚本(否则改完也没法验)

### R11.2 — 可用性补齐(P1)
- P1-1 `/creator/ips` 列表页
- P1-2 工作区「去验收/去支付」闭环出口
- P1-5 `/orders` 行内去支付按钮 + 状态 tab
- P1-4 核心业务事件通知覆盖梳理
- P1-3 chat 发包意图分类调优
- P1-6 KYC 门槛/状态三态

### R11.3 — 一致性 & 体验债(P2)
- P2-1 全站时间格式统一(util)
- P2-2 "我的资产"跨角色改名 · P2-3 dev 脚注隐藏 · P2-4 罗马数字徽标
- P2-5 /buyer/briefs 列表(排序/分页/信息密度/状态细分)
- P2-6 当前价越界排查 · P2-7 chat 细节 · P2-8 首屏/通知红点

---

## 附:原始逐步走查记录
见 `.r11-findings/r11-walkthrough.md`(观察点 [A]–[AE] 全量,含控制台证据与接口返回)。
