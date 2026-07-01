# Blueprint Wizard · 创作者使用手册

> **Phase 1 Layered Prompt Generator** · 8 步人脸分解向导
>
> 入口:`https://ibi.ren/creator` → "Layered Prompt Generator" 卡片 → 8 步向导
>
> Beta · 2026-06-24 上线

---

## 0. 这是什么

**目标**:让创作者**先把脸锁版**,再用 prompt 给平台(MJ / SD / 即梦 / 豆包)出图。避免每次重新抽卡,人脸一致性大幅提升。

**为什么需要**:捏 IP 的核心痛点是"画不出同一个脸"。直接 prompt 出图 → 角色崩坏 → 重新抽卡 → 还是崩坏。Blueprint 把脸拆成 **8 层可调参数** → 生成锁版 prompt → 出图一致性显著提高。

**与 IpWizard 关系**:Blueprint 是"脸的设计稿",IpWizard 是"脸的成品"。Phase 2 起,Blueprint 完成后可一键注入到 IpWizard 的 description 字段(自动填写小传 + 推荐定价)。

---

## 1. 8 步流程概览

| 步 | 层 | 中文 | 字段数 | 控件 |
|---|---|---|---|---|
| L1 | Skeleton | 骨骼 | 8 | 6 slider + 2 select(颅型/下颌角) |
| L2 | SoftTissue | 软组织 | 6 | 6 slider |
| L3 | Features | 五官 | 12 | 10 slider + 2 select(眼型/唇型) |
| L4 | Skin | 皮肤 | 6 | 4 slider + 2 select(底色/肤况) |
| L5 | Hair | 毛发 | 8 | 2 slider + 6 select(发型/发色/长度/卷度/刘海/鬓角) |
| L6 | Decoration | 装饰 | 6 | 4 select(眼镜/耳饰/妆容/纹身) + 2 slider(浓淡) |
| L7 | Render | Prompt 生成 | — | 中/英 prompt + 4 平台变体卡(MJ/SD/即梦/豆包) |
| L8 | Evaluation | 评估 | — | 雷达图 + 8 维 sub-score + 综合分(原创度/一致性/美感) |

**总时长**:8 步完整填完约 15 分钟。可中途退出,下次回来自动恢复草稿。

---

## 2. 操作流程

### 2.1 进入向导

1. 登录创作者账号 → `https://ibi.ren/creator`
2. 在 "Layered Prompt Generator" 卡片点 **开始 Layered Prompt →**
3. 自动跳转到 `/creator/blueprint/new/step/1` → 后端创建空 Blueprint → 跳到带 ID 的 URL

### 2.2 8 步填写

每步都有:
- **Stepper 顶部进度条** — 8 个圆点,已完成步可点回,未完成步 disabled
- **表单主体** — slider 拖动 / 按钮点选(实时预览)
- **右侧完成度** — 百分比 + "已存 HH:MM:SS" 时间戳
- **底部"立即保存"** — 主动 flush(默认 800ms debounce 自动存)

**填写技巧**:
- 不确定的字段先用默认值,后续可回头改
- L1/L2/L3 是"脸的骨架",优先级最高 → **建议先填完 L1~L3 再填 L4~L6**
- L7 prompt 是给 AI 看的,可微调措辞

### 2.3 中途退出/草稿恢复

- **自动保存**:每次改表单 → 800ms debounce → PATCH 到后端 + 写 localStorage
- **手动保存**:点 "立即保存" 按钮
- **退出**:刷新或关闭页面都可。下次访问同一 Blueprint URL:
  - 后端有数据 → 用后端
  - localStorage 有草稿 → 顶部黄条提示"已从本地草稿恢复",点 "丢弃草稿" 改用服务器版本
- **多设备**:localStorage 是浏览器本地,跨设备不共享;以最后 PATCH 到后端的版本为准

### 2.4 L7 Prompt 生成

L6 完成后跳到 L7,自动生成:
- **中文 prompt**(默认显示) — 适配即梦/豆包等国内平台
- **English prompt** — 适配 Midjourney/Stable Diffusion
- **4 张平台变体卡** — MJ / SD / 即梦 / 豆包,各显示适配该平台的最优 prompt(可一键复制)

切换平台 tab → 复制 → 粘贴到对应平台。

### 2.5 L8 评估

L7 完成后点 "评估" 按钮 → 后端跑评估(目前 mock) → 返回:
- **雷达图** — 8 维 sub-score(L1_complexity/L2_expressiveness/L3_distinctiveness/L4_skin_realism/L5_hair_coverage/L6_decoration_completeness/L7_prompt_quality/L8_contradiction_bonus)
- **综合分**(0~10) — 原创度 / 一致性 / 美感 三个主分
- **矛盾检测提示** — 比如"光头 + 长鬓角"会标 warning,建议调整

**怎么读**:
- sub-score 8 维分高 = 描述完整度高,prompt 出图保真度更好
- L8_contradiction_bonus 高 = 反差点多,原创度评分加成
- 综合分 ≥ 7 算"可上平台出图";< 7 建议回头补字段

---

## 3. 已知限制 / Phase 后续

| 项 | 当前状态 | 何时上线 |
|---|---|---|
| **与 IpWizard 衔接** | L7 prompt 仅展示,需手动复制到 IpWizard | Phase 2(预计 Q3 2026) |
| **真实 FLAME 3DMM 评估** | L8 评估用 mock 公式 | Phase 3(需要 1000 张标注脸) |
| **平台 API 直出图** | 仅生成 prompt,需手动到平台粘贴 | Phase 4(平台 API 谈下来后) |
| **多人协作** | 一个 Blueprint 一个 ownerId | 暂未排期 |
| **版本对比** | 不支持 diff | 暂未排期 |

---

## 4. 故障排查

| 症状 | 可能原因 | 解决 |
|---|---|---|
| 进 `/creator` 看不到入口卡片 | ENV `VITE_BLUEPRINT_WIZARD_ENABLED=false` | 找工程师改回 true(rebuild web) |
| 路由 `/creator/blueprint/new` 自动跳回 `/creator` | 同上,前端路由守卫拦截 | 同上 |
| 后端返 404 `feature_disabled` | ENV `BLUEPRINT_WIZARD_ENABLED=false` | 找工程师改回 true(restart api) |
| 草稿恢复失败 | localStorage 被清(隐私模式/清缓存) | 重新填一遍,刷新前点 "立即保存" |
| L8 评估超时 | LLM provider 故障 | 等几分钟重试,或联系工程师 |
| 评估分数都是 0 | 某一层数据全是 null(没填) | 回前面填对应步 |

---

## 5. 反馈与改进

Beta 阶段欢迎创作者反馈:
- 哪步字段太多/太少?
- 哪步 sliders 范围不对?
- L7 prompt 模板需要哪些新平台?
- L8 评估维度需要补什么?

反馈渠道:`contact@ibi.ren` 或 Discord 频道 #creator-feedback。

---

> 最后更新:2026-06-24 · Phase C R3 文档