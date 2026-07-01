# 平台验收标准 (Acceptance) v1.0

> 标准代号:STANDARD-ACCEPTANCE-V1
> 生效日期:2026-07-01
> 维护:ibi.ren 平台运营 / 法务
> 适用:所有 AIGC 众包交付物 (Deliverable)
> 一句话:7 项 checklist + 通过线 0.80,缺一项不可结案

---

## 1. 制定背景

AIGC 内容验收长期无统一标准,导致:
- 买家主观"不喜欢"拒收
- 创作者"按要求做了"被打回
- 平台仲裁无据可依

本标准用 **结构化 7 项 checklist + 加权打分** 把验收"可计算、可复核、可申诉"。

## 2. 7 项验收清单

每项 score 范围 0-1,weight 由 `AcceptanceTemplate.checklist.items[].weight` 决定(各档位 sum=1.0)。
通过线 `passingScore = 0.80`(各档位一致)。

### ① 内容完整性(weight 0.20)
- 成片数量与 brief 一致
- 平台覆盖与 brief 一致
- 数字人 IP 出镜次数符合 brief 要求

**score 判定**:
- 1.0:全部一致
- 0.7:数量差 ≤ 10%
- 0.4:数量差 10-30%
- 0.0:数量差 > 30% 或缺关键平台

### ② 时长 / 比例(weight 0.15)
各平台时长与比例要求:

| 平台 | 时长 | 推荐比例 |
|---|---|---|
| 抖音 | 15-60s | 9:16 |
| 小红书 | 15-60s | 3:4 / 1:1 / 9:16 |
| 视频号 | ≤ 60s | 9:16 / 16:9 |
| YouTube | 不限 | 16:9 / 9:16 |
| TikTok | 15-60s | 9:16 |
| B 站 | ≤ 5min | 16:9 |

**score 判定**:
- 1.0:全部合规
- 0.5:时长超 ≤ 20% 或比例错但可裁剪
- 0.0:时长严重超 / 比例无法调整

### ③ 音画质量(weight 0.15)
- 无明显水印/黑边/花屏/卡顿
- 音轨清晰,无爆音/静音
- 字幕正确(无错别字/对齐错位)

**score 判定**:
- 1.0:无问题
- 0.6:1-2 处小瑕疵
- 0.3:3+ 处瑕疵
- 0.0:严重问题(花屏/无音轨/大量错别字)

### ④ IP 一致性(weight 0.20)
- 数字人形象与选定 IP 匹配(脸/声/动作风格)
- 平台 Agent 用 LLM 校验(平台仲裁 Agent 第 1 任务)

**score 判定**:
- 1.0:脸/声/动作风格全匹配
- 0.5:脸匹配,声/动作有差异
- 0.0:脸明显不匹配(用错 IP)

### ⑤ 品牌调性(weight 0.10)
- 视觉/语气符合 brief 描述(品牌调性、目标人群)
- 平台 Agent + 买家 review 共同判定

**score 判定**:
- 1.0:完全符合
- 0.5:基本符合但有偏差
- 0.0:明显不符

### ⑥ 合规(weight 0.15)
- 无违规词(《广告法》禁用词 / 平台敏感词)
- 无违规画面(烟酒/暴力/政治敏感/未授权品牌)
- 无未授权音乐/字体
- 含 <数字人> 角标(广告合规指南 §3)

**score 判定**:
- 1.0:全部合规
- 0.5:小瑕疵(可快速修复)
- 0.0:严重违规(下架风险)

### ⑦ 可投性(weight 0.05)
- 文件格式/分辨率/编码符合目标平台要求
- 视频:MP4 (H.264 + AAC),分辨率 ≥ 720p
- 海报:PNG / JPG,≥ 1080p,RGB 色彩空间

**score 判定**:
- 1.0:可直接投放
- 0.5:可转码(轻微耗时)
- 0.0:文件损坏或不可转码

## 3. 平台 Agent 判定

平台提供 **平台仲裁 Agent(PlatformJudgeService)**,按本标准对创作者交付物打分:

- **触发时机**:创作者上传 deliverable 后 / 买家手动触发
- **流程**:
  1. 读 `Brief.acceptanceChecklist`(若无,落到 `AcceptanceTemplate` by category+tier)
  2. 调 Anthropic Claude 按 checklist 逐项打分
  3. 写 `PlatformJudgment` 表(留痕)
  4. 若 `!pass`(totalScore < passingScore)→ 自动创建 `Dispute`,status=`mediating`,等 admin 复核
- **法律责任**:Agent 判定是"参考",终极争议由 `admin /disputes` 人工复核

## 4. 验收不通过的处理

| 失败情况 | 处理 |
|---|---|
| Agent 自动判定 !pass | 自动创建 Dispute,买家/创作者可在 admin 复核 |
| 买家主观拒收 | 买家可在 deliverable 详情页点"申诉",附证据 |
| 创作者对 Agent 判定不服 | 创作者可附"补充说明 + 证据"提交重审 |
| 反复 2 次仍未通过 | 50% 退买家,创作者承担工时 |

## 5. 修订

| 版本 | 日期 | 修订人 | 修订内容 |
|---|---|---|---|
| 1.0 | 2026-07-01 | 平台运营 | 初版 |

## 6. 关联文档

- [Brief Package Standard v1.0](2026-brief-package-v1.md)
- [Pricing & Settlement Standard v1.0](2026-pricing-settlement-v1.md)
- [数字人广告合规指南](../legal/2026-aigc-advertising-compliance-guide.md)
- [Platform Standards Overview v1.0](2026-platform-standards-v1.md)
