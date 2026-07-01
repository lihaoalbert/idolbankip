# 平台标准任务包 (Standard Brief Package) v1.0

> 标准代号:STANDARD-BRIEF-PACKAGE-V1
> 生效日期:2026-07-01
> 维护:ibi.ren 平台运营 / 法务
> 适用:所有 AIGC 众包发包单 (Brief)
> 一句话:买家发包 = 平台标准任务包,含 7 项固定字段 + 自由描述

---

## 1. 制定背景

非标服务交易的最大痛点是"事前协商":买家说要短视频,创作者理解为带剧情,买家以为是产品介绍;平台标准任务包 = 把需求"翻译"成结构化字段,让双边事前对齐,事后可验收、可仲裁。

## 2. 7 项必填字段

### ① 基本信息
- 标题(≥ 5 字,≤ 80 字)
- 描述(选填,品牌调性/目标人群/参考案例/必现元素)

### ② 内容品类(5 选 1)
- `ad` 数字人广告(30s / 60s 出镜)
- `shortvideo` AIGC 短视频(抖音/视频号/TikTok)
- `livestream_clip` 直播切片(原录像 + AI 二剪)
- `poster` 营销海报(KV / banner / 小红书)
- `3d` 3D 数字人(Live2D / 3D 角色)

### ③ 投放平台(多选)
9 平台枚举:`douyin` / `xiaohongshu` / `wechat` / `youtube` / `tiktok` / `instagram` / `x` / `linkedin` / `bilibili`

### ④ 数字人 IP(多选,选自买家已购 IP)
必选,创作者用这些形象出镜;若买家无可用 IP,可由平台 Agent 推荐授权的 IP。

### ⑤ 套餐(15 SKU = 5 品类 × 3 档)
| 档位 | 适合 | 价格范围 |
|---|---|---|
| Essential 基础版 | 试水 | ¥700 - ¥1,000 |
| Standard 标准版 | 主流选择 | ¥1,400 - ¥2,000 |
| Premium 旗舰版 | 全功能 | ¥2,500 - ¥3,500 |

完整 SKU 菜单见 [/studio/catalog](https://ibi.idata.mobi/studio/catalog) 与数据库表 `CatalogSku`。

### ⑥ 预算区间
¥ 区间;菜单价 ±20% 内合理,过高/过低需在描述中说明原因。

### ⑦ 截止时间
≥ 当前 + 1 天;早于该限制,平台拒绝发布。

### (挂套餐后自动绑定)⑧ 验收标准
- 挂 SKU 后自动绑定 7 项 checklist(见 [Acceptance Standard v1.0](2026-acceptance-v1.md))
- 通过线 0.80;任一项 score=0 整单不通过

## 3. AI 拆解(可选,显式按钮触发)

买家不确定怎么填时,可在 BriefNewPage 顶部点 **"AI 拆解"** 按钮,平台 Agent 会:
- 识别品类
- 推荐平台/IP/档位
- 生成验收清单
- 填到表单(用户可再改)

Agent 拆解是辅助,不替代买家决策;法律责任在买家本人(详见 用户协议 v2 §2.5)。

## 4. 不可议价原则

平台菜单价 = 标准价,所有 SKU 同品类同档位全国统一价。
- 买家发包时菜单价自动锁定为 `Brief.currentPrice`
- 创作者投标按菜单价 ±10% 内属正常
- 需加价 → 走 [Pricing & Settlement Standard v1.0](2026-pricing-settlement-v1.md) 的"动态调价"通道

## 5. 标准任务包示例

```json
{
  "title": "晶新 AI 7 月新品发布短视频 × 5 条",
  "description": "面向 Z 世代科技爱好者,30s 短视频,带字幕 + 节奏剪辑,主推新品 XX-200",
  "category": "shortvideo",
  "platformSet": ["douyin", "xiaohongshu", "wechat"],
  "ipIds": ["ip_xxx_demo"],
  "packageTier": "standard",
  "budgetMin": 1500,
  "budgetMax": 2000,
  "deadlineAt": "2026-07-31T00:00:00Z"
}
```

## 6. 修订

| 版本 | 日期 | 修订人 | 修订内容 |
|---|---|---|---|
| 1.0 | 2026-07-01 | 平台运营 | 初版 |

## 7. 关联文档

- [用户协议 v2 §2.5 AI Agent 责任](../legal/2026-user-agreement-v2.md)
- [用户协议 v2 §5 AIGC 众包撮合](../legal/2026-user-agreement-v2.md)
- [Acceptance Standard v1.0](2026-acceptance-v1.md)
- [Pricing & Settlement Standard v1.0](2026-pricing-settlement-v1.md)
- [Platform Standards Overview v1.0](2026-platform-standards-v1.md)
