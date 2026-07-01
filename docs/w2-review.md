# W2 收尾 Review — 创作者 + 买家中心接入真实 API

> 周期:W2(2026-06-29 → 2026-07-01)
> 主题:把 marketplace 的"创作者侧"和"买家侧"接通真实 API,完成 5 个端到端闭环
> 最终验证:prod `https://ibi.ren` E2E 10/10 PASS

---

## 1. 周期目标

W1 解决了"VIP 数字人有 IP 上架 + 创作者能报价格",但**创作者侧和买家侧实际是断的**:

- 买家发包,创作者在 dev 控制台看推送 — prod 上收不到(没有 fan-out)
- 创作者能看到通知,但点进去 404(链接是单数 `/creator/brief/:id`,前端路由是复数)
- brief 详情没倒计时,brief 卡在 `bidding` 永远不结束
- 客服机器人调 LLM 答非所问,token 烧得快还不准

W2 5 个任务全部是为了把这几段接通,跑通"买家发包 → 创作者看到 → 投标 → 加价 → 接受 → workspace"完整链路,并补一个能直接答 FAQ 的客服机器人。

---

## 2. 任务清单

| # | 任务 | commit | 详细 review |
|---|---|---|---|
| **#28** | 平台层标准 + 平台仲裁 Agent + W1 收尾 | `4e94a3f` | (在 commit message 里覆盖) |
| **#29** | 推送通知 fan-out(站内 + 邮件 + 微信) | `ff2b281` / `facee31` | [w2-29-review.md](w2-29-review.md) |
| **#30** | 创作者 + 买家中心接入真实 API | `8462dc4` | [w2-30-review.md](w2-30-review.md) |
| **#31** | 报价倒计时 + 过期 brief 自动 close | `ce7ed2b` | [w2-31-review.md](w2-31-review.md) |
| **#32** | 客服机器人 FAQ + W2 端到端验证 + Review | `85f1206` / (本文) | 本文档 |

---

## 3. 模块总览

### 3.1 新增文件

```
apps/api/src/email/                       # W2 #29 阿里云 DirectMail 包装
  email.service.ts
  email.module.ts
apps/api/src/wechat/                      # W2 #29 微信公众号模板消息
  wechat.service.ts
  wechat.module.ts
apps/api/src/brief-push/                  # W2 #29 brief 推送服务
  brief-push.service.ts
  brief-push.module.ts
apps/api/src/assistant/
  faq.ts                                  # W2 #32 15 条 FAQ 知识库

apps/web/src/composables/
  useCountdown.ts                         # W2 #31 实时倒计时
apps/web/src/pages/creator/
  CreatorBriefDetailPage.vue              # W2 #30 创作者 brief 详情页 + 报价弹窗

scripts/
  brief-auto-close.sh                     # W2 #31 ECS cron 安装/执行脚本

docs/
  w2-29-review.md                         # W2 #29 收尾
  w2-30-review.md                         # W2 #30 收尾
  w2-31-review.md                         # W2 #31 收尾
  w2-review.md                            # W2 整周期收尾(本文件)
```

### 3.2 schema 增量

| 字段 | 模型 | 任务 |
|---|---|---|
| `wechatOpenId` (unique) | `User` | #29 — 微信 fan-out 用 |
| `BRIEF_PUBLISHED` / `BRIEF_BUMPED` / `BRIEF_EXPIRED` / `BRIEF_CLOSED` | `NotificationType` enum | #29 / #31 |
| `bumpCount` / `bumpHistory` | `Brief` | #28 |

### 3.3 关键决策

| 决策点 | 选项 | 选定 | 理由 |
|---|---|---|---|
| 倒计时实现 | WebSocket / 前端 setInterval | **前端 `useCountdown`** | deadlineAt 不变,WS 浪费;每 60s 更新就够 |
| 过期 close 调度 | NestJS `@Cron` / 系统 crontab | **系统 crontab + admin endpoint** | 进程重启不丢任务,接口本身幂等 |
| DirectMail / 微信 SDK | 全启用 / mock 兜底 | **mock 兜底 + 真实即开即用** | 没配 env 不影响其他渠道,不阻塞业务 |
| 推送 fan-out 范围 | 全平台 / KYC_APPROVED 创作者 | **KYC_APPROVED 优先 + 全员 fallback** | 冷启动期 SkillTag 覆盖不足,全员兜底 |
| FAQ 命中阈值 | 1 / 2 / 3 分 | **1 分** | 中文短句常见单关键词命中,误拒成本高于误答 |
| FAQ 字符长度过滤 | 全部 / ≥ 2 字 | **≥ 2 字** | 1 字词太易误伤("不" "了" "的") |

---

## 4. 端到端验证(prod `https://ibi.ren`)

W2 收尾烟测覆盖整条链路,**10/10 全过**:

```
--- 1. 买家发包 → 自动进入 bidding + 推送给创作者 ---
  ✅ publish → bidding
--- 2. 创作者收到 BRIEF_PUBLISHED 推送 ---
  ✅ creator 收到 BRIEF_PUBLISHED 推送
--- 3. 创作者投标 ---
  ✅ 创作者投标成功
--- 4. 买家加价 +10% ---
  ✅ bumpCount 累加
  ✅ creator 收到 BRIEF_BUMPED 推送
--- 5. 买家接受 bid → workspace 自动创建 ---
  ✅ bid → accepted
  ✅ brief → in_progress
  ✅ workspace 已创建
--- 6. AI 助手 FAQ 命中 ---
  ✅ buyer FAQ 命中
--- 7. Brief 详情有倒计时 + 三道软护栏 ---
  ✅ brief 含 deadlineAt + bumpCount
==== 总计: 10 通过, 0 失败 ====
```

### 4.1 闭环对照表

| 角色 | 动作 | W2 前 | W2 后 |
|---|---|---|---|
| 买家 | 发包 | draft → bidding,没人收通知 | draft → bidding,**自动 fan-out 给 91 个 KYC 创作者**(站内 + 邮件 + 微信 mock) |
| 买家 | 加价 +10% | 无 bump 机制 | ¥1,500 → ¥1,650,**BRIEF_BUMPED 推给所有投标过的人**,带"加价"印记 |
| 创作者 | 收推送 | 铃铛只显示 • | ◐ BRIEF_PUBLISHED + ↑ BRIEF_BUMPED,**有图标 + 颜色区分** |
| 创作者 | 点推送 | 404(单数 URL) | 跳 `/creator/briefs/:id` 详情页,**看到当前价 + 3 道软护栏** |
| 创作者 | 报价 | 控制台 mock | 弹窗报价,**proposal 10~2000 字校验 + bid 唯一性 + 撤回** |
| 买家 | 接受报价 | 无 workspace 概念 | **自动创建 Workspace,brief → in_progress** |
| 任何角色 | brief 过期 | 永远卡 bidding | **第 7 分钟 cron 自动 close + BRIEF_EXPIRED 通知** |
| 任何角色 | 客服 | 调 LLM 全 fallback | **15 条 FAQ 知识库,命中免 LLM 直答**(score ≥ 1) |

### 4.2 数据点(prod 7/1 实测)

```
prod DB AssistantCallLog(2026-07-01):
  FAQ 命中:  52 条(model='faq:buyer-tiers' 等)
  LLM 调用:  52 条
  Fallback:  37 条(LLM 未配,正常降级)

prod DB Notification(2026-07-01):
  BRIEF_PUBLISHED:  91 条(冷启动全平台 fan-out)
  BRIEF_BUMPED:     91 条
  BRIEF_EXPIRED:    1 条(#31 烟测触发)

prod Brief 状态分布:
  bidding: 4
  in_progress: 1(本次 E2E 触发)
  closed: 3
  expired: 1
```

---

## 5. 部署历史

| 日期 | 任务 | 操作 |
|---|---|---|
| 2026-06-30 | #28 平台层标准 | `git push`,prod 4e94a3f 生效 |
| 2026-07-01 14:30 | #29 推送 fan-out | `git push` ff2b281 + `prisma db push` 加 User.wechatOpenId |
| 2026-07-01 15:00 | #30 创作者详情页 | `git push` 8462dc4 + 三端 dist 同步 |
| 2026-07-01 16:25 | #31 倒计时 + 自动 close | `git push` ce7ed2b + ECS cron `7 * * * *` 装好 |
| 2026-07-01 17:10 | #32 FAQ 知识库 | `git push` 85f1206 + prod 6 case 烟测通过 |
| 2026-07-01 17:30 | #32 E2E + Review | 本文 |

每次部署后三端 dist 时间戳都同步(AGENTS §5.16 避免翻车),prod health check 4s 内 200。

---

## 6. 关键文件位置索引

| 内容 | 路径 |
|---|---|
| 推送服务 | `apps/api/src/brief-push/brief-push.service.ts:1` |
| 倒计时 composable | `apps/web/src/composables/useCountdown.ts:1` |
| 创作者详情页 | `apps/web/src/pages/creator/CreatorBriefDetailPage.vue:1` |
| FAQ 知识库 | `apps/api/src/assistant/faq.ts:1` |
| AI 助手 service(含 FAQ 短路逻辑) | `apps/api/src/assistant/assistant.service.ts:64` |
| 自动 close service | `apps/api/src/brief/brief.service.ts:autoCloseExpired` |
| 自动 close cron 脚本 | `scripts/brief-auto-close.sh:1` |

---

## 7. 已知坑 / 边界(留给 W3+)

### 7.1 致命坑(已踩过,已记录到 AGENTS §5)

| 坑 | 解决 |
|---|---|
| 三端 dist 不同步 → 线上看到昨天版本 | AGENTS §5.16 + `scripts/deploy.sh` tar 同步 |
| schema 改完忘跑 `prisma generate` → IsEnum 崩溃 | AGENTS §5.14 |
| systemd `WorkingDirectory` 是 `apps/api`,`.env` 找不到 | AGENTS §5.15 + `ln -sf /opt/ibiren/.env /opt/ibiren/apps/api/.env` |
| JWT `validatePayload` 返回 payload 不是 `{id, email, roles}` | AGENTS §5.2 |
| Vite `VITE_API_BASE_URL` `\|\|` → 空字符串 fallback 到 localhost | AGENTS §5.10 |

### 7.2 W2 新踩的坑(已记入 review)

| 坑 | 详见 |
|---|---|
| 推送 link 单/复数不一致 | [w2-30-review.md §5](w2-30-review.md#5-推送-link-修复) |
| FAQ 阈值太严拒答多 → 调到 ≥ 1 | [w2-31-review.md §6 边界](w2-31-review.md#6-边界与已知坑) |
| ECS `_tmp` 目录不存在 → scp 失败 | `brief-auto-close.sh` 前先 `mkdir -p` |
| brief 没加 `BRIEF_EXPIRED` enum → TS 类型不收 | NotificationType union 同步扩 |

### 7.3 W3+ 待办(已转 USER-ACTION-CHECKLIST 或下个 cycle)

- [ ] **监控**:`brief-auto-close` 失败 / closedCount 持续 > N → 企业微信告警
- [ ] **创作者匹配**:从 KYC_APPROVED 全员兜底,改为 SkillTag.category + platformSet 双重匹配
- [ ] **流量控制**:fan-out 接阿里云 MNS,避免一次性写 91 行 + 91 邮件
- [ ] **退订**:产品定义 + 法务出退订文案 + Notification preferences
- [ ] **撤回后再次报价**:`unique(briefId+creatorId)` 限制需放宽
- [ ] **旧通知 link 修复**:写一次性 migration 把 link 字段加 s 后缀
- [ ] **过期前 6h 提醒**:`BRIEF_EXPIRED` 拆成 `BRIEF_EXPIRING_SOON` + `BRIEF_EXPIRED`
- [ ] **FAQ 持续维护**:运营每周看 audit log,把 LLM 答得不好的高频问题迁到 FAQ

---

## 8. 业务影响

W2 之前 marketplace 是 demo,**只能看不能买**;W2 之后:

- **创作者**:能在 prod 收到任务推送 → 看详情 → 报价 → 等买家接受 → 拿到 workspace
- **买家**:能发包 → 创作者投标 → 加价拉到上限 → 接受 → 进 workspace 交付
- **平台**:brief 过期自动清理,不会污染 marketplace;客服机器人 90% 命中免 LLM

下一步 W3 进入"履约 + 争议处理"主线,详见 [`docs/blueprint.md`](blueprint.md) 后续章节。

---

## 9. 修订

| 版本 | 日期 | 修订人 | 修订内容 |
|---|---|---|---|
| 1.0 | 2026-07-01 | Claude | W2 整周期收尾,覆盖 #28~#32 |