# 平台标准 LineItem 颗粒度 (LineItem Catalog) v1.0

> 标准代号:STANDARD-LINEITEM-CATALOG-V1
> 生效日期:待评审
> 维护:ibi.ren 平台运营 / 法务 / 产品
> 适用:所有 AIGC 众包发包单 (Brief) + 投标 (Bid) 的价格拆解
> 一句话:**Agent 拆解 + Agent 自动成交需要零件级标准,套餐菜单 (15 SKU) 不够。**

> **修订记录**:
> - v0.9 (2026-07-01): 初稿,76 行 line item 清单
> - v1.0 (2026-07-01): 加入 4 层评审架构 + 3 档质量档具化 + TierPolicy 表

---

## 1. 制定背景

### 1.1 当前痛点

W2 #28 落地的 `CatalogSku`(15 个 = 5 品类 × 3 档)是**套餐菜单**:

```
CatalogSku (15 个)
├─ category: 5  (ad / shortvideo / livestream_clip / poster / 3d)
├─ tier: 3      (essential / standard / premium)
├─ basePrice: 固定
├─ quantity: 固定 (例 shortvideo=5 条)
├─ ipsIncluded: 固定 1
├─ platformsIncluded: 固定 1
└─ addOnRules: JSON 加项 (无单价 / 无结构化)
```

**Agent 拆解失败场景**:
| 买家 brief 描述 | 当前 Agent 输出 | 缺什么 |
|---|---|---|
| "做 8 条 30s 短视频" | 只输出 tier=standard,加价拍脑袋 | 加 3 条 ¥X × 3 |
| "3 个 IP 出镜" | 只输出 ipsIncluded=1 | 加 2 IP ¥Y × 2 |
| "抖音 + 小红书 + 视频号" | 只输出 1 平台 | 加 2 平台 ¥Z × 2 |
| "30s 版 + 60s 版都要" | 无字段 | 加 1 个版本 ¥W |
| "英文配音 + 中英字幕" | 无字段 | 多语种 + 双语字幕单价 |

本质问题:**菜单是"产品",Agent 自动成交要的是"零件清单"**。

### 1.2 设计目标

- ✅ **买家 Agent**:brief → 自动拆 line items → 精确总价
- ✅ **创作者 Agent**:收到 brief → 看 line items → 报"能做哪些 / 哪些要加价 / 哪些做不了"
- ✅ **平台 Agent(仲裁)**:验收时按 line item 一一勾,哪条没交付一目了然
- ✅ **W3 Workspace**:milestone = 完成 N 个 line items,自动算交付节点
- ✅ **Admin**:平台运营维护零件库 + 单价,代码不改也能调整

### 1.3 不在 v1 范围

- ❌ 不做"自由议价" — 仍是平台统一定价,加项也走平台菜单
- ❌ 不做"创作者自定义 line item" — 创作者只能在平台菜单里选 + 报"无法完成"
- ❌ 不做"实时竞价" — 创作者不能压价,只能按菜单接
- ❌ 不做"按效果分成" — 仍是按交付物一次性结
- 上述约束后续 v2+ 视情况开放

---

## 2. 两层结构

### 第 1 层: BASE_* 基础套餐(锚点,不变)

保留现有 15 个 SKU 作"快速路径" + 锚点(总价下限)。买家选 tier 后,1 条 `BASE_<CATEGORY>_<TIER>` line item 自动入 brief。

### 第 2 层: ADD_* 加项零件(本次新增)

平台维护一份 **60~80 个零件清单**,Agent 根据 brief 描述自动挑 + 算数量。

### 快速路径 vs 详细路径

| 路径 | 触发 | 适用场景 |
|---|---|---|
| **快速路径**(1 条 line item) | 买家手动选 tier,description 留空或简单 | 老买家 / 标准化需求 |
| **详细路径**(N 条 line items) | 买家点"AI 拆解"或手填,description 详细 | 新买家 / 复杂需求 / 跨平台 / 加急 |

两条路径最终都落到 `BriefLineItem` 表,UI 一致展示。

---

## 3. 编码规则

### 3.1 Code 前缀分类法

| 前缀 | 含义 | 数量 |
|---|---|---|
| `BASE_*` | 基础套餐(锚点,15 个不变) | 15 |
| `ADD_QTY_*` | 数量加项 | 5 |
| `ADD_IP_*` | IP / 形象加项 | 4 |
| `ADD_PLT_*` | 投放平台加项 | 1 |
| `ADD_DUR_*` | 时长 / 版本加项 | 6 |
| `ADD_LANG_*` | 语言 / 字幕加项 | 7 |
| `ADD_VOICE_*` | 配音 / 声音 | 4 |
| `ADD_VIS_*` | 视觉 / 调色 / 动效 | 5 |
| `ADD_AUD_*` | 音乐 / 音效 | 3 |
| `ADD_VFX_*` | 特效 / 3D / Live2D | 6 |
| `ADD_SRC_*` | 源文件 / 过程文件 | 4 |
| `ADD_FMT_*` | 交付格式 / 画质 | 4 |
| `ADD_RUSH_*` | 加急 / 缩短交付 | 3 |
| `ADD_REV_*` | 修订轮次 | 2 |
| `ADD_LEGAL_*` | 法律 / 合规 / 著作权 | 4 |
| `ADD_OPS_*` | 运营 / 售后 | 3 |
| **合计** | | **76** |

### 3.2 命名规范

```
BASE_<CATEGORY>_<TIER>            # 基础套餐
ADD_<CATEGORY>_<NAME>             # 加项
```

示例:
- `BASE_SHORTVIDEO_STANDARD`
- `ADD_QTY_VIDEO`
- `ADD_LANG_EN_VOICE`
- `ADD_VFX_3D_MODEL`

### 3.3 计价模型(pricingModel)

| 模型 | 含义 | lineTotal 计算 |
|---|---|---|
| `PER_UNIT` | 按数量计 (¥X × 数量) | unitPrice × qty |
| `FLAT` | 一次性固定 (¥X 不论数量) | unitPrice(×1) |
| `PERCENT_OF_BASE` | 基础套餐价 × 百分比 | basePrice × percent × 0.01 |
| `PERCENT_OF_LINE` | 关联 line item 价 × 百分比 | linkedLineTotal × percent × 0.01 |

---

## 4. 数据结构(Schema 草图)

```prisma
// 平台维护的零件库
model LineItemCatalog {
  id                  String   @id @default(cuid())
  code                String   @unique           // ADD_QTY_VIDEO
  name                String                      // 多 1 条视频
  nameEn              String?                     // 1 extra video
  description         String?  @db.Text           // 适用条件 / 边界说明

  category            String                      // cross / ad / shortvideo / livestream_clip / poster / 3d
  applicableTiers     Json                        // [essential, standard, premium] — 哪些档位可选
  applicableOn        Json                        // ['video'] — 适用对象的 base 类别

  unit                String                      // 条 / 个 / 平台 / 版本 / 语种 / 轮 / 月 / 倍
  pricingModel        LineItemPricingModel         // PER_UNIT / FLAT / PERCENT_OF_BASE / PERCENT_OF_LINE
  defaultUnitPrice    Decimal  @db.Decimal(10, 2) // PER_UNIT / FLAT 时的默认单价
  defaultPercent      Decimal? @db.Decimal(5, 2)  // PERCENT_* 时的百分比(0~100)

  minQty              Int      @default(1)
  maxQty              Int?                       // null = 不限
  defaultQty          Int      @default(1)        // Agent 拆解时的默认数量

  // 互斥 / 必选 / 联动约束(JSON),由 Agent 拆解 prompt + 后端校验共同消费
  constraints         Json?

  enabled             Boolean  @default(true)
  sortOrder           Int      @default(0)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

// 同一 line item 在不同档位的实际价格(避免在 LineItemCatalog 上做 3 套价格)
model LineItemTierPrice {
  id                  String   @id @default(cuid())
  lineItemId          String
  lineItem            LineItemCatalog @relation(fields: [lineItemId], references: [id])
  tier                String                      // essential / standard / premium
  unitPrice           Decimal? @db.Decimal(10, 2) // 覆盖 defaultUnitPrice
  percent             Decimal? @db.Decimal(5, 2)

  @@unique([lineItemId, tier])
}

// 买家 brief 关联的具体行项
model BriefLineItem {
  id                  String   @id @default(cuid())
  briefId             String
  brief               Brief    @relation(fields: [briefId], references: [id], onDelete: Cascade)

  lineItemCode        String                      // 冗余存 code,避免 catalog 改了 brief 历史变
  lineItemNameSnapshot String                     // 当时的名字(防 audit 不一致)
  unit                String
  qty                 Int
  unitPriceSnapshot   Decimal  @db.Decimal(10, 2) // 当时单价
  lineTotal           Decimal  @db.Decimal(10, 2) // unitPrice × qty(或 percent 计算结果)
  notes               String?                     // "5 条 - 套餐内 1 条" 这种解释

  // 验收映射:这条完成后,验收清单里哪几项算交付?
  // 由 lineItem 决定,挂到 AcceptanceTemplate.items 引用
  mappedAcceptanceItems Json?

  createdAt           DateTime @default(now())

  @@index([briefId])
}

// 创作者投标时也报 line items(可与 brief 不完全一致,做"我能做 / 要调整 / 做不了"标记)
model BidLineItem {
  id                  String   @id @default(cuid())
  bidId               String
  bid                 Bid      @relation(fields: [bidId], references: [id], onDelete: Cascade)

  lineItemCode        String
  lineItemNameSnapshot String
  unit                String
  qty                 Int
  unitPriceSnapshot   Decimal  @db.Decimal(10, 2)
  lineTotal           Decimal  @db.Decimal(10, 2)
  // 创作者态度:accept / adjust_qty / adjust_price / decline
  creatorDisposition  String   @default('accept')
  notes               String?

  @@index([bidId])
}

// Brief.totalPrice 改为 view (在 service 层算 SUM(BriefLineItem.lineTotal))
// Bid.totalPrice 改为 view (SUM(BidLineItem.lineTotal))
```

---

## 5. LineItem 清单(v1 总数 76)

### 5.1 BASE 基础套餐(15,沿用现有 CatalogSku 作锚点)

| Code | 档位 | 基础价(¥) | 含 | deliveryDays | 适用 |
|---|---|---|---|---|---|
| `BASE_AD_ESSENTIAL` | Essential | 800 | 1 条 30s 广告片 / 1 IP / 1 平台 | 7 | ad |
| `BASE_AD_STANDARD` | Standard | 1,500 | 1 条 30s 广告片 / 1 IP / 2 平台 | 5 | ad |
| `BASE_AD_PREMIUM` | Premium | 3,000 | 2 条 30s 广告片 / 2 IP / 3 平台 | 5 | ad |
| `BASE_SHORTVIDEO_ESSENTIAL` | Essential | 700 | 1 条 30s 短视频 / 1 IP / 1 平台 | 7 | shortvideo |
| `BASE_SHORTVIDEO_STANDARD` | Standard | 1,400 | 1 条 30s 短视频 / 1 IP / 1 平台 | 5 | shortvideo |
| `BASE_SHORTVIDEO_PREMIUM` | Premium | 2,500 | 3 条 30s 短视频 / 2 IP / 2 平台 | 5 | shortvideo |
| `BASE_LIVESTREAM_CLIP_ESSENTIAL` | Essential | 900 | 1 条 ≤60s 切片 / 1 平台 | 5 | livestream_clip |
| `BASE_LIVESTREAM_CLIP_STANDARD` | Standard | 1,600 | 3 条 ≤60s 切片 / 1 平台 | 5 | livestream_clip |
| `BASE_LIVESTREAM_CLIP_PREMIUM` | Premium | 2,800 | 5 条 ≤60s 切片 / 2 平台 | 5 | livestream_clip |
| `BASE_POSTER_ESSENTIAL` | Essential | 700 | 1 张主视觉 / 1 IP | 5 | poster |
| `BASE_POSTER_STANDARD` | Standard | 1,500 | 3 张主视觉(3 尺寸) / 1 IP / 1 平台 | 5 | poster |
| `BASE_POSTER_PREMIUM` | Premium | 3,000 | 5 张主视觉 / 2 IP / 多尺寸 | 7 | poster |
| `BASE_3D_ESSENTIAL` | Essential | 1,000 | 1 个 3D 模型(基础绑定) | 10 | 3d |
| `BASE_3D_STANDARD` | Standard | 2,000 | 1 个 3D 模型 + Live2D 绑定 / 1 套动作 | 10 | 3d |
| `BASE_3D_PREMIUM` | Premium | 3,500 | 1 个 3D 模型 + 完整骨骼 / 5 套动作 | 14 | 3d |

> **注**:基础套餐的"包含量"现在写死,后续可优化为"快速路径默认 1"+"ADD_QTY_* 累加"。但 v1 先这样,避免再改 SKU 表。

---

### 5.2 ADD_QTY 数量加项(5)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_QTY_VIDEO` | 多 1 条视频 | PER_UNIT | 350 | 600 | 1-50 | 仅 shortvideo / ad / livestream_clip |
| `ADD_QTY_POSTER` | 多 1 张海报 | PER_UNIT | 400 | 700 | 1-30 | 仅 poster |
| `ADD_QTY_LIVE_CLIP` | 多 1 条直播切片 | PER_UNIT | 350 | 500 | 1-100 | 仅 livestream_clip |
| `ADD_QTY_3D_POSE` | 多 1 套 3D 动作 | PER_UNIT | 600 | 900 | 1-20 | 仅 3d,需 BASE_3D_* |
| `ADD_QTY_SIZE_VARIANT` | 多 1 个尺寸变体(海报) | PER_UNIT | 250 | 400 | 1-10 | 仅 poster |

---

### 5.3 ADD_IP IP / 形象加项(4)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_IP_EXTRA` | 多 1 个 IP 出镜 | PER_UNIT | 300 | 500 | 1-5 | 跨品类 |
| `ADD_IP_VOICE_CLONE` | 1 个 IP 声音克隆(永久授权) | FLAT | 800 | 800 | 1-3 | 跨品类,法务审核 |
| `ADD_IP_LICENSE_COMMERCIAL` | IP 商用授权扩列(1 IP) | FLAT | 500 | 500 | 1-5 | 跨品类 |
| `ADD_IP_FACE_BLEND` | 2 个 IP 形象融合 / 捏脸定制 | FLAT | 1,200 | 1,800 | 1 | 仅 3d,法务审核 |

---

### 5.4 ADD_PLT 投放平台加项(1)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_PLT_EXTRA` | 多投 1 个平台 | PER_UNIT | 200 | 350 | 1-9 | 跨品类;同一内容多平台 = 1 个加项 |

---

### 5.5 ADD_DUR 时长 / 版本加项(6)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_DUR_60S` | 多 1 个 60s 长版(原 30s) | PER_UNIT | 400 | 700 | 1-10 | shortvideo / ad |
| `ADD_DUR_15S` | 多 1 个 15s 切条 | PER_UNIT | 200 | 350 | 1-20 | shortvideo / ad |
| `ADD_DUR_HORIZONTAL` | 多 1 个横屏版(16:9) | PER_UNIT | 250 | 400 | 1-5 | shortvideo / ad / 3d |
| `ADD_DUR_VERTICAL` | 多 1 个竖屏版(9:16) | PER_UNIT | 200 | 350 | 1-5 | shortvideo / ad / 3d |
| `ADD_DUR_BUMPER` | 多 1 个 5s 品牌前奏 | FLAT | 300 | 500 | 1-3 | ad |
| `ADD_DUR_ENDCARD` | 多 1 个 5s 结束画面 | FLAT | 300 | 500 | 1-3 | ad |

---

### 5.6 ADD_LANG 语言 / 字幕加项(7)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_LANG_EN_VOICE` | 英文 AI 配音 | PER_UNIT | 250 | 400 | 1-5 | 跨品类 |
| `ADD_LANG_JA_VOICE` | 日文 AI 配音 | PER_UNIT | 300 | 500 | 1-5 | 跨品类 |
| `ADD_LANG_KO_VOICE` | 韩文 AI 配音 | PER_UNIT | 300 | 500 | 1-5 | 跨品类 |
| `ADD_LANG_MULTI_BUNDLE` | 多语种打包(任选 3 语种,5 条起) | FLAT | 2,500 | 4,000 | 1 | 跨品类,互斥于单语种 3 个 |
| `ADD_LANG_SUBTITLE` | 多 1 条字幕(单语) | PER_UNIT | 80 | 120 | 1-30 | 跨品类 |
| `ADD_LANG_BILINGUAL_SUB` | 多 1 条中英双语字幕 | PER_UNIT | 150 | 250 | 1-30 | 跨品类 |
| `ADD_LANG_SUBTITLE_BURN` | 多 1 个烧字幕版本 | PER_UNIT | 200 | 350 | 1-10 | 跨品类 |

---

### 5.7 ADD_VOICE 配音 / 声音加项(4)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_VOICE_TONE_CHANGE` | 换 1 次 AI 音色(同语种) | FLAT | 150 | 250 | 1-5 | 互斥于 ADD_VOICE_HUMAN |
| `ADD_VOICE_HUMAN` | 1 条真人配音(不用 AI) | PER_UNIT | 800 | 1,200 | 1-20 | 跨品类 |
| `ADD_VOICE_TWEAK` | 1 条配音微调(语速 / 停顿) | FLAT | 100 | 200 | 1-10 | 跨品类 |
| `ADD_VOICE_ASMR` | ASMR / 耳语风格调音 | FLAT | 300 | 500 | 1-5 | 仅 shortvideo / ad |

---

### 5.8 ADD_VIS 视觉 / 调色 / 动效加项(5)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_VIS_COLOR_GRADE` | 专业调色(达芬奇级) | FLAT | 600 | 1,000 | 1-5 | shortvideo / ad / livestream_clip |
| `ADD_VIS_MOTION_GFX` | 加 1 套动态图形 / 转场 | FLAT | 500 | 800 | 1-10 | shortvideo / ad |
| `ADD_VIS_AI_FACE_SWAP` | AI 换脸(限自有素材) | FLAT | 800 | 1,200 | 1-3 | shortvideo / ad,法务审核 |
| `ADD_VIS_BRAND_KIT` | 品牌 VI 适配(字体 / Logo / 配色) | FLAT | 400 | 700 | 1-3 | 跨品类 |
| `ADD_VIS_TEMPLATE_TWEAK` | 基于模板微调视觉风格 | FLAT | 300 | 500 | 1-5 | 跨品类 |

---

### 5.9 ADD_AUD 音乐 / 音效加项(3)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_AUD_BGM_LICENSED` | 商用授权音乐(1 首,平台已签) | FLAT | 200 | 400 | 1-5 | 跨品类 |
| `ADD_AUD_BGM_CUSTOM` | 定制 BGM(1 首,原创) | FLAT | 1,500 | 2,500 | 1-3 | 跨品类 |
| `ADD_AUD_SFX_PACK` | 音效包(≤10 个,授权) | FLAT | 300 | 600 | 1-5 | 跨品类 |

---

### 5.10 ADD_VFX 特效 / 3D / Live2D 加项(6)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_VFX_3D_MODEL` | 额外 1 个 3D 模型(角色/道具) | FLAT | 1,500 | 2,500 | 1-5 | 仅 3d,需 BASE_3D_* |
| `ADD_VFX_LIVE2D_RIG` | Live2D 骨骼绑定(1 个模型) | FLAT | 2,000 | 3,000 | 1-3 | 仅 3d |
| `ADD_VFX_LOOP_ANIM` | 1 套循环动画(≤10s) | FLAT | 1,000 | 1,500 | 1-10 | 仅 3d |
| `ADD_VFX_PHYSICS_SIM` | 物理模拟(布料 / 流体) | FLAT | 1,200 | 2,000 | 1-3 | 仅 3d |
| `ADD_VFX_PARTICLE` | 粒子特效(烟 / 火 / 魔法) | FLAT | 800 | 1,200 | 1-5 | 3d / ad |
| `ADD_VFX_AR_FILTER` | AR 滤镜(1 套) | FLAT | 2,500 | 4,000 | 1-3 | 3d / ad,法务审核 |

---

### 5.11 ADD_SRC 源文件 / 过程文件(4)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_SRC_RAW_FOOTAGE` | 原始素材(过程视频) | FLAT | 500 | 800 | 1 | shortvideo / livestream_clip / ad |
| `ADD_SRC_PSD` | PSD 源文件(海报) | FLAT | 300 | 500 | 1 | poster |
| `ADD_SRC_PROJECT_FILE` | 工程文件(Pr/AE/C4D) | FLAT | 800 | 1,500 | 1 | 跨品类 |
| `ADD_SRC_INTERMEDIATE` | 中间稿(打回修订时用) | FLAT | 200 | 400 | 1-10 | 跨品类 |

---

### 5.12 ADD_FMT 交付格式 / 画质(4)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_FMT_4K` | 4K 渲染输出 | FLAT | 400 | 700 | 1-5 | shortvideo / ad / livestream_clip |
| `ADD_FMT_PRORES` | ProRes 母版(无损) | FLAT | 600 | 1,000 | 1-3 | shortvideo / ad |
| `ADD_FMT_PRINT_300DPI` | 印刷级 300dpi CMYK | FLAT | 500 | 800 | 1-3 | poster |
| `ADD_FMT_H265_HIGH_BITRATE` | 高码率 H.265(≥20Mbps) | FLAT | 300 | 500 | 1-3 | shortvideo / ad |

---

### 5.13 ADD_RUSH 加急 / 缩短交付(3)

| Code | 名称 | 计价模型 | 适用 | 备注 |
|---|---|---|---|---|
| `ADD_RUSH_24H` | 24h 交付 | PERCENT_OF_BASE | basePrice × 50% | 跨品类 |
| `ADD_RUSH_48H` | 48h 交付 | PERCENT_OF_BASE | basePrice × 30% | 跨品类 |
| `ADD_RUSH_72H` | 72h 交付 | PERCENT_OF_BASE | basePrice × 15% | 跨品类 |

约束:互斥,选 1 个;essential 档 24h 不可用(原本就 7 天)。

---

### 5.14 ADD_REV 修订轮次(2)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_REV_ROUND` | 多 1 轮修订 | FLAT | 200 | 350 | 1-10 | 默认含 2 轮 |
| `ADD_REV_DETAIL_TWEAK` | 微调 1 处细节(不影响整体) | FLAT | 80 | 150 | 1-20 | 不计入修订轮 |

---

### 5.15 ADD_LEGAL 法律 / 合规 / 著作权(4)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_LEGAL_COPYRIGHT_REG` | 著作权代申请(代办费,1 件) | FLAT | 500 | 500 | 1-10 | 跨品类,需另走代办流程 |
| `ADD_LEGAL_AD_COMPLIANCE` | 广告法 / 平台规则审核(1 条) | FLAT | 300 | 500 | 1-10 | 仅 ad |
| `ADD_LEGAL_TALENT_RELEASE` | 形象授权文件(1 个 IP) | FLAT | 200 | 300 | 1-5 | 跨品类 |
| `ADD_LEGAL_WATERMARK_REMOVAL` | 去水印(限自有素材) | FLAT | 200 | 400 | 1-5 | 短 / 长视频,法务审核 |

---

### 5.16 ADD_OPS 运营 / 售后(3)

| Code | 名称 | 计价模型 | 标准档单价(¥) | 旗舰档单价(¥) | min/max | 约束 |
|---|---|---|---|---|---|---|
| `ADD_OPS_STORAGE_3M` | 延长存储 3 个月 | FLAT | 100 | 200 | 1-4 | 默认存 1 年 |
| `ADD_OPS_REHOST` | 重新托管 1 次(链接过期) | FLAT | 50 | 80 | 1-10 | 限 1 年内 |
| `ADD_OPS_PLATFORM_ADAPT` | 平台规格适配(1 平台,如改分辨率+加字幕位) | PER_UNIT | 250 | 400 | 1-9 | 跨品类 |

---

## 6. 通用约束(跨 line item)

### 6.1 必选 + 互斥 + 联动

| 约束类型 | 示例 | 由谁执行 |
|---|---|---|
| **必选** | brief 至少 1 条 `BASE_*` | 后端 (POST /briefs 校验) |
| **互斥** | `ADD_RUSH_*` 3 选 1 | 后端 + Agent prompt |
| **联动** | 选了 `ADD_VFX_3D_MODEL` 必须有 `BASE_3D_*` | 后端 (constraints JSON 校验) |
| **数量上限** | `ADD_QTY_VIDEO` qty ≤ 50 | 后端 (maxQty 字段) |
| **重复检查** | 同一 `ADD_LANG_*` 不能加 2 次(应改 qty) | 后端 + Agent prompt |

### 6.2 计算公式

```
briefTotal = Σ BriefLineItem.lineTotal
            = Σ (BriefLineItem.unitPriceSnapshot × BriefLineItem.qty)
              + Σ (PERCENT_OF_BASE 行项: basePrice × percent × 0.01)

bidTotal   = Σ BidLineItem.lineTotal
              (创作者可调整 qty / unitPriceSnapshot,需在 notes 说明)
```

### 6.3 总价守恒

- `Brief.currentPrice` = briefTotal(不再单独存)
- `Brief.packageTier` 保留,作"快速路径"标记 + 加项触发器
- 加价(bumpPrice)继续走原"动态调价"机制,**只对 BASE_* 行项生效**,不重复加 ADD_*

---

## 7. Agent 拆解 Prompt 升级(v1 拆解规则)

### 7.1 系统 prompt 增量(加入现有 CREATOR_SYSTEM_PROMPT / BUYER_SYSTEM_PROMPT 的 system prompt 工具调用)

```
你是 ibi.ren 平台的 brief 拆解 Agent。

输入:买家填的 brief(标题 + 描述 + 投放平台 + IP 选择 + 截止时间)

任务:把需求拆成 LineItem 清单(零件级)。

约束:
1. 必须 1 条 BASE_*(按 category + tier 选)
2. 套餐内已含的不要拆:
   - BASE_SHORTVIDEO_STANDARD 已含 1 条视频,描述里写"做 1 条"就不拆 ADD_QTY_VIDEO
   - 描述里"5 条" = 拆 4 条 ADD_QTY_VIDEO
3. 跨平台加项:1 条 BASE_* 默认含 1 平台,多出来的平台拆 ADD_PLT_EXTRA
4. 多 IP 出镜:套餐内 1 个,多出来的拆 ADD_IP_EXTRA
5. 时长:30s 套餐内;多版本拆 ADD_DUR_*
6. 语言 / 字幕 / 配音 / 调色 / 音乐 / 特效:看描述里有没有提
7. 加急:截止时间 - 当前 < N 天 → 拆对应 ADD_RUSH_*
8. 法务相关:涉品牌 / 涉形象 / 涉合规 → 拆 ADD_LEGAL_*
9. 输出格式:严格 JSON,见下

输出 schema:
{
  "lineItems": [
    {
      "code": "BASE_SHORTVIDEO_STANDARD",
      "qty": 1,
      "unit": "套",
      "notes": "基础套餐(标准版)"
    },
    {
      "code": "ADD_QTY_VIDEO",
      "qty": 4,
      "unit": "条",
      "notes": "5 条 - 套餐内 1 条"
    },
    {
      "code": "ADD_PLT_EXTRA",
      "qty": 1,
      "unit": "平台",
      "notes": "抖音 + 小红书 - 套餐内 1 平台"
    }
  ],
  "explanation": "一句话说明拆解思路,买家可读"
}

不允许返回未在 LineItemCatalog 里的 code。
不确定的项,放 qty=1 + notes="待买家确认"。
```

### 7.2 输入 → 输出示例

**输入 brief**:
```
标题:晶新 AI 7 月新品发布短视频 × 5 条
描述:30s 短视频,抖音 + 小红书 + 视频号投放,英文配音,带中英字幕,3 个 IP 出镜,7/25 上线
截止:2026-07-25 (距今 12 天)
```

**Agent 输出**:
```json
{
  "lineItems": [
    { "code": "BASE_SHORTVIDEO_STANDARD", "qty": 1, "unit": "套", "notes": "基础套餐(标准版)" },
    { "code": "ADD_QTY_VIDEO",            "qty": 4, "unit": "条", "notes": "5 条 - 套餐内 1 条" },
    { "code": "ADD_IP_EXTRA",             "qty": 2, "unit": "个", "notes": "3 IP - 套餐内 1 个" },
    { "code": "ADD_PLT_EXTRA",            "qty": 2, "unit": "平台","notes": "3 平台 - 套餐内 1 平台" },
    { "code": "ADD_LANG_EN_VOICE",        "qty": 1, "unit": "语种","notes": "英文配音" },
    { "code": "ADD_LANG_SUBTITLE",        "qty": 5, "unit": "条",  "notes": "5 条全字幕(单语中文)" },
    { "code": "ADD_LANG_BILINGUAL_SUB",   "qty": 5, "unit": "条",  "notes": "5 条双语字幕(中英)" }
  ],
  "explanation": "Standard 标准版基础 + 4 条视频加量 + 2 个 IP 加项 + 2 个平台 + 英文配音 + 双语字幕。"
}
```

**总价计算**(标准档):
- BASE: 1,400
- ADD_QTY_VIDEO: 350 × 4 = 1,400
- ADD_IP_EXTRA: 300 × 2 = 600
- ADD_PLT_EXTRA: 200 × 2 = 400
- ADD_LANG_EN_VOICE: 250 × 1 = 250
- ADD_LANG_SUBTITLE: 80 × 5 = 400
- ADD_LANG_BILINGUAL_SUB: 150 × 5 = 750
- **总计: ¥5,200**

vs 当前菜单级粗算:**¥1,400(标准版)× 5 条 = ¥7,000**(糊里糊涂,看不出 IP / 平台 / 字幕成本)。

---

## 8. 验收映射(line item → checklist)

每条 line item 在交付时映射到 `AcceptanceTemplate.items` 的 1~N 项:

| LineItem 类别 | 验收映射 |
|---|---|
| `BASE_*` | items[0]内容完整性(items[1]时长(items[2]比例 |
| `ADD_QTY_*` | items[0]内容完整性(增量部分) |
| `ADD_IP_*` | items[3]IP 出镜合规 |
| `ADD_PLT_*` | items[2]比例(各平台(items[4]平台规则适配 |
| `ADD_LANG_*` | items[5]语言 / 字幕准确性 |
| `ADD_RUSH_*` | items[6]交付时效 |
| `ADD_LEGAL_*` | items[7]法务合规 |

W3 #33 Workspace 落地时,把 `BriefLineItem.mappedAcceptanceItems` 字段填上。

---

## 9. 工作量 + 接入计划

### 9.1 W2.5 工时估算

| 阶段 | 内容 | 工时 |
|---|---|---|
| 1. Schema | LineItemCatalog + LineItemTierPrice + BriefLineItem + BidLineItem | 1 天 |
| 2. Seed | 76 行 LineItemCatalog(本文档已列全)+ LineItemTierPrice(3 档) | 0.5 天 |
| 3. Service | BriefService 接受 lineItems[]、自动算总价、约束校验 | 1 天 |
| 4. Bid 端 | BidService 接受 lineItems[] + 创作者 disposition | 0.5 天 |
| 5. Agent | BriefNewPage "AI 拆解" prompt 升级 + LLM 调用 + 解析 | 1 天 |
| 6. 前端 | BriefNewPage 加 line items 编辑器(展示 + 数量加减 + 删除) | 1.5 天 |
| 7. 前端 | **买家 BriefDetailPage 加 bid 列表 + 接受按钮**(原 W2 漏的) | 1 天 |
| 8. 烟测 | 详细路径 E2E + 快速路径回归 + 互斥约束烟测 | 1 天 |
| 9. 文档 | W2.5 Review + 验收映射表 + 迁移指南 | 0.5 天 |
| **合计** | | **~9 天**(2 周) |

### 9.2 接入时点

W3 起步前做掉。原因:
- W3 #33 Workspace 要按 line items 算 milestone 价
- W3 #36 中间稿上传后,买家/创作者要按 line item 标完成度
- 拖到 W3 中期改造,数据迁移 + UI 改造翻倍

### 9.3 数据迁移

- W2 已有的 brief / bid 不动(数量少,审计需要原始数据)
- 新 brief 强制走 line items
- 旧 brief 加价 / bumpPrice 仍可用(只对 BASE_* 行项生效)

---

## 10. v2+ 路线(本期不做)

- ❌ 创作者自定义 line item(开放加项市场)
- ❌ 按效果分成(CPM / CPA)
- ❌ 创作者议价(可在 ±10% 内调整 unitPrice)
- ❌ 平台 Agent 自动验收(目前平台 Agent 仅仲裁)
- ❌ 跨 brief 复用 line items(模板化)
- ❌ 多币种 + 跨境结算

---

## 11. 关联文档

- [CatalogSku (W2 #28)](../../apps/api/prisma/schema.prisma) — 第 1 层锚点
- [Brief Package Standard v1.0](2026-brief-package-v1.md) — 7 项必填字段
- [Pricing & Settlement Standard v1.0](2026-pricing-settlement-v1.md) — 动态调价机制
- [Acceptance Standard v1.0](2026-acceptance-v1.md) — 7 项验收清单
- [Platform Standards Overview v1.0](2026-platform-standards-v1.md) — 整体索引

---

## 12. 4 层评审架构(Platform Judge Architecture)

> **⚠ 易混淆声明**:本章的"L1 RULE / L2 LLM / L3 OPERATOR / L4 EXPERT"是**人机协作的流程层级**(从规则→AI→人工→专家,逐层兜底)。
> 用户讨论的"4 层评审架构"另有所指——是 **AI 自动评分的 4 个维度**(技术 / 美学 / 合规 / 商业价值,见 [docs/research/quality-eval-benchmark-2026.md](../../research/quality-eval-benchmark-2026.md) 调研)。**两件事完全不同,不要混淆**。
> 本章定义的是流程层级,与 [[../../research/quality-eval-benchmark-2026.md|quality-eval-benchmark-2026]] 的 AI 评分 4 个维度是**正交关系**:AI 评分 4 维度是"L2 LLM"环节里要跑的内容,人机协作 4 层是 L2 跑完后怎么分流到 L3/L4。

### 12.1 背景

W2 #28 已落地单一 `PlatformJudgeService`(LLM 单次打分),但实际生产面临两个问题:

1. **边界判定不可靠**:LLM 对"差 1 分就过 / 差 1 分就不过"经常给出"两端都给 0.79"的尴尬分,需要人工兜底
2. **3 档质量档不分**:essential / standard / premium 走完全一样的评审,平台背书责任和单价不匹配

本节定义 4 层人机协作评审架构,**3 档质量档走不同路径**。

### 12.2 4 层定义(从上往下,任一层不过则进下一层)

| 层 | 代号 | 名称 | 执行者 | 输入 | 输出 | 性质 | 必走 |
|---|---|---|---|---|---|---|---|
| **L1** | `RULE` | 规则校验 | **代码**(确定性) | 文件元数据 / 规格 / manifest | pass / fail + 错误码 | 同步 | ✅ |
| **L2** | `LLM` | AI 评审 | **claude-sonnet** | deliverable + checklist | items score + total + reason | 异步 ~3s | ✅ |
| **L3** | `OPERATOR` | 运营人工审 | **平台运营** | L2 不通过 / 抽中 / 边界 | pass / fail / escalate | 异步(小时级) | ⚠ 触发 |
| **L4** | `EXPERT` | 专家仲裁 | **3 人专家组** | 重大争议 / 客诉 / 双方申请 | 最终判定 | 异步(天级) | ⚠ 触发 |

#### L1 RULE 规则校验

```
校验项(代码写死,可配置):
- 文件格式     (mp4 / mov / png / jpg / pdf / glb)
- 分辨率下限   (≥ 720p / ≥ 1080p / ≥ 4K)
- 时长         (±10% brief 要求)
- 比例         (9:16 / 16:9 / 1:1 / 3:4 — 按平台)
- 文件大小     (≤ OSS 单文件上限)
- 字幕位       (存在 / 不存在,按 brief)
- 数量         (deliverable 数 == brief 要求数)
- 水印         (无 ibi.ren 平台水印)
```

失败即打回,**不进 L2**(避免烧 LLM token)。

#### L2 LLM 评审

现有 `PlatformJudgeService` 的能力,**升级 4 点**:

1. 输入 deliverable 详细 manifest(不只是 spec 摘要)
2. 输出除 items/total 外,加 **置信度 confidence** + **L1-L4 推荐路径**
3. 同一 deliverable 跑 2 次(取均值),降低单次随机性
4. 失败边界(0.70~0.85)打 `flag=boundary` 进 L3

#### L3 OPERATOR 运营人工审

```
触发条件(任一):
- L2 totalScore < autoPassThreshold(按档位,见 13 章)
- L2 标记 boundary
- deliverable 单价 × ratio(按档位) 抽中(essential 100% / standard 20% / premium 100%)
- 买家或创作者任一申请(加急处理)

工作流:
- admin /judge/queue 页面,展示待审 list
- 运营点击 → 看 deliverable + L2 详细评分 + line items 拆分
- 输出:pass / fail / escalate(L4)
- SLA:essential 24h / standard 12h / premium 4h
```

#### L4 EXPERT 专家仲裁

```
触发条件(任一):
- L3 escalate
- 客诉金额 > tierThreshold(essential ¥100 / standard ¥500 / premium ¥1500)
- 双方任一申请(都同意才进)

组成:3 人专家组
- 平台运营代表 1 票
- 行业 KOL 1 票(平台外聘,按单付费,¥500/案)
- 公证处代表 1 票(法律兜底)

输出:最终判定(终局,不可申诉)
SLA:7 天
```

### 12.3 评审链路流转

```
deliverable 提交
    │
    ▼
[L1 RULE]── fail ──> 打回创作者,记 audit
    │ pass
    ▼
[L2 LLM]── totalScore < autoPassThreshold ──> 进 L3
    │ totalScore ≥ autoPassThreshold
    ▼
   PASS (自动通过,记 audit)
    │
    ▼
[L3 OPERATOR] ── 抽检命中 OR 客诉触发 ──> 进 L3
    │                            │
    │ escalate                  │ pass
    ▼                            ▼
[L4 EXPERT]                  PASS
    │
    ▼
 终局判定
```

### 12.4 数据库增量

```prisma
// 评审层级的统一记录(替代/扩展现有 PlatformJudgment)
model PlatformJudgment {
  id              String   @id @default(cuid())
  briefId         String
  deliverableId   String?
  bidId           String?

  // L1 规则校验结果
  l1Pass          Boolean?
  l1Errors        Json?    // [{code, message}]
  l1At            DateTime?

  // L2 LLM 评审结果
  l2Score         Float?
  l2Pass          Boolean?
  l2Confidence    Float?
  l2Flag          String?  // boundary / high_conf / low_conf
  l2At            DateTime?
  l2Model         String?

  // L3 运营人工审结果
  l3Pass          Boolean?
  l3OperatorId    String?
  l3Notes         String?
  l3At            DateTime?

  // L4 专家仲裁结果
  l4Pass          Boolean?
  l4Decision      String?  // PASS / FAIL / SPLIT_REFUND
  l4PanelJson     Json?    // [{expertId, role, vote, notes}]
  l4At            DateTime?

  // 综合
  finalPass       Boolean?
  finalTier       Int      @default(2)  // 在哪一层最终通过(L2/L3/L4)
  passingScore    Float
  summary         String?
  promptVersion   String

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// 档位策略表(评审参数 + 定价参数的统一入口)
model TierPolicy {
  id                  String   @id @default(cuid())
  category            String   // ad / shortvideo / ...
  tier                String   // essential / standard / premium
  enabled             Boolean  @default(true)

  // === 价格参数 ===
  basePrice           Decimal  @db.Decimal(10, 2)
  deliveryDays        Int
  quantityIncluded    Int      // 套餐内包含数(视频/海报/切片)
  ipsIncluded         Int
  platformsIncluded   Int
  revisionRounds      Int      @default(2)

  // === L1 规则校验严格度 ===
  l1MinResolution     String   // 720p / 1080p / 4K
  l1MaxFileSizeMB     Int

  // === L2 LLM 自动通过阈值 ===
  l2AutoPassThreshold Float    @default(0.80)  // ≥ 此值自动通过
  l2BoundaryLow       Float    @default(0.70)  // < 此值必进 L3
  l2BoundaryHigh      Float    @default(0.85)  // ≥ 此值标记 high_conf

  // === L3 抽检率 ===
  l3SamplingRate      Float    @default(0.20)  // 0~1
  l3SlaHours          Int      @default(12)

  // === L4 触发阈值 ===
  l4AmountThreshold   Decimal  @db.Decimal(10, 2)  // 客诉金额 ≥ 此触发
  l4SlaDays           Int      @default(7)

  // === 加项默认开关 ===
  // essential: 不开放大部分加项 / standard: 全开 / premium: 全开 + 必带
  enabledAddOns       Json?    // ['ADD_QTY_VIDEO', 'ADD_LANG_EN_VOICE', ...]

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([category, tier])
}
```

---

## 13. 3 档质量档 × 4 层评审矩阵

### 13.1 核心思想

**essential / standard / premium 不是营销噱头,是责任分级**:

- **essential**(低单价 ¥700-1000):平台背书弱 → 高抽检 + 简易流程
- **standard**(中单价 ¥1400-2000):平台背书中 → AI 自动通过为主 + 抽检
- **premium**(高单价 ¥2500-3500):平台背书强 → 必审 + 全流程

### 13.2 评审参数矩阵

| 维度 | Essential | Standard | Premium |
|---|---|---|---|
| **基础价范围** | ¥700 - ¥1,000 | ¥1,400 - ¥2,000 | ¥2,500 - ¥3,500 |
| **deliveryDays** | 7 | 5 | 5(更快也可走加急) |
| **包含视频数** | 1 | 1 | 3 |
| **包含 IP 数** | 1 | 1 | 2 |
| **包含平台数** | 1 | 1 | 2 |
| **默认修订轮** | 1 | 2 | 3 |
| | | | |
| **L1 最低分辨率** | 720p | 1080p | 4K |
| **L1 最大文件** | 200 MB | 500 MB | 2 GB |
| | | | |
| **L2 autoPass 阈值** | **0.75**(严) | **0.80**(中) | **0.85**(宽) |
| **L2 boundary 区间** | 0.65 ~ 0.80 | 0.70 ~ 0.85 | 0.75 ~ 0.90 |
| **L2 跑几次** | 2 次取均值 | 2 次取均值 | 3 次取中位数(更稳) |
| | | | |
| **L3 抽检率** | **100%**(全审,防刷单) | **20%** | **100%**(平台背书) |
| **L3 SLA** | 24 h | 12 h | 4 h |
| | | | |
| **L4 客诉阈值** | ¥100 | ¥500 | ¥1,500 |
| **L4 SLA** | 7 天 | 7 天 | 5 天(高客单加速) |
| **L4 平台承担** | 不承担退款 | 部分承担(50%) | 全部承担 |

### 13.3 加项开放度矩阵

| 加项类别 | Essential | Standard | Premium |
|---|---|---|---|
| `ADD_QTY_*`(数量) | ❌(试水档) | ✅ | ✅ |
| `ADD_IP_*` | ❌ | ✅ | ✅ |
| `ADD_PLT_*`(平台) | ❌ | ✅ | ✅ |
| `ADD_DUR_*` | ❌ | ✅ | ✅ |
| `ADD_LANG_*` | ❌ | ✅ | ✅ |
| `ADD_VOICE_*` | ❌ | ✅ | ✅ |
| `ADD_VIS_*` | ❌ | ✅ | ✅ |
| `ADD_AUD_*` | ❌ | ✅ | ✅ |
| `ADD_VFX_*` | ❌ | ✅ | ✅ |
| `ADD_SRC_*`(源文件) | ✅(默认给) | ✅(加项要) | ✅(加项要) |
| `ADD_FMT_*` | ❌ | ✅ | ✅ |
| `ADD_RUSH_24H` | ❌(太赶) | ❌ | ✅ |
| `ADD_RUSH_48H` | ❌ | ✅ | ✅ |
| `ADD_RUSH_72H` | ✅ | ✅ | ✅ |
| `ADD_REV_*` | ❌ | ✅ | ✅(默认 3 轮,加项再叠) |
| `ADD_LEGAL_*` | ✅(默认带 1 个) | ✅ | ✅(premium 必带 2 个) |
| `ADD_OPS_*` | ✅ | ✅ | ✅ |

**关键逻辑**:
- essential 档:不开放"创意加项",只放"基础交付物必备"(`ADD_SRC_*` / `ADD_LEGAL_*` / `ADD_RUSH_72H` / `ADD_OPS_*`)
- standard 档:全开
- premium 档:全开 + 部分加项自动绑定(`ADD_LEGAL_COPYRIGHT_REG` + `ADD_LEGAL_AD_COMPLIANCE` 必带)

### 13.4 法律责任分级

| 项 | Essential | Standard | Premium |
|---|---|---|---|
| **平台对交付物背书** | 弱(只保证文件 / 时长合规) | 中(AI 通过 + 抽检) | 强(全流程审 + 平台担保) |
| **纠纷时平台介入** | 弱介入(只调证) | 中等(AI 报告 + 调解) | 强介入(必仲裁 + 平台担保退款) |
| **专家仲裁费** | 买家承担 | 各半 | 平台承担 |
| **创作者保证金** | ¥0 | ¥500 | ¥2,000 |
| **超时赔付** | 不赔 | 10% / 天 | 30% / 天 + 平台兜底 |

> **注**:上面这些法律责任分级要进 [用户协议 v2 §5 AIGC 撮合规则](../legal/2026-user-agreement-v2.md) 同步更新,法务审。

### 13.5 价格示例:同需求 3 档对比

需求:"5 条 30s 短视频,抖音 + 小红书 + 视频号,英文配音,3 IP 出镜,7/25 上线(12 天)"

**essential 档**:不允许这么多加项 → 必须升档或精简需求
- 该需求在 essential 档无法完成(数量 / 平台 / 语言都超)
- 平台 Agent 在 brief 拆解阶段就会提示"请升档或简化"

**standard 档**(默认路径):
```
BASE_SHORTVIDEO_STANDARD              ¥1,400 × 1 = 1,400
ADD_QTY_VIDEO                         ¥350 × 4   = 1,400
ADD_IP_EXTRA                          ¥300 × 2   =   600
ADD_PLT_EXTRA                         ¥200 × 2   =   400
ADD_LANG_EN_VOICE                     ¥250 × 1   =   250
ADD_LANG_SUBTITLE                     ¥80  × 5   =   400
ADD_LANG_BILINGUAL_SUB                ¥150 × 5   =   750
─────────────────────────────────────────────────────
总价                                       ¥5,200

评审路径:L1 RULE → L2 LLM(autoPass ≥ 0.80) → 抽 20% 进 L3 → 客诉 >¥500 进 L4
```

**premium 档**(高客单):
```
BASE_SHORTVIDEO_PREMIUM               ¥2,500 × 1 = 2,500
ADD_QTY_VIDEO                         ¥600 × 2   = 1,200  (premium 内含 3,加 2)
ADD_IP_EXTRA                          ¥500 × 1   =   500  (premium 内含 2,加 1)
ADD_PLT_EXTRA                         ¥350 × 1   =   350  (premium 内含 2,加 1)
ADD_LANG_EN_VOICE                     ¥400 × 1   =   400
ADD_LANG_SUBTITLE                     ¥120 × 5   =   600
ADD_LANG_BILINGUAL_SUB                ¥250 × 5   = 1,250
ADD_LEGAL_COPYRIGHT_REG               ¥500 × 1   =   500  (premium 必带)
ADD_LEGAL_AD_COMPLIANCE               ¥500 × 1   =   500  (premium 必带)
─────────────────────────────────────────────────────
总价                                       ¥7,800

评审路径:L1 RULE → L2 LLM(3 次取中位,autoPass ≥ 0.85) → 100% 进 L3 → 客诉 >¥1500 进 L4
```

**对比**:
- 数量:premium 内含 3 条视频 → 比 standard 省 2 条 ADD_QTY_VIDEO(¥1,200 vs ¥1,400)
- IP:premium 内含 2 个 → 比 standard 省 1 个 ADD_IP_EXTRA(¥500 vs ¥600)
- 平台:premium 内含 2 平台 → 比 standard 省 1 个 ADD_PLT_EXTRA(¥350 vs ¥400)
- 但 premium **必带** `ADD_LEGAL_*`(¥1,000),这部分是平台背书成本
- **同需求下,premium 总价比 standard 贵 ¥2,600**(主要是平台背书 + 法务保障)

### 13.6 与 W2 #28 现有平台的衔接

- `AcceptanceTemplate.checklist.passingScore`:由 `TierPolicy.l2AutoPassThreshold` 替换,**AcceptanceTemplate 不再硬编码 0.80**
- `PlatformJudgeService.judgeDeliverable()`:升级为分层调用(L1→L2→L3 触发)
- `CatalogSku.basePrice/deliveryDays/quantity` 等字段 → 移到 `TierPolicy` 表,**CatalogSku 作 SKU code 锚点(只存 code + description)**
- 数据迁移:已有 `CatalogSku` 15 行 → 自动生成对应 `TierPolicy` 15 行

---

## 14. 修订后工作量(W2.5)

### 14.1 工时估算(增量)

| 阶段 | 内容 | 工时 |
|---|---|---|
| **0. 评审架构升级** | 4 层评审 + TierPolicy 表 + AcceptanceTemplate 改造 | +2 天 |
| 1. Schema | LineItemCatalog + LineItemTierPrice + BriefLineItem + BidLineItem + TierPolicy | 1.5 天 |
| 2. Seed | 76 行 LineItemCatalog + 15 行 TierPolicy(3 档 × 5 品类)+ 228 行 LineItemTierPrice(76 × 3) | 1 天 |
| 3. Service | BriefService / BidService 改造 + 总价守恒 + 约束校验 | 1.5 天 |
| 4. Agent | BriefNewPage "AI 拆解" prompt 升级(返回 line items) | 1 天 |
| 5. 前端 | BriefNewPage 加 line items 编辑器(展示 + 数量加减 + 删除 + 档位切换重算) | 2 天 |
| 6. 前端 | 买家 BriefDetailPage 加 bid 列表 + 接受按钮(W2 漏的) | 1 天 |
| 7. 前端 | BriefDetailPage 加 4 层评审进度可视化 | 0.5 天 |
| 8. 烟测 | 详细路径 E2E + 快速路径回归 + 3 档评审路径 E2E + 互斥约束烟测 | 1.5 天 |
| 9. 文档 | W2.5 Review + 验收映射表 + 迁移指南 | 0.5 天 |
| **合计** | | **~13 天(2.5 周)** |

### 14.2 接入时点

W3 起步前做掉。

### 14.3 数据迁移

- W2 已有的 brief / bid 不动
- 新 brief 强制走 line items
- CatalogSku → TierPolicy 自动迁移脚本

---

## 15. v2+ 路线(本期不做)

- ❌ 创作者自定义 line item(开放加项市场)
- ❌ 按效果分成(CPM / CPA)
- ❌ 创作者议价(可在 ±10% 内调整 unitPrice)
- ❌ L4 行业专家库的冷启动(目前靠平台运营外聘)
- ❌ 跨 brief 复用 line items(模板化)
- ❌ 多币种 + 跨境结算

---

## 16. 关联文档(更新)

- [CatalogSku (W2 #28)](../../apps/api/prisma/schema.prisma) — 第 1 层锚点(将被 TierPolicy 替代)
- [Brief Package Standard v1.0](2026-brief-package-v1.md) — 7 项必填字段
- [Pricing & Settlement Standard v1.0](2026-pricing-settlement-v1.md) — 动态调价机制
- [Acceptance Standard v1.0](2026-acceptance-v1.md) — 7 项验收清单 + passingScore 由 TierPolicy 替换
- [Platform Standards Overview v1.0](2026-platform-standards-v1.md) — 整体索引
- [PlatformJudgeService (W2 #28)](../../apps/api/src/platform-judge/platform-judge.service.ts) — 第 1 个平台 Agent,本次升级为 4 层

---

## 17. 修订

| 版本 | 日期 | 修订人 | 修订内容 |
|---|---|---|---|
| 0.9 | 2026-07-01 | Claude | 初稿,76 行 line item 清单,待评审 |
| 1.0 | 2026-07-01 | Claude | 加 4 层评审架构 + 3 档质量档具化 + TierPolicy 表 + 法律责任分级 |