# 平台层标准 v1 — 公信力底层

> **版本**:v1.0 草拟稿
> **生成日期**:2026-07-01
> **定位**:W2 阶段 1 第一交付物 — 平台公信力底层,**先于**双边 Agent 上线
> **配套**:`docs/legal/2026-user-agreement-v2.md` · `docs/plans/2026-plan-c-aigc-crowdsourcing.md`
> **维护原则**:**所有标准都在平台手里,双边 Agent 是标准的"使用者",不是"制定者"**。

---

## 0. 一句话

> ibi.ren 平台的核心壁垒不是撮合效率,是 **"标准制定者 + 清算者 + 争议仲裁者"** 的角色。双边 Agent 来之前,平台标准必须先立得住。

---

## 1. 为什么平台标准要先于双边 Agent

| 顺序 | 角色 | 公信力来源 |
|---|---|---|
| **阶段 1 (W2)** | 平台 Agent 先行 | 平台定义的"标准答案"是唯一公信依据 |
| 阶段 2 (W5) | 平台 + 卖家 Agent | 卖家 Agent 调用平台标准 API 报价/接单 |
| 阶段 3 (W11) | 平台 + 双边 Agent | 买家 Agent 拆 brief,调用平台标准生成任务包 |

**反之会怎样**:
- 双边 Agent 先上线 → 创作者 Agent 报 ¥500,买家 Agent 报 ¥2000,平台没标准答案就仲裁不了 → 平台沦为"信使"
- 平台标准先立 → 双边 Agent 调用平台 API(查 SKU、查 acceptanceChecklist、查价格区间),所有动作在标准内 → 平台有"标准答案"做仲裁 → 平台是"裁判"

---

## 2. 平台标准的 4 个组成

### 2.1 任务包标准 — Brief Schema 升级

> W1 Brief 表已有 `spec: Json?` 字段。W2 拆 3 个明确字段:

| 字段 | 类型 | 用途 | 谁填 |
|---|---|---|---|
| `standardSkuId` | `String?` | 挂的标准 SKU ID(对应 `CatalogSku` 表) | 买家 Agent 或买家手动 |
| `acceptanceChecklist` | `Json?` | 验收清单(由 LLM 根据 brief 自动生成,平台校验) | 买家 Agent 生成 / 平台 LLM Judge 校验 |
| `addOns` | `Json?` | 加项清单 [{ code, name, price, unit }] | 买家手动 |
| `originalBriefHash` | `String?` | 原始 brief 文档(PDF/DOCX)SHA-256 哈希,本地不传,只传哈希 | 买家 Agent 上传 |

**JSON 模式**(`acceptanceChecklist` 范本):
```json
{
  "version": "1.0",
  "items": [
    { "id": "spec-1", "criterion": "分辨率 1080x1920(竖屏 9:16)", "weight": 0.15, "automated": true },
    { "id": "spec-2", "criterion": "数字人口播时长 30s ± 2s", "weight": 0.20, "automated": true },
    { "id": "spec-3", "criterion": "字幕同步误差 ≤ 0.5s", "weight": 0.15, "automated": true },
    { "id": "spec-4", "criterion": "包含产品核心卖点 3 项", "weight": 0.25, "automated": false },
    { "id": "spec-5", "criterion": "无明星肖像侵权(AI 明星比对 < 0.85)", "weight": 0.25, "automated": true }
  ],
  "passingScore": 0.80
}
```

### 2.2 验收质量标准 — Catalog + 验收模板

> 平台挂 SKU 菜单时,**每个 SKU 配一份默认 acceptanceChecklist 模板**。买家可在模板上增删(增需 ≥3 项,删需 ≥1 项,平台校验不能删关键项)。

```
SKU: AIGC-SHORT-VIDEO-STANDARD-5
  价格: ¥1,700(不可议价)
  默认 acceptanceChecklist 模板: 8 项
  默认 deliveryDays: 14
  默认 ips: 2
  默认 platforms: 3(可加 ¥280/平台)
```

### 2.3 价格标准 — 不可议价菜单 + 加项规则

> 平台挂的三档价目表是 **"标准价,无议价"**;但 SKU 不覆盖的需求走"加项 + LLM 报价"通道。

**价格锚定**(已在 W1 PricingService 落地,这里只是文档化):
- Essential ¥700-1k
- Standard ¥1.4k-2k
- Premium ¥2.5k-3.5k

**加项规则**(公开透明):
- 加 1 个平台: +5%
- 加 1 个 IP: +8%
- 复杂度 high: +30%
- 交付 < 7 天(加急): +25%
- 交付 > 21 天(创作者有时间): -10%

### 2.4 清算标准 — 付款/退款/争议

> 平台清算规则,跟用户协议 v2 §5.2 §5.4 配套,但要更细的"清算规则文档"。

| 阶段 | 动作 | 时间 | 责任方 |
|---|---|---|---|
| 1. 买家发包 + 创作者投标 | 资金冻结在平台账户(平台担保) | 0 | 平台 |
| 2. 创作者中标 + 启动 Workspace | 资金仍冻结 | T0 | 平台 |
| 3. 创作者提交中间稿(可选) | 不动 | T0+7d | — |
| 4. 创作者提交终稿 | 资金仍冻结 | T0+14d | — |
| 5. 买家 Agent 或买家本人验收 | 通过 → 解冻给创作者 | T0+14d+2d 验收 | 买家 |
| 6. 验收不通过 → 进入争议 | 平台仲裁 Agent 出"标准答案" | T0+14d+2d+7d | 平台 |
| 7. 仲裁结果(创作者/买家/各打 50) | 按规则执行 | +3d | 平台 + 人工 |
| 8. 创作者提现(完成首单后开通) | 提现到对公/支付宝 | T+1~3d | 创作者 |

**所有时间窗 + 金额变动在 AuditLog 留痕 3 年**。

---

## 3. 平台仲裁 Agent(LLM Judge)— 第一阶段第一个 Agent

> **这是 W2 阶段 1 的核心 Agent**,**先于** 任何双边 Agent 上线。

### 3.1 它是什么

平台维护的"标准答案"判定器,接收 **交付物 + acceptanceChecklist**,输出 **逐项评分 + 通过/不通过 + 改进建议**。

### 3.2 它不是

- ❌ **不是"判决"**:终极争议仍由 admin /disputes 人工 review(已有 W7 #45 计划)
- ❌ **不是"主动"**:不主动巡检,只在被调用时回答
- ❌ **不是"代用户":**是平台 Agent,**法律责任在平台**(平台对自己的"标准答案"负责)

### 3.3 输入/输出

**输入**:
- 交付物 URL(视频/图片/文档,平台已下载到 OSS)
- 验收清单(acceptanceChecklist JSON)
- 原始 brief spec(可选,用于对照)

**输出**:
```json
{
  "judgeVersion": "1.0",
  "deliverableId": "...",
  "totalScore": 0.83,
  "passingScore": 0.80,
  "overall": "pass",
  "items": [
    { "id": "spec-1", "criterion": "分辨率 1080x1920", "weight": 0.15, "score": 1.0, "pass": true, "evidence": "ffprobe 显示 1080x1920" },
    { "id": "spec-2", "criterion": "数字人口播 30s ± 2s", "weight": 0.20, "score": 0.8, "pass": true, "evidence": "whisper 提取 30.4s" },
    { "id": "spec-4", "criterion": "包含产品核心卖点 3 项", "weight": 0.25, "score": 0.5, "pass": false, "evidence": "仅识别 1.5 项", "suggestion": "补充 2 个卖点段落" }
  ],
  "summary": "总评分 0.83, 通过(阈值 0.80);扣分项:产品核心卖点未充分覆盖"
}
```

### 3.4 调用方式

```
POST /api/v1/platform/judge/deliverable
{
  deliverableId: "...",
  checklist: {...}
}

→ 返回上述 JSON
```

调用方:买家/创作者可主动请求(高级功能);平台 admin /disputes 工单自动调;**后续阶段 2/3,双边 Agent 自动调**。

### 3.5 失败边界

- 交付物无法下载/解析 → 返回 `{ error: "DELIVERABLE_UNREADABLE" }`,不评分
- 验收清单项无法自动检测 → 该项 `automated=false`,platform Agent 留 `score=null, pass=null`,**等人工 review**
- 平台 Agent 自身 LLM 调用失败 → 返回 `{ error: "JUDGE_UNAVAILABLE" }`,争议进入人工

### 3.6 责任边界(关键!)

🚧 **平台仲裁 Agent 是平台 Agent,法律责任在平台,不在用户**:
- 平台 Agent 出错给创作者/买家造成损失 → 平台按"免责上限"承担(用户协议 v2 §11.2)
- 用户在收到平台 Agent 结论后仍坚持某个判断 → 用户承担后续责任
- 平台 Agent 不替代人工 review,只是"加速器"

---

## 4. 平台层标准 vs 双边 Agent(架构图)

```
       ┌─────────────────────────────────────────────┐
       │  平台层 (W2 阶段 1, 优先)                   │
       │  ── 公信力底层 ──                             │
       │                                              │
       │  • 任务包标准 (Brief schema + 标准 SKU)      │
       │  • 验收质量标准 (acceptanceChecklist 模板)   │
       │  • 价格标准 (三档价目 + 加项规则)            │
       │  • 清算标准 (付款/退款/争议路径)             │
       │  • 平台仲裁 Agent (LLM Judge, W2 第一个)    │
       │    ↓                                          │
       │  平台提供: API + 公开文档 (public docs)      │
       └─────────────────┬───────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
      ┌──────────────┐      ┌──────────────┐
      │ Seller Agent │      │ Buyer Agent  │
      │ (W5 阶段 2)  │      │ (W11 阶段 3) │
      │              │      │              │
      │ • 监听新 brief│     │ • 读本地 brief│
      │ • 调 platform │     │ • 调 platform │
      │   标准 API 报价│    │   标准 API 拆 │
      │ • 按 acceptance│   │   成任务包    │
      │   自检        │     │ • 脱敏后传平台│
      │ • 调 platform │     │              │
      │   judge 自评  │     │              │
      └──────┬───────┘      └──────┬───────┘
             │                     │
             └──────────┬──────────┘
                        ↓
              双方 Agent 验收不一致时
                        ↓
              调 平台仲裁 Agent(标准答案)
                        ↓
              admin /disputes 人工兜底(W7)
```

---

## 5. 法律原则(关键!)

> 用户(创始人)2026-07-01 明确:**法律责任在用户(人),即使是全自动 Agent 也是辅助**。

### 5.1 三层法律责任分配

| 主体 | 责任 | 边界 |
|---|---|---|
| **用户(buyer/creator)** | 主责 — Agent 行为视为用户行为 | 用户在激活 SKILL 时签"Agent 操作授权"协议,Agent 在授权范围内的行为法律上等同用户 |
| **平台 Agent(平台仲裁 Agent)** | 平台负责 — 平台对"标准答案"负责 | 平台 Agent 出错 → 平台按用户协议 v2 §11.2 免责上限承担;平台 Agent 是"参考",不替代人工 review |
| **平台标准(API + 文档)** | 平台负责 — 标准要清晰、稳定、可执行 | 标准变更需提前 30 天公告,变更前已发出的 brief 仍按旧标准执行 |

### 5.2 写入用户协议 v2 的补充条款

> 草拟,法务复核后可加到 v2 主文件第 2.5 章:

**§2.5 Agent 行为视为用户行为**
- 用户通过 IBI Agent(包括但不限于 Seller SKILL、Buyer SKILL)代表自身进行的报价、投标、接单、验收等行为,法律上视为用户本人行为,相应法律后果由用户承担。
- 用户在激活 Agent 时应签署《Agent 操作授权协议》,明确 Agent 可代为操作的范围(如:Agent 可代用户接受 ¥X 以下的 brief / Agent 可代用户在 7 天内完成交付)。
- 超出授权范围的行为,Agent 应停下来等待用户确认;用户未及时确认的,平台不承担由此造成的损失。

**§10.x 平台仲裁 Agent**
- 平台提供"标准答案"判定器(平台仲裁 Agent),供争议双方或 admin 主动调用。
- 平台仲裁 Agent 的输出为"参考依据",不替代 admin 人工 review;争议双方对结论有异议的,可申请人工复核(15 个工作日)。
- 平台仲裁 Agent 因技术故障或 LLM 输出异常给出错误结论的,平台在用户协议 v2 §11.2 免责上限内承担相应责任。

### 5.3 Agent 责任协议(W5 阶段 2 上线)

> W2 阶段不落地,W5 卖家 Agent 上线时同步发布,模板存 `docs/legal/2026-agent-authorization-agreement-v1.md`。

---

## 6. W2 阶段 1 实际开发任务清单

| # | 任务 | 工时 | 依赖 |
|---|---|---|---|
| 1 | `CatalogSku` 表 + seed(挂 5 品类 × 3 档 × 3 加项规则 = 45 SKU) | 1d | W1 #23 ✅ |
| 2 | Brief schema 升级:`standardSkuId` / `acceptanceChecklist` / `addOns` / `originalBriefHash` | 0.5d | W1 #23 ✅ |
| 3 | `/studio/catalog` 公开页(SKU 菜单 + 加项) | 1d | #1 |
| 4 | `/studio/standards` 公开页(4 类标准文档化) | 1d | #1 #2 |
| 5 | `PlatformJudgeService`(LLM Judge 第一个平台 Agent) | 2d | W1 #26 ✅(复用 LlmConfigService) |
| 6 | `POST /api/v1/platform/judge/deliverable` API | 0.5d | #5 |
| 7 | `BriefNewPage` 顶部加"AI 拆解"按钮 + 自动生成 acceptanceChecklist | 1d | #2 #5(W1 #26 已有 decompose,可复用) |
| 8 | 用户协议 v2 加 §2.5 + §10.x Agent 条款(草拟) | 0.5d | W1 #17 ✅ |
| 9 | 本文档上线 + USER-ACTION-CHECKLIST 追加"标准 SKU 终审"(法务) | 0.5d | #1 |
| 10 | W2 Review 文档 | 0.5d | 全部 |

**合计**:9 个交付物 / 9.5d(2 周内可完成)

---

## 7. 公开文档(平台层标准)

W2 阶段同步输出 3 份公开文档,挂在 `/studio/standards`:

| 文档 | 路径 | 受众 |
|---|---|---|
| 平台任务包标准 v1 | `docs/standards/2026-brief-package-standard-v1.md` | 买家 + Seller Agent |
| 平台验收质量标准 v1 | `docs/standards/2026-acceptance-quality-standard-v1.md` | 创作者 + Seller Agent + 平台 Agent |
| 平台价格与清算标准 v1 | `docs/standards/2026-pricing-settlement-standard-v1.md` | 买家 + 创作者 + 财务 |

**这 3 份文档是"公信力底层"**,由 Claude 起草,你和法务复核。

---

## 8. 风险与边界(我看到的 3 个)

| # | 风险 | 缓解 |
|---|---|---|
| 1 | **标准定得太死,创作者/买家觉得"菜单限制创意"** | 加项规则足够灵活 + 允许"自定义 brief"(走 LLM 报价 + 人工审核) |
| 2 | **平台 Agent 出错率高,被吐槽"AI 不会看"** | 平台 Agent 留 `automated=false` 项必须人工;Agent 结论有"复审按钮";每周人工抽检 5% 结论质量 |
| 3 | **标准由平台单方制定,创作者觉得"霸王条款"** | 公开征求创作者反馈(每季度)+ 标准变更 30 天提前公告;L1 已有 IP 资产交易暂不强制挂 SKU(灵活度保留) |

---

## 9. 动态调价机制(2026-07-01 用户决策)

> **用户决策**:标准 SKU 价格是基础价,**无人接单时,买家可以主动加钱**,而不是死菜单。

### 9.1 触发条件

| 状态 | 条件 | 触发 |
|---|---|---|
| `bidding` | 上线 **24h** 0 个有效 bid | 通知买家"加价窗口" |
| `bidding` | 上线 **72h** 0-2 个有效 bid | 通知买家"加价窗口 + 推荐加价幅度" |
| `bidding` | 上线 **7d** 仍 < 3 个有效 bid | 建议买家 close 或主动加价 |
| `bidding` | 已有 3+ bid | 不触发加价机制 |

### 9.2 加价阶梯(由平台推荐,买家可自选)

| 等待时长 | 推荐加价 | 创作者匹配池重算 |
|---|---|---|
| 24h | +10%(standard ¥1700 → ¥1870) | 重推 + 拓宽到次级匹配创作者 |
| 72h | +20%(standard ¥1700 → ¥2040) | 重推 + 加急标签 + W2 #29 推送通知 |
| 7d | +30%(standard ¥1700 → ¥2210) | 重推 + 优先级提升 + 运营 BD 介入 |

### 9.3 上限保护

- 单次加价后总价 **不超过 `budgetMax × 1.5`**(防买家自残或脚本误调)
- 加价次数 **不超过 3 次 / brief**(防恶意抬价)
- 加价后**不退**(保护创作者已投入的注意力)

### 9.4 平台抽成

- 加价部分按**原始抽成比例**抽成(目前 5%)
- 例:standard ¥1700 + 加价 ¥340 = ¥2040,平台抽 ¥102,创作者收 ¥1938

### 9.5 状态机联动

```
brief.status 流转:
  draft → bidding
       ↓ (24h/72h/7d 触发,买家加价)
  bidding → bidding(加价, status 不变, price 更新)
       ↓ (买家选 close)
  bidding → closed(买家主动放弃)
       ↓ (3+ bid → 买家 accept 一个)
  bidding → in_progress
       ↓ (创作者交付 + 买家验收)
  in_progress → delivered → closed
```

### 9.6 实现位置

- `BriefService` 加 `bumpPrice(briefId, percent)` 方法(校验 + 更新 `estimatedPrice` + 通知推送 + 重推匹配池)
- `notifications` 队列 24h/72h/7d 三个延迟任务(Brief 发布时入队,上线后由 W2 #29 推送通道消费)
- 前端 `/buyer/briefs/:id` 加"加价"按钮 + 加价确认弹窗

---

## 10. W2 阶段 1 实际开发任务清单(2026-07-01 更新)

| # | 任务 | 工时 | 依赖 |
|---|---|---|---|
| 1 | `CatalogSku` 表 + seed(5 品类 × 3 档 = 15 SKU + 加项规则) | 1d | W1 #23 ✅ |
| 2 | Brief schema 升级 4 字段 + migration | 0.5d | W1 #23 ✅ |
| 3 | `/studio/catalog` + `/studio/standards` 公开页 | 1.5d | #1 |
| 4 | `PlatformJudgeService` + `POST /api/v1/platform/judge/deliverable` | 2d | W1 #26 ✅ |
| 5 | `BriefNewPage` 顶部"AI 拆解"显式按钮 + 生成 acceptanceChecklist | 1d | #2 #4 |
| 6 | **动态调价机制** — `BriefService.bumpPrice()` + 24h/72h/7d cron + 前端加价弹窗 | 1d | #2 #3 |
| 7 | 用户协议 v2 §2.5 + §10.x Agent 条款(草拟) | 0.5d | W1 #17 ✅ |
| 8 | 3 份公开标准文档(brief-package / acceptance / pricing-settlement) | 1d | #1 |
| 9 | W2 Review 文档 + 平台层标准终审请法务 | 0.5d | 全部 |

**合计 9d**(1.5-2 周内可完成)。

---

> **下一步**:用户已确认 3 个决策(免责上限 12 个月 / 动态调价 / 显式 AI 拆解按钮),**W2 #28 的 9 个交付物按 10.节任务清单执行**。开干信号等你下。