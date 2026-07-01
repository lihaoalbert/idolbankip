# W2 #31 Review — 报价倒计时 + 过期自动 close

> 完成日期: 2026-07-01
> 任务编号: [W2] #31
> 范围: 后端自动 close + 前端实时倒计时 + ECS cron

---

## 1. 背景

W1 实现的 brief 是固定截止时间,买家发包后**没人接单**就永远卡在 `bidding` 状态,需要手动 close。
需求:
- 买家和创作者在 brief 详情页能**实时看到倒计时**(剩多久截止)
- 超过 `deadlineAt` 还在 `bidding` 的 brief,系统**自动 close**,避免幽灵订单污染 marketplace

---

## 2. 方案选型

### 2.1 倒计时: 前端实时计算 vs 后端推送
- **前端**: `useCountdown` composable, 每 60 秒更新一次 `Date.now()`, 派生 `days/hours/minutes/expired` 状态
- ❌ **后端推送**: WebSocket 浪费,且 deadlineAt 不会动态变化
- ✅ 选前端 — 简单、零额外基建

### 2.2 自动 close: cron vs scheduler vs 异步
- ❌ **NestJS @Cron 装饰器 + @Schedule**: 进程重启会丢任务,多实例会重复跑
- ✅ **系统 crontab + admin endpoint**: 幂等, 易回滚, 日志走 `/var/log/ibiren/`
- 关键:**接口本身要幂等**(`status='bidding'` filter), 不能依赖 cron 单实例

---

## 3. 代码变更

### 3.1 后端 (`apps/api`)

**`brief/brief.service.ts`** — 新增 `autoCloseExpired()`:

```ts
async autoCloseExpired(): Promise<{ closedCount: number; closedIds: string[]; expiredAt: string }> {
  const now = new Date();
  const expired = await this.prisma.brief.findMany({
    where: { status: 'bidding', deadlineAt: { lt: now } },
    select: { id: true, buyerId: true, title: true },
    take: 200, // 防一次处理太多
  });
  if (expired.length === 0) return { closedCount: 0, closedIds: [], expiredAt: now.toISOString() };
  const ids = expired.map(b => b.id);
  await this.prisma.brief.updateMany({
    where: { id: { in: ids } },
    data: { status: 'closed' },
  });
  // 给每个买家发 BRIEF_EXPIRED 通知(站内 + 邮件 + 微信 fan-out)
  for (const b of expired) {
    await this.notif.create({
      userId: b.buyerId,
      type: 'BRIEF_EXPIRED',
      title: '⏰ 任务包已过期关闭',
      body: `「${b.title}」已超过截止时间未有人接单,系统已自动关闭。可重新发包或调整预算。`,
      link: `/buyer/briefs/${b.id}`,
    });
  }
  return { closedCount: expired.length, closedIds: ids, expiredAt: now.toISOString() };
}
```

**`brief/brief.controller.ts`** — 新增 endpoint:

```ts
@Post('auto-close-expired')  // POST /admin/briefs/auto-close-expired
async autoCloseExpired() { return this.briefs.autoCloseExpired(); }
```

**`brief/brief.module.ts`** — `imports: [BriefPushModule, NotificationsModule]`

**`notifications/notifications.service.ts`** — 扩展 TypeScript union: `+ BRIEF_EXPIRED | BRIEF_CLOSED`

### 3.2 前端 (`apps/web`)

**`composables/useCountdown.ts`** (新, 73 行):

```ts
export type CountdownVariant = 'normal' | 'danger' | 'expired';
export function useCountdown(deadlineGetter: () => string | null | undefined) {
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;
  onMounted(() => { timer = setInterval(() => (now.value = Date.now()), 60_000); });
  onBeforeUnmount(() => { if (timer) clearInterval(timer); });

  const remainingMs = computed(() => {
    const dl = deadlineGetter();
    if (!dl) return 0;
    return new Date(dl).getTime() - now.value;
  });

  const expired = computed(() => remainingMs.value <= 0);
  const variant = computed<CountdownVariant>(() => {
    if (expired.value) return 'expired';
    if (remainingMs.value < 24 * 3600_000) return 'danger';  // 剩 < 24h 标红
    return 'normal';
  });
  const label = computed(() => {
    if (expired.value) return '已过期';
    const d = Math.floor(remainingMs.value / 86_400_000);
    const h = Math.floor((remainingMs.value % 86_400_000) / 3_600_000);
    const m = Math.floor((remainingMs.value % 3_600_000) / 60_000);
    if (d > 0) return `剩 ${d} 天 ${h} 小时`;
    if (h > 0) return `剩 ${h} 小时 ${m} 分钟`;
    return `剩 ${m} 分钟`;
  });
  return { remainingMs, expired, variant, label };
}
```

**`pages/buyer/BriefDetailPage.vue`** — 在 PRICING 和 BUMP HISTORY 之间嵌入倒计时
**`pages/creator/CreatorBriefDetailPage.vue`** — 顶部副标题的 "X 天截止" 替换为 `countdown.label.value`

**`components/NotificationBell.vue`** + **`pages/NotificationsPage.vue`** — 加 `BRIEF_EXPIRED (⏰)` 和 `BRIEF_CLOSED (×)` 印记

### 3.3 部署自动化 (`scripts/brief-auto-close.sh`)

```bash
# usage:
#   bash scripts/brief-auto-close.sh once      # 跑一次
#   bash scripts/brief-auto-close.sh install    # 装到 ECS crontab

# install 模式:SSH 到 ECS,装
#   7 * * * * /opt/ibiren/scripts/brief-auto-close.sh >> /var/log/ibiren/brief-auto-close.log 2>&1
# 故意选第 7 分,避开 :00 / :30 的整点峰值
```

凭据 (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) 从 `scripts/deploy.env` 读 — gitignored,不外传。

---

## 4. 部署

```bash
pnpm --filter @ibi-ren/api run build       # 142 .js 落到 dist/
pnpm --filter @ibi-ren/web run build       # 含 useCountdown + 印记更新
pnpm --filter @ibi-ren/admin run build     # 无改动, 顺便确认未回归
bash scripts/deploy.sh                     # sync 3 端 + restart + smoke
```

`scripts/deploy.env` 同步加了:
```bash
ADMIN_EMAIL=admin@ibi.ren
ADMIN_PASSWORD=Focus_2026!  # seed 默认值
```

ECS 上的 cron 安装:
```bash
$ bash scripts/brief-auto-close.sh install
==== 装 auto-close 到 ECS crontab (每小时第 7 分) ====
  ✅ crontab 已装
7 * * * * /opt/ibiren/scripts/brief-auto-close.sh >> /var/log/ibiren/brief-auto-close.log 2>&1
```

---

## 5. 烟测

### 5.1 本地烟测 (前置)
```bash
# 发一个 bidding brief → prisma backdate deadlineAt 到过去
# → POST /admin/briefs/auto-close-expired
# → 期望: status='closed', 买家收到 BRIEF_EXPIRED 通知
✅ closedCount=1
✅ BRIEF_EXPIRED 通知存在, link 正确
✅ 二次调用 closedCount=0 (幂等)
```

### 5.2 Prod 烟测 (`https://ibi.ren`)
完整 e2e:
```
1. buyer_001 登录 ✅
2. 创建 draft brief ✅
3. publish → bidding ✅
4. ECS 上 prisma backdate deadlineAt 到 1 小时前 ✅
5. admin auto-close → closedCount=1 ✅
6. brief.status=closed ✅
7. 买家收到 BRIEF_EXPIRED 通知, link=/buyer/briefs/{id} ✅
```

---

## 6. 边界与已知坑

| 项 | 处理 |
|---|---|
| **进程重启/多实例重复跑** | 接口幂等 (`status='bidding'` filter),第二次 closedCount=0 |
| **大量 brief 同时过期** | `take: 200` 截断,下一小时 cron 接着处理 |
| **cron 没跑(进程死/系统重启)** | 数据最多延后 1 小时关闭,业务可接受; 监控告警 W5 加 |
| **scp _tmp 目录不存在** | `mkdir -p /opt/ibiren/scripts/_tmp` 已在脚本前先建好 |
| **ECS .env 不在 path** | `brief-auto-close.sh` 通过 `source $ECS_PROJECT_DIR/.env` 注入 |

---

## 7. 后续 (W3+)

- [ ] **W3**: 加监控 — cron 失败 / closedCount 持续 > N 时发企业微信告警
- [ ] **W3**: buyer 可设"过期前 6h 短信提醒" → 把 BRIEF_EXPIRED 拆成 `BRIEF_EXPIRING_SOON` + `BRIEF_EXPIRED`
- [ ] **W5**: 不只 close,超过 N 天没人接 → 自动退款(若有预付)或自动改推给其他创作者