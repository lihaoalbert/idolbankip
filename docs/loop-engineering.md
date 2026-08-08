# ibi.ren · Loop Engineering 规范

> 把"自主决策 + 自动尝试 + 自动测试 + 验收成果"做成 ibi.ren 项目的可重复使用安全模式。
>
> 适配自 [[ni/backend Loop Engineering]];差异点在 §七。
>
> 配套使用:`CLAUDE.md`(协作准则) + `AGENTS.md`(接手必读) + `docs/deploy.md`(部署手册)

---

## 1. TL;DR

**Loop Engineering = 在 7 道护栏里,让 Claude 自主迭代直到目标达成。**

```
┌──────────────────────────────────────────────────────────────────┐
│  1. Goal Contract         — 目标写死,机器可读(zod / TS interface)
│  2. Invariant Protection  — 旧测试不能挂,三端 build 都得过
│  3. Test-Driven           — 测试先写,代码后写
│  4. Iteration Budget      — N 轮没成,停下问人
│  5. Review Checkpoints    — CLAUDE.md §2 严禁事项全部硬卡
│  6. 三端同步 (ibi.ren 独有)— 改 api 必 build+sync web+admin
│  7. OSS / 阿里云 API 安全(ibi.ren 独有)
└──────────────────────────────────────────────────────────────────┘
         ↓
  Claude 在这个框里自主循环 ─→ 安全、可审计、可回滚
```

---

## 2. 为什么 ibi.ren 需要 Loop Engineering

ibi.ren 是**多人多端带生产部署**的项目(不是 ni/backend 那种单机原型),Claude 自主空间比 ni 严得多:

| 维度 | ni/backend | ibi.ren |
|---|---|---|
| 端数 | 单后端 (FastAPI) | **三端** (NestJS api + Vue web + Vue admin) |
| 部署 | 本地 / 容器 | **阿里云 ECS 生产** (systemd + nginx) |
| 数据 | 内存 + Qdrant | **PostgreSQL + Prisma + 阿里云 OSS** |
| 凭据 | .env 几行 | **OSS / 阿里云 KYC / SMS / OSS STS** 多套 |
| 用户 | 1 开发者 | 1 老板 + 客户(创作者/买家) |
| 误操作代价 | 重启 | **生产事故 + 客户资产损失** |

所以 ibi.ren 的 Loop Engineering **比 ni 多 3 道硬护栏**(5/6/7),且每次 Loop 收尾必须走 `scripts/smoke.sh`。

---

## 3. 7 个护栏

### 3.1 Goal Contract(目标契约)— 写 zod schema,不是 markdown

ni 用 YAML,ibi.ren 用 **TypeScript interface + zod**(与现有 NestJS 一致,IDE 可校验):

```typescript
// ✅ 机器可读、自动生成 .d.ts、DTO 复用
const LoopGoal = z.object({
  target: z.string(),  // 'KYC 实人认证接入阿里云'
  acceptance: z.array(z.string()).min(1),  // 验收清单,每条都是测试
  notAcceptance: z.array(z.string()).optional(),  // 自由空间
});

const KYCLoopGoal: z.infer<typeof LoopGoal> = {
  target: 'KYC 真实接入阿里云实人认证 + OCR 营业执照',
  acceptance: [
    'POST /kyc/verify-face 调用阿里云绿墙成功,返回 confidence >= 0.95',
    'POST /kyc/ocr-license 提取统一社会信用代码正则匹配 GB 标准',
    '审核状态机:PENDING → APPROVED/REJECTED 流转正确',
    'MOCK_KYC=true 时 fallback 到 mock,生产环境必须 false',
  ],
  notAcceptance: ['用哪个阿里云 SDK 版本', 'token 怎么缓存', '失败重试几次'],
};
```

**关键**:`acceptance` 每条 → 必须有对应 `*.spec.ts` 测试,测试写不出来 = 验收不清晰,停下问老板。

---

### 3.2 Invariant Protection(不变量保护)— 三端基线 + smoke

ni 用 `pytest --tb=no -q | tail -1`,ibi.ren 多端:

```bash
# Loop 开始前:记录基线
pnpm --filter @ibi-ren/api test 2>&1 | tail -1 > .baseline-api
pnpm --filter @ibi-ren/web test 2>&1 | tail -1 > .baseline-web
pnpm --filter @ibi-ren/admin test 2>&1 | tail -1 > .baseline-admin
# 期望格式: "Tests: 87 passed, 87 total"

# 任何 commit 前:三端基线都不能掉
for f in .baseline-*; do
  CURRENT=$(pnpm --filter "@$(basename $f .baseline-api | sed 's/api$/ibi-ren\/api/')" test 2>&1 | tail -1)
  BASELINE=$(cat $f)
  if [ "$CURRENT" != "$BASELINE" ]; then
    echo "❌ 回归! $f: $BASELINE → $CURRENT"
    exit 1
  fi
done
```

**回归处理**:
- 任何测试数下降 → 立刻停下,先修回归,再做新功能
- 重构和加新功能**不在同一个 commit**(防混淆)

---

### 3.3 Test-Driven(测试先行)— NestJS 风格

```typescript
// ❌ 先写实现,后补测试
@Post('verify-face')
async verifyFace(@Body() dto: FaceDto) {
  return this.kycService.verifyFace(dto);
}

// 然后想"我应该测啥呢?"

// ✅ 先写测试,把行为契约定死
describe('KycController.verifyFace', () => {
  it('should return APPROVED with confidence >= 0.95 on valid face', async () => {
    const result = await controller.verifyFace(mockFaceDto);
    expect(result.status).toBe('APPROVED');
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });
  it('should return REJECTED with reason on low confidence', async () => {
    // sad path
  });
  it('should fallback to MOCK when MOCK_KYC=true', async () => {
    // 配置分支
  });
});
```

**为什么**:NestJS 的 DTO + Service + Controller 三层结构,测试一旦写完,Claude 已经被约束在契约里,不会写出过度设计。

---

### 3.4 Iteration Budget(迭代预算)— 一轮 = 三端 build

| Loop 复杂度 | 建议 budget | 一轮 = 啥 |
|---|---|---|
| 简单 UI 调整 | 2-3 轮 | `pnpm --filter web build` + 浏览器目测 |
| 中等(加新模块) | 4-6 轮 | api spec + impl + build + smoke |
| 复杂(跨模块 + 改 schema) | 8-10 轮 | prisma generate + migrate + 三端 build + smoke + ECS deploy |

**反模式**:
- "再试一次"死循环 → token 烧光,默认 5 轮不到停下
- 不设预算 → Claude 不知道何时该停

**ibi.ren 特色**:每轮结束必须跑:

```bash
bash scripts/smoke.sh local  # 本地(改 api 必跑)
# 改 schema 加跑:
pnpm --filter @ibi-ren/api exec prisma db push
```

---

### 3.5 Review Checkpoints(评审节点)— CLAUDE.md §2 硬卡

直接套 `CLAUDE.md` §2 严禁事项 + `AGENTS.md` §5 已知坑:

| 决策类型 | Claude 自主? | 原因 |
|---|---|---|
| 文件命名 / 目录组织 | ✅ | 内部细节 |
| 实现细节(算法、缓存策略) | ✅ | 测试通过即可 |
| 加几行注释解释 WHY | ✅ | 风格统一 |
| **公共 API / DTO 签名变更** | ❌ review | 下游消费方挂 |
| **Prisma schema 变更** | ❌ review | 不可逆数据迁移 |
| **新增 npm 依赖** | ❌ review | bundle size + 供应链 |
| **删文件 / 删代码块** | ❌ review | 不可逆 |
| **改 .env / .env.production** | ❌ review | 凭据安全 + 部署配置 |
| **改 nginx / systemd** | ❌ review | 生产事故 |
| **改 git config / hooks** | ❌ review | 影响所有 commit |
| **git push** | ❌ review | CLAUDE.md §2 |
| **生产 ECS 重启服务** | ❌ review | 不可逆 |
| **OSS / 阿里云 API 改 region** | ❌ review | 数据位置合规 |
| **改 KYC 阈值 / 风控规则** | ⚠️ review | 业务规则,落 DB+seed(用户偏好) |
| **改积分 / 徽章 / 价格** | ⚠️ review | 业务规则 |

---

### 3.6 三端同步(ibi.ren 独有 — 防 §5.16 经典踩坑)

`CLAUDE.md` §5.16 / `AGENTS.md` §5.16 是"只 sync api 出现 API 数据正常但页面是昨天版本"。**任何改 api 的 loop,Claude 必须**:

```bash
# Loop 收尾:三端 dist 时间戳必须一致
for app in api web admin; do
  echo "=== $app ==="
  stat -c '%y %n' "apps/$app/dist/$(test "$app" = "api" && echo main.js || echo index.html)"
done
# 期望:三个时间戳都是同一天(loop 结束时间)
```

**反模式**:
- 改 api 觉得"前端没用到" → 用户三天后才发现是旧版
- 改 web 觉得"api 没影响" → API 返了新字段前端没显示

---

### 3.7 OSS / 阿里云 API 安全(ibi.ren 独有)

KYC / OSS / SMS 都是外网 API,**账号凭据在 .env 永远 git ignored**:

```bash
# Loop 开始前:确认 .gitignore 含 .env(永远)
git check-ignore -v apps/api/.env
# 期望: .gitignore:XX:.env

# Loop 收尾:pre-commit 钩子扫 secret
git diff --staged | grep -iE "LTAI[A-Za-z0-9]{12,}|AccessKey|password\s*[:=]|secret\s*[:=]|BEGIN.*PRIVATE|BEGIN.*RSA"
# 命中即 abort
```

**OSS 签名 URL Bug**(`AGENTS.md` §5.12 / commit `67055a7`)是经典踩坑 — 永远用 SDK(`ali-oss`),不要手写 SignatureV2。

---

## 4. 3-Phase 渐进模式(ibi.ren 适配)

```
Phase A: Skeleton (骨架)
  ├── schema / 控制器 stub / 占位实现
  ├── "调用链通",实现可以是假
  └── 验收: 测试红→绿,Prisma 改过要 generate,API 启动能跑

Phase B: Real Impl (真实实现)
  ├── 把 Phase A 的占位换成真实现
  ├── 处理边界 case(超时 / 鉴权失败 / 第三方 API 限流)
  └── 验收: happy path + sad path 测试都过,smoke 通过

Phase C: Production Switch (生产开关)
  ├── 加 feature flag(env 控制,默认 off)
  ├── 文档说明怎么开
  └── 验收: flag=off 旧行为不变,flag=on 新行为生效;ECS 跑过 smoke
```

**ibi.ren 真实案例**:

| Loop | Phase | 产出 | commit |
|---|---|---|---|
| 阿里云 KYC 接入 | A → B → C | mock → 实人认证 → `KYC_PROVIDER=alicloud\|mock` 开关 | `d4adfed` |
| OSS PDF 中文化 | A → B | 字体占位 → Noto Sans SC TTF + subset:false | `4578f20` |
| Honor 荣誉系统 | A → B | schema + 后端 → 前端 UI | `9f687ab` / `7ab7c51` |

---

## 5. 风险矩阵(ibi.ren 特有)

| 风险 | 概率 | 严重度 | 缓解措施 |
|---|---|---|---|
| Claude 改了不该改的文件 | 中 | 高 | 护栏 5: Review checkpoints |
| 改 api 不同步 web/admin | 高 | 高 | 护栏 6: 三端 dist 时间戳校验 |
| 测试写得太松 | 中 | 中 | 护栏 3: 测试包含行为验证 |
| Prisma schema 改坏数据 | 低 | 极高 | 护栏 5: schema 变更必 review |
| OSS 凭据泄漏到 git | 低 | 极高 | 护栏 7: .gitignore + pre-commit 钩子 |
| KYC 调用超额被阿里云限流 | 中 | 中 | Phase A 用 mock,Phase B 加 rate limit |
| `localhost:3000` 漏到生产 dist | 中 | 高 | CLAUDE.md §5.10 硬规则:grep -c 必须为 0 |
| systemd WorkingDirectory 错 | 低 | 高 | CLAUDE.md §5.15:`ln -sf /opt/ibiren/.env apps/api/.env` |
| `IsEnum` 装饰器生产 crash | 中 | 高 | CLAUDE.md §5.14:prisma generate 必跑 |
| `validatePayload` 返错字段 | 中 | 高 | CLAUDE.md §5.2:auth ownership 全部失效 |

---

## 6. Claude 自主决策边界(ibi.ren 版)

### 6.1 ✅ Claude 可自主

- 文件命名 / 目录组织(项目内已有规范)
- 内部函数实现(测试通过即可)
- 选哪个 npm 包 / 哪个 version(单不要超过 5 个新增)
- 加几行注释解释 WHY(不写 WHAT)
- 写新的 helper / util
- 跑测试 / build / smoke 验证
- **业务规则落 DB + seed**(CLAUDE.md 用户偏好)
- 改 KYC mock 行为(不影响生产 flag)

### 6.2 ⚠️ Claude 自主,但 commit message 说明

- 加新 npm 依赖(写明为什么需要、版本、对 bundle size 影响)
- 加新 .env 配置 flag(写明默认值 + 怎么开 + 怎么回滚)
- 改默认值(写明影响范围 + 回滚步骤)
- 改 Prisma schema 的 enum 顺序(不破坏语义,只排序)

### 6.3 ❌ 必须停下问人(REVIEW CHECKPOINT)

- 删文件 / 删代码块 / 删 migration
- 改 Prisma schema(任何字段类型变更、必填变更、关系变更)
- 改公共 API / DTO 签名 / nestjs 控制器路径
- 加/减 npm 依赖(`package.json` 改动,除 dev 依赖)
- 改 .env 模板 / .env.production
- 改 nginx / systemd / docker-compose
- 改 git config / hooks
- 改积分 / 徽章 / 价格 / 阈值(业务规则,虽然落 DB 但要老板拍板)
- `git push` / `git push --force` / `gh pr create` / 发 issue / 发邮件
- 生产 ECS 任何 `systemctl restart` / `nginx -s reload` / `drop table` / `rm -rf`
- OSS / KYC / SMS 凭据变更(凭据安全)
- 跨 region 数据迁移

---

## 7. 与 ni/backend Loop Engineering 的差异点

| 差异 | ni/backend | ibi.ren |
|---|---|---|
| Goal Contract 格式 | YAML | **TypeScript + zod**(项目语言) |
| 测试框架 | pytest | **Vitest / Jest**(NestJS 默认) |
| 不变量 | 单后端测试数 | **三端测试数 + 三端 dist 时间戳** |
| 部署 | 本地 / 容器 | **阿里云 ECS 生产**(systemd + nginx) |
| 凭据 | .env 几行 | **OSS / KYC / SMS / OSS STS**(多套) |
| Review Checkpoint 来源 | Loop 实战总结 | **CLAUDE.md §2 严禁事项 + AGENTS.md §5 已知坑** |
| smoke 工具 | 自写 curl | **`scripts/smoke.sh local\|ecs`** |
| Loop 收尾 | 测试通过 | **测试 + build + smoke + ECS deploy(若要)** |
| 业务规则位置 | 代码常量 | **DB + seed(用户偏好 config-driven)** |

---

## 8. 实战模板(下次直接抄)

### 8.1 开场:写 Loop Goal

```markdown
## Loop N: {目标名}

### Goal Contract
\`\`\`typescript
const goal: LoopGoal = {
  target: '...',
  acceptance: ['测试 1: 行为契约', '测试 2: sad path'],
  notAcceptance: ['选哪个 SDK', '缓存策略'],
};
\`\`\`

### Invariants
- 当前 api test 基线: 87 passed
- 当前 web build: dist 时间戳 2026-06-23 14:32
- 当前 admin build: dist 时间戳 2026-06-23 14:32
- 三端 dist 时间戳必须保持一致(护栏 6)

### Review Checkpoint 计划
- Phase A 结束: 给老板看 schema diff
- Phase B 结束: 给老板看 smoke 输出
- Phase C 结束: 给老板看 .env.example 改动
```

### 8.2 中间:每个 commit 前

```bash
# 三端基线
pnpm --filter @ibi-ren/api test 2>&1 | tail -1
pnpm --filter @ibi-ren/web test 2>&1 | tail -1
pnpm --filter @ibi-ren/admin test 2>&1 | tail -1

# 改 schema 加跑
pnpm --filter @ibi-ren/api exec prisma generate

# smoke (改 api 必跑)
bash scripts/smoke.sh local
```

### 8.3 收尾:Review Checkpoint 清单

```markdown
- [ ] 新增/改了哪些公共 API?(列出来)
- [ ] 加新 npm 依赖了吗?(写明为什么)
- [ ] 改 Prisma schema 了吗?(migration 文件路径)
- [ ] 改 .env 模板了吗?(写明默认值)
- [ ] 三端 dist 时间戳一致吗?
- [ ] 删了什么吗?(必须列)
- [ ] smoke 通过了吗?
- [ ] 测试基线: api ___ passed / web ___ / admin ___(开 loop 时分别是多少)
```

---

## 9. 给未来的自己

> **Loop Engineering 不是"让 AI 替代你",而是"让 AI 在你定的规则里加速"。**
>
> 你仍然要:
> 1. 写 Loop Goal(机器读不懂"差不多就行")
> 2. 在 Review Checkpoint 拍板(Prisma schema、API 签名、删除、生产操作)
> 3. 签 commit / push(用户偏好 — 一个完整 commit 就 push)
>
> Claude 负责:
> 1. 在你的 7 道护栏里尝试各种实现
> 2. 跑测试 + build + smoke 反馈结果
> 3. 在 budget 内自主迭代到绿,触发 review checkpoint 时停下
>
> ibi.ren 比 ni 严 — 因为有生产、有客户资产、有三端同步陷阱。
> **严 ≠ 慢,反而是一次写对,生产零事故。**

---

## 10. 变更历史

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-06-23 | 初版,基于 ni/backend Loop Engineering 适配 ibi.ren 三端架构与阿里云生产环境 |
