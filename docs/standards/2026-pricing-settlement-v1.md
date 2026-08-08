# 平台价格 & 清算标准 (Pricing & Settlement) v1.0

> 标准代号:STANDARD-PRICING-SETTLEMENT-V1
> 生效日期:2026-07-01
> 维护:ibi.ren 平台运营 / 法务
> 适用:所有 AIGC 众包交易
> 一句话:菜单价不可议 + 动态调价 3 道软护栏 + 清算分账透明

---

## 1. 制定背景

非标服务交易第二大痛点是"价格不透明" + "清算扯皮"。本标准规定:
- 平台菜单价 = 不可议价的基线
- 加价/加项走标准通道(动态调价 3 道软护栏)
- 清算分账公式公开、自动

## 2. 菜单价(基础)

15 SKU = 5 品类 × 3 档(essential / standard / premium),全国统一价。
详见 `/studio/catalog` 与数据库表 `CatalogSku`。

| 档位 | 价格范围 | 适合 |
|---|---|---|
| Essential 基础版 | ¥700 - ¥1,000 | 试水 |
| Standard 标准版 | ¥1,400 - ¥2,000 | 主流选择 |
| Premium 旗舰版 | ¥2,500 - ¥3,500 | 全功能旗舰 |

**不可议价**:同一 SKU 同档位所有买家看到的价格完全相同。
**加价/加项**:通过标准通道(下文 §3 §4),不走"事前谈判"。

## 3. 加项规则

加项 = 在 SKU 基础上增加工作量,按比例或固定金额加价:

| Add-on Code | 名称 | 加价规则 | 适用 |
|---|---|---|---|
| `ADD_PLATFORM` | 加 1 个平台 | + 5% | 全品类 |
| `ADD_IP` | 加 1 个 IP | + 8% | ad/shortvideo/poster |
| `RUSH_3D` | 加急(< 7 天交付) | + 25% | 全品类 |
| `HIGH_COMPLEXITY` | 高复杂度(定制镜头/特效/转场/真人 + AI) | + 30% | ad/shortvideo/livestream/3d |
| `EXTRA_VIDEO` | 加 1 条视频 | + ¥280~¥600(按品类) | ad/shortvideo/livestream/3d |
| `EXTRA_VIDEO` | 加 1 张海报 | + ¥250 | poster |
| `SUBTITLE_BURN` | 烧录字幕 | + ¥100/条 | livestream |

**叠加规则**:
- 同类加项可叠加(ADD_PLATFORM × 2 = +10%)
- 不同类可叠加(RUSH_3D + ADD_PLATFORM = +30%)
- **累计加价上限:不超菜单价 50%**(超 50% 需联系平台)

## 4. 动态调价(无人接单时)

买家发包后 24h 内无创作者投标,买家可在 bidding 阶段主动加价,吸引接单。

### 阶梯推荐
| 时长 | 推荐加价幅度 | 紧迫度 |
|---|---|---|
| ≥ 24h | +10% | low |
| ≥ 72h | +20% | medium |
| ≥ 7d | +30% | high |

(cron stub:`GET /api/v1/admin/briefs/bump-recommendations`)

### 3 道软护栏(2026-07-01 用户决策)

用户决策:不设硬上限 + 3 道软护栏。理由:加价上限会失真(都顶到上限),3 道软护栏兼顾撮合效率与防滥用。

**护栏 ① 累计 ≤ 3 次**
- 同一 brief 累计加价 ≤ 3 次,达到 3 次后,买家只能关闭 brief 或继续等待
- 防止"无限加价"被算法识别为异常

**护栏 ② 超 2x 菜单价弹窗二次确认**
- 加价后总价 > 2x 菜单价 → 平台返回 `needConfirm: true`,前端弹窗"我知这是高溢价,继续"
- 防止"误操作"或"冲动加价"

**护栏 ③ 创作者端只显示总价,看不到加价幅度**
- 创作者端 `getPublicById` 服务端剥离 `bumpHistory` 字段
- 防止"老买家 vs 加价老买家"被歧视

## 5. 清算分账

### 验收通过后

| 角色 | 分账比例 |
|---|---|
| 创作者 | 70% |
| 平台 | 25% |
| IP 所有者(独立 IP 授权) | 5% |

**到账时间**:T+1(验收通过 + 1 工作日,自动到账)

### 分账公式

```
创作者实收 = Brief.currentPrice × 70%
平台实收   = Brief.currentPrice × 25%
IP 实收    = Brief.currentPrice × 5%  (仅当 IP 走独立授权)
```

**示例**:Brief.currentPrice = ¥1,500,IP 走独立授权
- 创作者:¥1,050
- 平台:¥375
- IP 所有者:¥75

### 退款

| 验收情况 | 退款规则 |
|---|---|
| 首次验收未通过 | 全额退买家,平台 0 抽成;创作者承担工时 |
| 二次验收仍未通过 | 50% 退买家,创作者承担工时(已耗成本) |
| 买家主观拒收 + 平台 Agent 判定 pass | 买家需付 30% 违约金(覆盖创作者 + 平台) |
| 创作者未交付 | 全额退买家,扣创作者 50 信用分 |

## 6. 跳单(off-platform)罚则

详见 [用户协议 v2 §7 跳单检测与处罚](../legal/2026-user-agreement-v2.md)

**核心**:
- 平台识别到双边绕过平台直接交易(微信/支付宝等),扣 200 信用分 + 冻结账户 7 天
- 累计 2 次跳单 → 永久封号

## 7. 修订

| 版本 | 日期 | 修订人 | 修订内容 |
|---|---|---|---|
| 1.0 | 2026-07-01 | 平台运营 | 初版 |

## 8. 关联文档

- [Brief Package Standard v1.0](2026-brief-package-v1.md)
- [Acceptance Standard v1.0](2026-acceptance-v1.md)
- [用户协议 v2 §5 AIGC 众包撮合](../legal/2026-user-agreement-v2.md)
- [用户协议 v2 §7 跳单检测与处罚](../legal/2026-user-agreement-v2.md)
- [Platform Standards Overview v1.0](2026-platform-standards-v1.md)
