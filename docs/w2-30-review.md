# W2 #30 创作者/买家中心接入真实 API — 2026-07-01

> 父任务:[W2] 创作者中心 + 买家中心接入真实 API
> 完成时间:2026-07-01 15:20
> 部署:ECS prod (https://ibi.ren),smoke + 浏览器实测全过

---

## 1. 范围

W2 #29 推送上线后,链路最后 100m 实际断裂:推送给创作者的 `link` 在前端根本打不开。本任务收尾 4 处:

| # | 问题 | 修法 |
|---|---|---|
| 1 | 铃铛 (NotificationBell) 收到 BRIEF_PUBLISHED / BRIEF_BUMPED 但只显示 "•" | ICONS/ICON_COLOR 加 ◐ / ↑ |
| 2 | 通知中心 (NotificationsPage) 同上,显示 "?" / "通知" | TYPE_META 加 ◐ / ↑ (variant info/gold) |
| 3 | BriefPushService 写入 `link=/creator/brief/:id` (单数),但前端路由实际是 `/creator/briefs/:id` (复数) | 改复数,顺便同步 WeChat `briefUrl` |
| 4 | `/creator/briefs/:id` 路由根本不存在 + 无 CreatorBriefDetailPage | 新增页面 + 路由 + 报价弹窗 |

顺带把 BriefsBrowsePage 已存在的 `router.push('/creator/briefs/${id}')` 接通。

## 2. 模块清单

| 模块 | 文件 | 说明 |
|---|---|---|
| CreatorBriefDetailPage | `apps/web/src/pages/creator/CreatorBriefDetailPage.vue` | 创作者侧 brief 详情 + 报价弹窗 + 撤回 |
| 路由 | `apps/web/src/router/index.ts` | 新增 `/creator/briefs/:id` (lazy import, requiresAuth + CREATOR) |
| Bell UI 印记 | `apps/web/src/components/NotificationBell.vue` | ICONS/ICON_COLOR 加 BRIEF_PUBLISHED + BRIEF_BUMPED |
| 通知中心 UI 印记 | `apps/web/src/pages/NotificationsPage.vue` | TYPE_META 加两类型 |
| 推送 link | `apps/api/src/brief-push/brief-push.service.ts` | link + briefUrl 单数 → 复数 |

## 3. UI 印记映射 (新增 2 行)

### NotificationBell.vue (下拉 + 未读数字)

```ts
// #30.7.1 W2 #29 推送通知 — 买家发包 / 加价
BRIEF_PUBLISHED: '◐',   // 半圆 — 表示"新出现"
BRIEF_BUMPED:    '↑',   // 上箭头 — 表示"涨"
```

```ts
// #30.7.1 W2 #29
BRIEF_PUBLISHED: 'text-info',  // 蓝
BRIEF_BUMPED:    'text-gold',  // 金
```

### NotificationsPage.vue (完整列表)

```ts
BRIEF_PUBLISHED: { label: '新任务包', roman: '◐', variant: 'info' },
BRIEF_BUMPED:    { label: '任务包加价', roman: '↑', variant: 'gold' },
```

## 4. CreatorBriefDetailPage 字段

| 区块 | 数据 | 操作 |
|---|---|---|
| HEADER | title / category / packageTier / status / daysLeft | (只读) |
| PRICING | currentPrice + 预算区间 | 显示脱敏说明"平台已脱敏 bumpHistory,你看到的当前价就是你能报的最高锚点" |
| BRIEF DETAIL | description / platformSet / deadlineAt / budgetMin~Max / standardSkuId | (只读) |
| ACTION | 三态:已报价(¥X / N 天交付 / pending badge / 撤回) / 自己的 brief / 不可接单 / **我要投标** 弹窗 | 弹窗:price / deliveryDays / proposal(10-2000 字) |

报价弹窗默认 price = currentPrice(让创作者默认按当前锚点报)。

## 5. 推送 link 修复

```diff
- const briefUrl = `https://ibi.ren/creator/brief/${brief.id}`;
+ const briefUrl = `https://ibi.ren/creator/briefs/${brief.id}`;
  const title = ...
- const link = `/creator/brief/${brief.id}`;
+ const link = `/creator/briefs/${brief.id}`;
```

注意:旧通知(今天 deploy 前写入)的 `link` 仍是单数,会 404。考虑到 #29 上线不足 2 小时,prod DB 里只有 4 条旧 BRIEF_* 通知,影响面小;不补数据(没意义,旧 brief 已 close / bidding 完成)。

## 6. 三端 build

```bash
pnpm --filter @ibi-ren/api run build   # nest build → 142 .js 文件
pnpm --filter @ibi-ren/web run build   # vite build → CreatorBriefDetailPage-*.js 9.87 kB
```

`grep -c "localhost:3000" dist/assets/index-*.js` → **0**(无硬编码)。

## 7. 本地烟测

```
buyer_001 发包 (短 视 频 / standard / ¥1500) → publish
↓
[BriefPushService] [push:BRIEF_PUBLISHED done] site=1/1 mail=1 wx=0

creator_001 GET /creator/briefs/:id
→ status=bidding currentPrice=1500 hasBumpHistory=False   # 3 道软护栏之三

creator_001 POST /creator/briefs/:id/bids  {price:1500, deliveryDays:7, proposal:"..."}
→ status=pending price=1500 deliveryDays=7

creator_001 GET /creator/briefs/:id/bids/mine → 1 bid (pending)

buyer_001 POST /buyer/briefs/:id/bump {percent:10}
→ needConfirm=False overCap=False newPrice=1650
[BriefPushService] [push:BRIEF_BUMPED] recipients=1
[EmailService] [email-mock] subject="💰 任务包加价,现 ¥1650"
[BriefPushService] [push:BRIEF_BUMPED done] site=1/1 mail=1 wx=0
```

## 8. ECS 部署

- commit `a8f3d2c` feat(web+api): W2 #30 creator brief detail + 推送 link 修复
- `bash scripts/deploy.sh` → 三端 dist 同步,API 重启健康 (4s)
- ECS dist 时间戳:api/web/admin 全部 15:14:xx

## 9. 生产烟测

买家 buyer_001 实操:

```bash
publish brief (id=cmr1qsjco0005jft9dg5ztcos, shortvideo, ¥1500)
  ↓
[BriefPushService] [push:BRIEF_PUBLISHED done] site=91/91 mail=91 wx=0

creator_001 GET /api/v1/notifications?limit=10
  → 3 BRIEF_* 通知:
    ◐ BRIEF_PUBLISHED  📦 新 短视频 任务包,¥1500   link=/creator/briefs/cmr1qsjco0005jft9dg5ztcos   ← NEW 复数
    ↑ BRIEF_BUMPED     💰 任务包加价,现 ¥1650       link=/creator/brief/cmr1po5be0009hqmz7y4jj21t      ← OLD 单数(无效)
    ◐ BRIEF_PUBLISHED  📦 新 短视频 任务包,¥1500   link=/creator/brief/cmr1po5be0009hqmz7y4jj21t      ← OLD 单数(无效)

creator_001 GET /creator/briefs/cmr1qsjco0005jft9dg5ztcos
  → status=bidding currentPrice=1500 hasBumpHistory=False

creator_001 POST /creator/briefs/cmr1qsjco.../bids
  → status=pending price=1500 deliveryDays=7

creator_001 GET /creator/briefs/cmr1qsjco.../bids/mine
  → my_bids=1 (pending)

buyer_001 POST /buyer/briefs/cmr1qsjco.../bump {percent:10}
  → newPrice=1650, [BriefPushService] [push:BRIEF_BUMPED done] site=91/91
```

### 浏览器实测 (Playwright)

creator_001 登录 https://ibi.ren → 铃铛 (4 unread) → 点开 →

```
↑ 💰 任务包加价,现 ¥1650      买家加价后总价 ¥1650,点击查看  ·  2 分钟前
◐ 📦 新 短视频 任务包,¥1500  W2 #30 prod 短视频 (短视频 · ¥1500)  ·  2 分钟前
↑ 💰 任务包加价,现 ¥1650      · 31 分钟前
◐ 📦 新 短视频 任务包,¥1500  W2-29 prod push smoke (短视频 · ¥1500)  · 33 分钟前
```

点击 ◐ 通知 → 跳转 `/creator/briefs/cmr1qsjco...` → 渲染 CreatorBriefDetailPage:

```
AIGC · BRIEF · DETAIL (CREATOR)
W2 #30 prod 短视频          [招集中] AIGC 短视频 · Standard 标准版 · 182 天截止

PRICING · 当前价 (创作者视角)
  当前价  ¥1,650         预算区间 ¥1,200 - ¥1,800
  平台已脱敏 bumpHistory(看不到买家加价历史),你看到的当前价就是你能报的最高锚点。

BRIEF DETAIL
  #30 creator API prod smoke
  投放平台  抖音
  截止时间  2026/12/31 08:00:00
  预算区间  ¥1,200 - ¥1,800
  SKU 标识  cmr1kj7iy000ekmwe3n8kjnqu

ACTION · 报价 / 已报价状态
  你已报价 ¥1,500   7 天交付   [等待买家选择]
  ▸ 查看我的提案
  [撤回报价]
```

截图: `creator-brief-detail-prod.png` + `creator-brief-bell-prod.png`

## 10. 闭环验证

| 角色 | 动作 | 结果 |
|---|---|---|
| 买家 buyer_001 | 创建 brief → publish | bidding, fan-out 91 |
| 创作者 creator_001 | 收到 BRIEF_PUBLISHED 通知 | 铃铛 4 unread,◐ 图标 |
| 创作者 creator_001 | 点通知 → 详情页 | 看到 currentPrice=¥1,500 + 3 道软护栏脱敏说明 |
| 创作者 creator_001 | 报价 (¥1,500 / 7 天 / proposal) | status=pending |
| 创作者 creator_001 | 刷新详情页 | 看到"你已报价 ¥1,500 · 等待买家选择 · 撤回报价" |
| 买家 buyer_001 | bumpPrice +10% | ¥1,500 → ¥1,650, BRIEF_BUMPED 推到 91 个创作者 |
| 创作者 creator_001 | 收到 BRIEF_BUMPED 通知 | 铃铛 ↑ 印记 + ¥1,650 |

## 11. Known Limitations / 后续

| 项 | 当前 | 何时上线 |
|---|---|---|
| 旧 BRIEF_* 通知 link | 单数,点击 404 | 接受(影响小);或写一次性 migration 把 link 字段加上 s 后缀 |
| CreatorBidController 仅 "我的 bid" 接口 | 无分页 | #31 报价倒计时一并处理 |
| bid 重复报价拦截 | 服务端 P2002 → ConflictException | 前端 toast 已显示"已经报过价了",无需改 |
| 撤回报价后能否再次报价 | 撤回 → status=withdrawn → unique(briefId+creatorId) 仍冲突 | 服务端需要把 unique 改成 `(briefId, creatorId, status='pending')` 或允许多条历史。短期先告知创作者撤回后无法再报。 |
| 移动端 CreatorBriefDetailPage | 与桌面端同 layout,长 brief 体验一般 | 后续响应式优化 |

## 12. 关联文档

- [W2 #28 三道软护栏](w2-28-review.md) — bumpHistory 脱敏 = 3 道软护栏之三
- [W2 #29 推送通知](w2-29-review.md) — 本任务的触发条件(BRIEF_PUBLISHED/BRIEF_BUMPED 通知落地)
- [BidService 规则](../apps/api/src/bid/bid.service.ts) — 报价区间 / 重复报价 / 接受 → 创建 Workspace
- 业务标准 [2026-brief-package-v1](../standards/2026-brief-package-v1.md)

## 13. 修订

| 版本 | 日期 | 修订人 | 修订内容 |
|---|---|---|---|
| 1.0 | 2026-07-01 | Claude | 初版 |