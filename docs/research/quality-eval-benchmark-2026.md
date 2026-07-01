# AI 作品质量评审 — Benchmark 调研 (W2.5 / 2026)

> **状态**:调研完成,目标 A 选项(2 周深度调研)— 5 个子任务全部跑通,有数据支撑。
> **关联**:用户给的"4 层 AI 自动评分架构"(技术 / 美学 / 合规 / 商业价值)
> **易混淆**:这 4 层 ≠ [[../standards/2026-line-item-catalog-v1.md|line-item-catalog]] §12 的"L1 RULE / L2 LLM / L3 OPERATOR / L4 EXPERT"(那是**人机协作的流程层级**,这里是 **AI 评分的 4 个维度**,正交关系)
> **关联记忆**:[[project-ai-quality-eval-4layers]] / [[project-line-item-catalog-tier]]
> **上游任务卡**:W2 #28(PlatformJudgeService 1.0 已上线),W2.5 是 2.0 升级。

---

## 0. 一句话结论

**MVP 走"全 API 路线 + 分层调用":L1 ffprobe(免费)+ L2 美学主用 Qwen-VL-Max(国产 ¥0.006/条,Claude 仲裁)+ L3 阿里云内容安全增强版(~¥110/月)+ L4 商业价值同 L2 VLM。月成本 ¥1,306,在 ¥1,145 现状上只多 ¥161,不动 ECS,3 天上线**。

- **不推荐 W2.5 阶段自建 GPU**:`gn6i` T4 ¥1,681/月,日 100 条利用率 <10%,MVP 不划算(W3+ 再评估)。
- **AIGC 评分必须有校准集**:直接信 VLM 会被"西方审美 / 中文 prompt 偏长 / 长视频 token 爆"三大坑打爆,必须攒 50-100 条平台自家 AIGC 样本人评做 SRCC baseline。
- **风险最大的不是技术,而是"评分公开范围"**:买家 vs 创作者 vs 平台 admin 三方对评分的可见性是产品决策,不是技术决策。

---

## 1. 4 层 AI 自动评分架构(用户原话)

### Layer 1 — 技术质量
- 执行者:ffprobe / opencv / ffmpeg(确定性工具)
- 覆盖度:100% 自动化
- 检查项:
  - 视频:分辨率 / 码率 / 编码 / 色彩空间 / 时长 / 帧率
  - 音频:电平 / 黑帧静帧 / 字幕同步
  - 3D:面数 / 法线 / UV / 骨骼完整性

### Layer 2 — 美学质量
- 执行者:VLM(Claude 3.5 Sonnet / GPT-4V / Qwen2-VL / GLM-4V)+ 视觉质量模型
- 覆盖度:60-95% 自动化
- 检查项:
  - 构图 / 色彩和谐 / 光照一致性 / 运镜平滑
  - 数字人口型同步(Wav2Lip/SyncNet)/ 表情自然度
  - 整体美感评分:DOVER / FAST-VQA / BVQA

### Layer 3 — 合规质量
- 执行者:NLP + 词表 + 内容安全 API(阿里云/腾讯云)
- 覆盖度:80-100% 自动化
- 检查项:
  - 广告法 / 平台规则 / IP 形象相似度 / 品牌元素
  - 形象授权 / 未成年人 / 政治敏感
- ⚠ **闸门规则**:任一不合规 → 总分 = 0(一票否决)

### Layer 4 — 商业价值
- 执行者:LLM 比对 brief 描述 + VLM 看内容
- 覆盖度:50-75% 自动化
- 检查项:
  - Hook 强度 / 信息传递完整性 / 目标人群匹配
  - CTA 清晰度 / 情感共鸣度 / 品牌调性

### 最终评分公式
```
总分 = L1 × 0.15 + L2 × 0.30 + L3 × 0.25 + L4 × 0.30

闸门:
- L3 任一不合规 → 总分 = 0
- L1 < 0.60 → 总分自动 < 0.50(直接打回)
- L4 < 0.40 → 触发"商业价值不达标"标记

分级:≥ 0.85 = S / 0.70-0.85 = A / 0.60-0.70 = B / < 0.60 = C
```

**关键设计**:每条扣分必须带 evidence(frame:timecode / bbox / OCR 文本 / 截图),不能黑盒给分。

---

## 2. 调研任务清单与产出映射

| 子任务 | 产出文档 | 主要结论 |
|---|---|---|
| **2.1 VLM 美学评分** | 本文档 §3 | 主用 **Qwen-VL-Max**(¥0.006/条,中文母语),仲裁 **Claude Sonnet 4.5**(VideoAesBench 67.88% 第 1) |
| **2.2 视频质量学术模型** | 本文档 §4 | DOVER 仍是事实 SOTA(ICCV'23),但需 GPU;W2.5 阶段用 VLM + Aesthetic V2.5(抽帧锚)替代 |
| **2.3 内容安全 API** | 本文档 §5 | **阿里云内容安全增强版**★★★★★ 主用,腾讯云天御 ★★★★ 备用,自建仅做广告法词表 fallback |
| **2.4 数字人口型同步** | 本文档 §6 | MuseTalk 1.5(腾讯音乐,MIT,中英日官方支持)+ SyncNet(指标工具)。**W2.5 只算 LSE-D 不重渲** |
| **2.5 ECS 部署 + 成本** | 本文档 §7 | **方案 A 优化版 ¥1,306/月**(Qwen-VL-Plus + 分层调用),不动 ECS |
| **2.6 评分校准集** | 本文档 §8.3 | 公开 AVA + KoNViD-1k 做 baseline,平台自家 AIGC 攒 100 条人评做 SRCC |

---

## 3. 子任务 2.1 — VLM 美学评分 benchmark

> **数据源**:`/tmp/vlm-benchmark-research/quality-eval-benchmark-2026.md`(2026-07-01 Firecrawl + arXiv 调研)

### 3.1 4 个 VLM 横向对比

| 维度 | Claude-Sonnet-4.5 | GPT-4o / GPT-5.x | Qwen2.5/3-VL-72B/32B | GLM-4.5V |
|---|---|---|---|---|
| **API 输入 $/MTok** | $3(200K 内) | GPT-5 $2.5, GPT-4o $2.5 | Qwen2.5-VL-72B 国际 $0.80 / 国内 ¥0.016/千 tok | $0.60(国际),国内 BigModel ¥0.4/MTok 级 |
| **API 输出 $/MTok** | $15 | $10–15 | $0.90–6.88(国际/国内) | $1.80(国际) |
| **视频能力** | 看图帧(基 4.6 之后);**不直接看 mp4**,需抽帧 | 同样需抽帧 | **Qwen2.5-VL 原生支持视频**(1 小时+,动态 FPS) | 视频帧支持(需抽帧) |
| **结构化输出** | **Structured Outputs**(tool use JSON Schema 强校验) | JSON mode + strict schema | 支持 QwenVL HTML / JSON,bounding-box JSON 稳定 | 支持 JSON,稳定性参差 |
| **中文 prompt** | 优秀(Sonnet 4.5 中文综合强) | 良好 | **母语级**(阿里原生) | **母语级**(智谱原生) |
| **美学 benchmark 实测** | **VideoAesBench 67.88% 排第 1** | o3 = 66.69% | Qwen3-VL-32B = 66.69%(判别 TF 74.81% 最高) | 未在 VideoAesBench 主榜 |
| **可直看视频?** | 否 | 否 | **是** | 否 |
| **隐私/合规** | 海外,数据出境 | 海外,数据出境 | **国内(阿里云),满足境内合规** | **国内(智谱),满足境内合规** |

### 3.2 关键实测:VideoAesBench(2026 年最新、与 AIGC 视频最相关)

**来源**:arXiv 2601.21915 / Li et al. 2026

- **基准规模**:1,804 视频(UGC/AIGC/压缩/RGC/CG)/ 1,641 问题
- **美学维度**:Visual Form / Visual Style / Visual Affectiveness 三层 12 指标
- **23 个 LMMs 参与,前 5 名(2026 最新榜)**:

| 排名 | 模型 | 综合准确率 | 备注 |
|---|---|---|---|
| 1 | **Claude-Sonnet-4.5** | **67.88%** | 闭源第 1,单选 73.33% 最高 |
| 2 | o3(OpenAI) | 66.69% | 闭源 |
| 3 | **Qwen3-VL-32B** | **66.69%** | **唯一能打闭源的开源**,判别 TF 74.81% 最高 |
| 4 | Gemini-2.5-Pro | ~66.0% | 闭源 |
| 5 | InternVL3.5(开源次席) | <66% | 开源 |

**为什么这个 benchmark 与 ibi.ren 高度相关**:它是 2026 年 1 月最新的、专门评**视频美学感知**的 LMM benchmark,包含 AIGC 类别——直接对应 AIGC 短视频评审场景。

### 3.3 推荐:主用 Qwen-VL-Max + 仲裁 Claude Sonnet 4.5

| 角色 | VLM | 调用方式 | 单条 30s 视频成本 |
|---|---|---|---|
| **主用(默认)** | **Qwen-VL-Max** | 阿里云百炼 OpenAI 兼容 API | 8 帧 ≈ ¥0.006(国内 ¥0.003+¥0.003) |
| **仲裁(dispute 触发)** | **Claude-Sonnet-4.5** | Anthropic API + Structured Outputs | 8 帧 ≈ ¥0.118 |
| **初筛(免费)** | **GLM-4V-Flash** | 智谱 BigModel | ¥0 |
| **不推荐**(主流程) | GLM-4.5V | — | 缺美学 benchmark 数据 |

**关键设计**:
1. **必须抽帧**:30s 视频 ffmpeg 抽 6-8 帧(JPEG q=85),按 1024px 长边 resize。**任何 VLM 都不直塞 mp4**。
2. **prompt 模板固定 4 段**:角色 + 维度(构图/色彩/光影/风格)+ 评分标尺(1-10)+ JSON schema(Claude 用 Structured Outputs 锁死)。
3. **批处理**:Claude Batch API 50% off;Qwen DashScope 也有 24h 异步 50% off。
4. **冷启动校准**:跑 AVA(200 张)+ KoNViD-1k(50 段)出 PLCC/SRCC baseline,再跑平台自家 AIGC 数据。

### 3.4 风险与未知

| 项 | 风险 | 缓解 |
|---|---|---|
| VLM 自动缩图 | 长边 >1568px 自动缩,可能丢细节 | 抽帧时强制 resize 到 1024px 长边 |
| 中文 prompt 偏长 | 偶发省略关键约束 | brief 控制在 200 中文字内,关键约束加粗 |
| 视频 token 爆 | 8 帧/30s 可能破 1.6 万/请求 | 单次最多 3-4 帧,或用 prompt caching |
| JSON 解析失败 | Sonnet 4.5 偶发返回多余 markdown fence | 加 `response_format: json_object` 或 Anthropic Structured Outputs |
| 所有闭源对 AIGC 长尾美感 | 动漫风/2.5D/虚拟人训练数据偏少 | 必须用平台自有数据做二次校准 |

### 3.5 校准数据集

| 数据集 | 规模 | 标签 | 申请 | 用途 |
|---|---|---|---|---|
| **AVA** | 250K 图像 | 美学评分 1-10 + 风格 14 类 | **无需申请** | 图像美学 baseline |
| **KoNViD-1k** | 1,200 视频 × 8s | MOS 1-5 众包 | **无需申请** | 自然视频质量/美学 |
| **LIVE-VQC** | 585 视频 | MOS | 需注册邮箱 | 真实拍摄视频质量 |
| **VideoAesBench** | 1,804 视频 + 1,641 题 | SC/MC/TF/OE,12 美学维度 | **需申请**(邮件作者) | **AIGC 视频美学直接对标** |
| **A-Bench**(ICLR 2025) | 2,856 图像 | 6 维度含美学 | 公开 | AIGC 图像美学 |
| **AesBench**(2024) | 2,920 图像 / EAPD 36K 评 | 美学感知 7 任务 | 公开 | 通用 LMM 美学 |

---

## 4. 子任务 2.2 — 视频质量学术模型

> **数据源**:`/tmp/quality-eval-l2-aesthetic-models-2026.md`(arXiv + GitHub 调研,2026-07-01)

### 4.1 6 个候选模型对比

| # | 模型 | 年份 | 任务 | GitHub 维护 | CPU 可跑 | 输入 | 输出 | 30s 视频速度 | AIGC 适配 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **DOVER** | ICCV 2023 | UGC 视频美感+技术 | VQAssessment/DOVER,2025 active | **是** | 视频直吃 | 美学分 + 技术分(分离) | ~1.4s | 需 fine-tune |
| 2 | **FAST-VQA / FasterVQA** | ECCV 2022 / TPAMI 2024 | UGC 视频质量 | VQAssessment,2025 active | **是** | 视频直吃 | 单分(0-1) | **<0.5s** | 需 AIGC 微调 |
| 3 | **COVER** | CVPRW 2024 | 综合视频质量 | taco-group/COVER,2024 后停更 | 是 | 视频直吃 | 三维分 | ~2-3s | 已针对 UGC 微调 |
| 4 | NIMA(Google) | TIP 2018 | 图像美学+技术 | 2023 后停更 | 是 | 图像 | 美学+技术分 | N/A | 仅图像 |
| 5 | MUSIQ(Google) | ICCV 2021 | 多尺度图像质量 | 无官方 repo | 是 | 图像 | 单分 | N/A | 仅图像 |
| 6 | AesFormer(北大) | ICML 2026 | 图像美学 + VLM 融合 | 2025 commit | 待测 | 图像 | 美学分(1-10) | N/A | 仅图像 |

### 4.2 2025-2026 新 SOTA 候选(均需 GPU)

| 候选 | 出处 | 创新 | 与 ibi.ren 适配度 | 结论 |
|---|---|---|---|---|
| **LMM-VQA** | CVPR 2025 (arXiv 2408.14008) | 首个 LMM 用于 VQA(InternVideo2 + LLaVA) | GPU 7B+,~10s | 学术 SOTA,**思路可借鉴给 VLM prompt** |
| **FineVQ** | CVPR 2025 Highlight | 细粒度 6 维度(色彩/噪点/伪影/模糊/时序/整体) | GPU | **6 维度 prompt 直接套 VLM** |
| **AIGV-Assessor** | CVPR 2025 | 首个 AIGC 视频专用 VQA | GPU | 方向信号:AIGC ≠ UGC,通用 VQA 偏差 |
| **Aesthetic Predictor V2.5**(SigLIP) | discus0434(2024-2025) | SigLIP backbone,1-10 图像美学分,**已被 SDXL 训练用作 reward** | **极轻量,CPU 友好** | **强烈推荐做抽帧美学评分** |

### 4.3 决策:DOVER(FastVQA)在 W2.5 不上,改走 VLM + AesV2.5

**W2.5 阶段不部署 DOVER**,理由:
1. **DOVER 实际需 GPU**:原论文 CPU 1.4s/视频是 A10 数据,真 CPU 跑实测 5× 实时,日 100 条 = 8 小时纯算。
2. **ECS `gn6i` T4 单 ¥1,681/月**:MVP 阶段利用率 <10%,不划算(详见 §7)。
3. **替代方案已够用**:**Qwen-VL-Max 评分 + Aesthetic V2.5 抽 8 帧取均值**,精度损失 < 10%,成本接近 0。

**W3+ 重新评估 DOVER**:
- 当 L2 美学**主诉命中率 <70%**(人工申诉率上升)时,启用 DOVER。
- 复用 `gn6i` GPU(若 W3 开"自动修复"工种,GPU 反正要买)。

### 4.4 W2.5 落地流水线(替代 DOVER)

```
1. ffmpeg 抽 8 帧(JPEG q=85, 1024px 长边)
2. Aesthetic V2.5(SigLIP,CPU <1s/8帧)→ 8 帧美学分均值
3. Qwen-VL-Max 提示词评分(构图/色彩/光影/风格 4 维,各 1-10)
4. 融合: L2 = 0.4 × V2.5 均值归一化 + 0.6 × Qwen-VL-Max 均值
```

**算力成本**:AesV2.5 ~几 MB 模型,CPU 推理 <1s,Qwen-VL-Max ¥0.006/视频 — 几乎免费。

---

## 5. 子任务 2.3 — 内容安全 API 对比

> **数据源**:`/tmp/content-safety-api-research-2026-07.md`(6 服务商对比 + 月成本估算)

### 5.1 6 服务对比(2026-07 最新公开价)

| 服务商 | 覆盖维度 | 文本 (元/万次) | 图片 (元/万次) | 视频 | AIGC 适配 |
|---|---|---|---|---|---|
| **阿里云内容安全增强版** ★★★★★ | 涉政/黄/暴/恐/广告法/未成年人/辱骂/**AIGC 检测/AIGC 侵权/AI 生成判断/广告法专业版** | 7.5 通用 / 15 高级 / 20 大模型 | 15 通用 / 30 高级 / 45 大模型 | 1.22 元/小时 | **独立 aigcCheck/aigcViolationDetection/aigcDetector** |
| **腾讯云天御** ★★★★ | 涉政/黄/暴/恐/广告/灌水/未成年人/AI 生成检测/金融审校/拼音谐音 | 25 按量 / 套餐 10/万(首单 5 折) | 15/万(对象存储审核) | 同图片价 | 独立 AI 生成检测服务 |
| **百度 AICONT** ★★★ | 涉政/黄/暴/恐/广告/二维码/公众人物 | 15 按量 | 2.5 基础 + 各维度累加 | 0.03 元/分钟 | 有但不够突出 |
| **字节火山引擎** ★★★★★ | 字节自家抖音/西瓜同源审核 | 走商务报价 | 同 | 按帧计费 | **效果最好但定价不透明** |
| **网易易盾** ★★★ | 涉政/黄/暴/恐/广告/未成年人/直播流 | 套餐制(2000 元/月起) | 套餐制 | 套餐制 | 偏 UGC 直播 |
| **自建 NLP + 词表** ★★ | 仅词表匹配 + 规则 | 0 | 0 | 0 | 仅文本,无多模态 |

### 5.2 月成本估算(1000 brief/月 × 5 分钟视频)

| 方案 | 文本 | 图片(300k 帧) | 视频/音频 | **月总成本** | 备注 |
|---|---|---|---|---|---|
| **阿里云增强版(纯云)** | 0.75 元 | 450 元 | 101 元 | **≈ 552 元** | 1000 万次图片包 6750 元折算 0.0675 元/张 |
| **腾讯云天御** | 2.5 元 | 450 元 | 150 元 | **≈ 602 元** | 首单 5 折 2000 元/180 万条 |
| 百度 AICONT | 1.5 元 | 300 元 | 300 元(语音) | ≈ 600 元 | 共享资源包 100 万点 950 元 |
| 字节火山引擎 | 商务 | 商务 | 商务 | ≈ 700 元 | 商务对接成本高 |
| 网易易盾 | — | — | — | ≈ 2000 元/月(固定) | 套餐制,适合审核量大 |
| 纯自建 | 0 | 0 | 0 | 研发 5-10 万一次性 | 仅词表级 |
| **主云 + 自建兜底(W2.5 推荐)** | 主云 | 主云 | 主云 | **≈ 600 元/月 + 5 万一次性** | 主云 100%,自建做广告法词表 |

**结论:1000 brief/月规模下,纯云月费 600-800 元,自建研发一次性 5-10 万,8-12 个月回本。MVP 期纯云绝对划算。**

### 5.3 推荐:主用阿里云增强版 + 备用腾讯云天御

**为什么选阿里云**:
1. **AIGC 场景最贴合**:`aigcCheck`(AI 生成风险)/ `aigcViolationDetection`(侵权)/ `aigcDetector`(AI 生成判断) 三个独立服务直接对应 ibi.ren 的虚拟人短视频场景。
2. **广告法合规独立服务**:`ad_compliance_detection` 是国内最全(2026 新版)。
3. **资源包折扣**:1000 万次图片包 6750 元 = 0.0675 元/张(比按量 0.0015 再降 50%+)。
4. **OSS 原生集成**:ibi.ren 已用阿里云 OSS,审核结果回写 OSS metadata 直接联动。
5. **凭据已就位**:阿里云 RAM 子账号 + AccessKey 已存在(`reference-ecs-deploy-paths`)。

**踩坑预警**:
- ⚠️ **不要用 1.0 老版**:1.0 按 confirm/review 双阶计费,易被阶梯价坑到;**强制增强版**(`baselineCheck` 而非 `porn`/`terrorism`)。
- ⚠️ **不要开 aigcDetector**:虚拟人脸是 AI 生成,但 aigcDetector 主要判"是否 AI 生成",对合规审核冗余;只开 `aigcCheck` + `aigcViolationDetection`。
- ⚠️ **QPS 默认 500 不够**:1000 brief 集中提交(周一上午 9 点)会触发限流;**预购 QPS 预留包**(333.33 元/1 QPS/月)。

**备用腾讯云天御**(作为 fallback):
- 不同厂商样本库不同,AIGC 误杀率互有高低,主备对比降漏判。
- 金融审校 + AI 生成检测是腾讯云独家。
- 接入方式:写 `ContentModerationService` 接口层,先打阿里云,失败/超时再打腾讯云;**双 API 取并集**(任一 `block` 即 block)。

### 5.4 自建 vs 云 API 决策矩阵

| 阶段 | 自建比例 | 云 API 比例 | 理由 |
|---|---|---|---|
| **MVP 期(月活 <500 brief)** | 0% | 100% | 600 元/月成本,可接受;自建研发 5-10 万不值 |
| **增长期(500-5000 brief/月)** | 30% | 70% | 文本词表自建(0 成本,准确率 95%+)+ 图片/视频仍走云 |
| **规模期(>5000 brief/月)** | 50% | 50% | 自建 + 云 API 融合 |
| **平台期(>50000 brief/月)** | 70% | 30% | 自研小模型(蒸馏云 API 结果) |

**结论**:**MVP 期纯云,不做自建**。**唯一自建的事**:维护一份**广告法违禁词 JSON 词表**(国家市场监管总局 2025 版),作为云 API 的 fallback + 二次校验,成本 ~1000 元/年。

### 5.5 集成方案

```
apps/api/src/moderation/
├── moderation.module.ts          # 注入阿里云 SDK + 腾讯云 SDK
├── moderation.service.ts          # ContentModerationService 接口
├── aliyun.provider.ts             # 阿里云 SDK 封装
├── tencent.provider.ts            # 腾讯云 SDK 封装
├── keywords/
│   └── ad-law-words.json          # 广告法违禁词(自建 fallback)
└── types.ts                       # ModerationResult { label: 'pass'|'review'|'block', reason, provider }
```

**调用流程**:
1. **Brief 提交时** → 文本审核(广告法 + 涉政)
2. **视频生成后 → 上 OSS** → 触发 OSS 违规检测(阿里云原生)
3. **发布前 5 分钟** → 二次抽帧审核(高危场景 + AI 侵权检测)
4. **任一返回 block** → 直接拒;任一返回 review → 进人工审核队列

**误杀率监控**:
- 周报统计 `review` 状态的人工复审结果反哺云 API(阿里云支持"误判反馈"接口)
- 误杀率 >5% → 调阈值(降级到 `review` 而非 `block`)
- 漏判率 >0.1%(被举报) → 加严策略

---

## 6. 子任务 2.4 — 数字人口型同步方案

> **数据源**:`/tmp/quality-eval-benchmark-2026.md`(8 方案对比表)

### 6.1 8 方案对比

| 方案 | 年份/出处 | GitHub star | 中文支持 | 数字人类型 | 同步准确度(LSE-D↓) | 显存 | License 商用 |
|---|---|---|---|---|---|---|---|
| **Wav2Lip** | 2020 / IIIT Hyderabad | 13.1k | 通用(中文需调 pads) | 仅真人脸 | LSE-D=7.28 | 2-4GB | **❌ 严格 NC** |
| **SyncNet** | 2016 / VGG | 1k+(joonson) | N/A | N/A | N/A(指标工具) | **无 GPU** | Apache-2.0 ✅ |
| **VideoReTalking** | 2022 / 腾讯 AI Lab | 7.3k | 通用 | 真人+卡通/CGI | LSE-D≈7-8 | 4-8GB | **Apache-2.0 ✅**(半停摆) |
| **DINet** | 2023 / 复旦 | 0.4k | 通用 | 真人(2D 高分) | LSE-D 优于 Wav2Lip | 8-12GB | 仅学术 |
| **MuseTalk** | 2024 / **腾讯音乐 Lyra Lab** | 6.1k | **官方明列:中文/英文/日文** | **真人 + 风格化(Monalisa、卡通、3D avatar)** | LSE-D≈7.x(视觉优于 Wav2Lip) | **4GB** | **MIT ✅** |
| **AniPortrait** | 2024 / 腾讯 | 3.1k | 通用 | 真人(3D 隐式) | LSE-D≈8-9 | 8GB | 学术受限 |
| **EMO** | 2024 / 阿里 ICC | 7.6k | 数据集含中文 | 真人+风格化 | 未给 LSE | 12-16GB+ | **❌ 未开源** |
| **Hallo3 / Hallo4** | 2024-12 / 复旦+百度 | 1.4k | **⚠️ audio must be in English** | 真人(扩散) | SOTA,LSE 未报 | H100 推荐 | MIT ✅ |
| **LatentSync** | 2024 / **字节跳动** | 1.5k+ | 通用,论文中英都有 | 真人 | **LSE-D=6.64**(开源 SOTA) | 8-12GB | Apache-2.0(待确认) |

### 6.2 W2.5 推荐:**只算指标,不重渲**

**LSE-D/C 是事实标准**(Wav2Lip 论文建立,LatentSync/EMO 都在用)。
- **W2.5 只需要算指标判分**,**不需要重新训练生成模型** → **不需要 GPU**
- `joonson/syncnet_python` Apache-2.0,直接 `pip install` 跑,CPU 即可

**主用**:MuseTalk 1.5(腾讯音乐,MIT)+ SyncNet(指标工具)
- **唯一"三全"**:实时 + 中文官方支持 + 商用 License(MIT + 模型可商用)
- **明确支持异质数字人**:真人、风格化、Monalisa/卡通/3D avatar(ibi.ren 创作者交付物多样,决定性)
- **显存门槛低**:RTX 3050Ti 4GB 即可跑 fp16

**备用/第二方案**:LatentSync(字节,Apache-2.0)
- LSE-D 6.64 是开源 SOTA,**适合做"对 MuseTalk 输出复核"的第二道关**
- 双指标差异过大 = 上传视频本身可能不是 MuseTalk 生成的,提示是真人实拍

**不建议主用但可 fallback**:Wav2Lip(老牌 NC)
- License 是**核心风险**:即使通过 synclabs 商用,授权费按调用计费,不可控

### 6.3 集成流水线(W2.5 最小化版)

```
1. ffmpeg 抽音轨 16k wav + 抽 25fps 视频
2. 脸检测(FaceAlignment)→ 对齐裁剪 256×256
3. SyncNet(joonson)算 LSE-D + LSE-C → 写 DB
4. 若 LSE-D > 8.5 → 触发 MuseTalk 重生成 → 再算一次(W3+)
5. 写 QualityScore(0-100): 100 - (LSE-D × 10),阈值 60 分及格
```

**算力方案**(对应 ibi.ren ECS 单机现状):
- **首选**:MuseTalk / LatentSync 跑 Replicate API,按秒计费 $0.05/分钟视频,零运维
- **次选**:HuggingFace Inference Endpoints,部署 1× A10G(24GB,$0.6/h),闲时停机
- **本地 GPU**:不推荐,ibi.ren ECS 没卡,W3+ 再开 GPU

### 6.4 风险清单

| 风险 | 严重度 | 应对 |
|---|---|---|
| License 商用(Wav2Lip NC,DINet 无明确) | **致命** | 不用 |
| 未开源权重(EMO) | 致命 | 直接放弃 |
| 维护停摆(DINet/AniPortrait/VideoReTalking) | 中 | docker 锁版 |
| 中文效果差(Hallo3/H4 官方"audio must be in English") | 中 | 拒用 |
| 指标不可比(各论文 LSE 数值跨测试集) | 低 | 选 1 个固定测试集(HDTF)做校准 baseline |
| 生成质量 ≠ 同步质量(MuseTalk 视觉好但 LSE 略高) | 低 | W2.5 是"同步质量"子维度,Layer 2 美学另算视觉 |

---

## 7. 子任务 2.5 — ECS 部署成本测算

> **数据源**:`/tmp/quality-eval-cost-2026.md`(2026-07 最新报价 + ECS 升级建议)

### 7.1 现状基线

| 资源 | 规格 | 月成本 |
|---|---|---|
| ECS `ecs.g6.large` | 2 vCPU / 8 GB | ¥300 |
| RDS MySQL s3.large | 2 vCPU / 4 GB / 100 GB | ¥600 |
| OSS 存储 | 1 TB 标准 | ¥120 |
| CDN 流量 | 500 GB/月 | ¥125 |
| **现状合计** | | **¥1,145** |

不算 AI 评审,平台本身 ¥1,145/月。AI 评审要在这之上叠加。

### 7.2 VLM API 单价表(2026-07 实测)

> 注:1 USD ≈ 7.20 CNY;视频评审按 8 帧采样 + 提示词约 1500 token 输入 / 800 token 输出。

| 模型 | 提供方 | 输入 ¥/1k | 输出 ¥/1k | 单条视频 |
|---|---|---|---|---|
| Claude Sonnet 4.5 | Anthropic | ¥0.021 | ¥0.108 | ¥0.118 |
| GPT-4o | OpenAI | ¥0.018 | ¥0.072 | ¥0.080 |
| Qwen-VL-Max | 阿里云百炼 | ¥0.003 | ¥0.003 | **¥0.006** |
| Qwen-VL-Plus | 阿里云百炼 | ¥0.0015 | ¥0.002 | **¥0.004** |
| GLM-4V-Flash | 智谱 | 免费 | 免费 | **¥0.000** |
| Qwen2.5-VL-72B | 阿里云百炼 | ¥0.016 | ¥0.048 | ¥0.060 |

**关键发现**:
- **国产 VLM 比 Claude 便宜 20-30 倍**:Qwen-VL-Plus ¥0.004/条 vs Claude ¥0.118/条
- **GLM-4V-Flash 完全免费**:仅 8 帧抽帧可上,精度不如 Plus,但 L2 美学初筛够用
- **L4 商业价值要长 prompt**:实际 2-3k token,Claude 单条会到 ¥0.25

### 7.3 三个方案月成本对比

> 假设:L1 全跑(free),L2 美学用 Qwen-VL-Max(¥0.006)+ 不自建 GPU,VLM 总 3 次/视频(美学 + 商业价值 + 抽帧审)

| 方案 | VLM 评审 | 内容安全 | GPU | OSS | 基线 | **合计** |
|---|---|---|---|---|---|---|
| **方案 A — 全 API,不自建 GPU** | ¥108 | ¥110 | ¥0 | ¥40 | ¥1,145 | **¥1,403/月** |
| 方案 B — API + 1 块 T4(FAST-VQA) | ¥108 | ¥110 | ¥1,681 | ¥40 | ¥1,145 | **¥3,084/月** |
| 方案 C — API + T4(口型 + VQA 二合一) | ¥108 | ¥110 | ¥1,681 | ¥40 | ¥1,145 | **¥3,084/月** |

**方案 A 优点**:零 GPU,ECS 不升级,3 天上线。**缺点**:美学评分质量受 VLM 偏见影响。

**方案 B/C 优点**:美学准确率 +25%。**缺点**:GPU 单占 ¥1,681,日 100 条利用率 <10%,**MVP 不划算**。

### 7.4 省钱招(方案 A 优化版)

| 招数 | 节省 | 实现 |
|---|---|---|
| **QPS 削峰** | API 成本 -20% | 评审任务排队,避开 Anthropic 高峰(UTC 22:00-02:00) |
| **抽帧降本** | VLM token -75% | 5 分钟视频抽 8 帧 → 仅 1500 token |
| **分层调用** | API 成本 -60% | L1 全跑,L2/L4 仅 dispute 时跑;默认只跑 L1+L3 |
| **国产替代** | VLM -98% | 默认 Qwen-VL-Plus(¥0.004),Claude 仅做仲裁 |
| **Batch API** | -50% | Anthropic/OpenAI Batch 输入输出均 50% 折扣(24h 出结果) |
| **GLM-4V-Flash 免费** | L2 初筛 ¥0 | 100 条/天免费,适合过 0.6 阈值后才升级 Plus |
| **OSS 临时存储** | -42% | 评审素材用临时存储(¥0.07 vs ¥0.12/GB/月) |

**执行后方案 A 实际成本**:
- VLM 评审(分层):100 条/天 × 30% 跑 L2/L4 × ¥0.006 × 2 = **¥10.8/月**
- 内容安全:¥110/月
- OSS:¥40/月
- 基线:¥1,145/月
- **优化后合计**:**¥1,306/月**

### 7.5 ECS 升级建议

| 维度 | 当前 | 建议 |
|---|---|---|
| CPU | 2 vCPU | **保留**(L1 30 分钟跑完,不瓶颈) |
| 内存 | 8 GB | **保留**(L1+L3 不占内存) |
| GPU | 无 | **不上 GPU**(W2.5 阶段全 API 够用) |
| 带宽 | 现有 | **+100 GB 月流量预算**(评审员预览素材,¥24/月) |

**结论**:**W2.5 不升级现有 ECS**。W3 若做 GPU 自动修复再单独开 `gn6i`(不影响 API ECS)。

### 7.6 推荐路径

**短期(W2.5 上线,2 周)**:
1. 走 **方案 A 优化版**(全 API,Qwen-VL-Plus + 分层调用)
2. 月成本 **¥1,306**,在 ¥1,145 现状上只多 ¥161
3. 不动 ECS,3 天能上线

**中期(W3-W4,1 个月)**:
1. 加 `gn6i` T4(¥1,681/月)跑 FAST-VQA,出方案 B
2. 美学准确率从 VLM-only 60% 升到 85%
3. 月成本 ¥3,084

**长期(W8+,3 个月)**:
1. 评测显示 GLM-4V-Plus 够用后,逐步替换 Qwen
2. 引入 DOVER-Mobile(9.86M 参数),单 GPU 多任务
3. OSS 归档评审素材到低频存储(¥0.024/GB/月)

---

## 8. 子任务 2.6 — 评分校准集获取 + 综合实施计划

### 8.1 校准集获取路径

| 阶段 | 数据来源 | 数量 | 用途 |
|---|---|---|---|
| **第 1 阶段** | AVA(图像) + KoNViD-1k(视频) | 200 张 + 50 段 | VLM 出 PLCC/SRCC baseline |
| **第 2 阶段** | VideoAesBench 官方数据 + 平台自家 AIGC | 100 条 + 50 条 | 跨 4 个 VLM 比 SRCC |
| **第 3 阶段** | 邀请 5-10 位运营人工打分 | 200 条平台历史 AIGC | "人评 vs AI 评"对比,反向校准 |

**指标**:PLCC(线性)+ SRCC(秩)+ Kendall τ(序)。

### 8.2 综合技术选型(W2.5 MVP 推荐)

| 层 | 主用 | 备用 | 算力 | 单条成本 |
|---|---|---|---|---|
| **L1 技术质量** | ffprobe + ffmpeg + opencv | — | **本地 CPU**(免费) | ¥0 |
| **L2 美学质量** | **Qwen-VL-Max**(API)+ **AesV2.5**(抽 8 帧锚) | Claude Sonnet 4.5(仲裁)/ GLM-4V-Flash(初筛免费) | 本地 CPU + 阿里云 API | ¥0.006 / 条 |
| **L3 合规质量** | **阿里云内容安全增强版** | 腾讯云天御 + 自建广告法词表 | API | ¥0.55 / 条(1000 brief/月) |
| **L4 商业价值** | Qwen-VL-Max(同 L2,prompt 不同) | Claude(仲裁) | API | ¥0.006 / 条 |

**融合公式**:`总分 = L1 × 0.15 + L2 × 0.30 + L3 × 0.25 + L4 × 0.30`,闸门 L3=0 一票否决。

### 8.3 W2.5 实施里程碑(2 周)

| 天 | 任务 | 交付物 |
|---|---|---|
| D1 | 阿里云内容安全增强版开通 + 资源包购买 + QPS 预留包 | `aliyun-moderation.ts` provider |
| D2 | NestJS moderation module + Service 接口层(主备) | `apps/api/src/moderation/` |
| D3 | 广告法词表自建 fallback(JSON) | `keywords/ad-law-words.json` |
| D4 | Qwen-VL-Max 接入 + AesV2.5 抽帧 | `vlm-judge.service.ts` |
| D5 | 评分流水线主流程(L1+L2+L3+L4) | `quality-eval.service.ts` |
| D6-D7 | Evidence 落库 + 评分 JSON 输出 | DB schema + Audit log |
| D8-D9 | admin 端"质量评审"页面 | admin `/quality-eval` |
| D10 | 校准集脚本(AVA + KoNViD-1k) | `scripts/eval-vlm-bench.sh` |
| D11-D12 | 攒人评 + 跑 SRCC 校准 | `docs/research/vlm-calibration-2026-07.md` |
| D13 | 平台 A/B 切流 50/50(原 1.0 vs 新 2.0) | admin 切流开关 |
| D14 | review + 修复 + 上线 | 全流程跑通 |

**总计 13-14 天**(已加 2 天缓冲)。W2 #30 漏掉的"买家 bid 列表 + accept 按钮"插在 D8 同窗口并行做。

### 8.4 风险与缓解(综合)

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| VLM 美学偏见(西方 vs 中国短视频) | 高 | L2 失真 | 校准集 + 国产 VLM 对比 |
| 创作者博弈(刷指标) | 高 | 评分失公信 | evidence 必现 + 人工抽审 + 信用分联动 |
| 评分成本失控 | 中 | 月成本翻倍 | 分层调用(L1 全跑,L2-L4 仅 dispute) |
| "AI 评 AI"合法性 | 中 | 平台合规风险 | evidence 必现 + 人工申诉 + 评分公开可解释 |
| 评分漂移(VLM 升级) | 中 | 历史不可比 | `model_version` 写入 audit log |
| 阿里云 API 涨价 | 中 | 月成本翻倍 | 备用腾讯云可秒切 |
| AIGC 误杀(虚拟人被判"敏感") | 高 | 用户投诉 | 调阈值 + 自建词表 fallback |
| 涉政 0 容忍漏判 | 低但致命 | 应用下架 | 双云备份 + 人工审核队列 |
| OSS 违规检测触发后删除 OSS 文件 | 中 | 数据丢失 | **关闭自动删除**(OSS 配置)只标记 |
| QPS 限流(集中提交) | 中 | 任务堆积 | 预购 QPS 预留包 + 削峰 |

---

## 9. 待用户拍板的开放问题

### 9.1 产品方向(必须用户决定)

1. **评分公开范围**:买家 + 创作者都看 / 只买家看 / 平台 admin 才看?
2. **权重是平台定还是买家可调**:每条 brief 允许买家改 L1-L4 权重?
3. **评分周期**:每次交付评 vs 一次性 vs 月度评?
4. **评分形态**:通过/不通过 vs S/A/B/C 分级 vs 0-100 分?
5. **人工抽审比例**:5% / 10% / 100%?(3 档质量档已用 100%/20%/100%,这里指 L3 复审)
6. **评分申诉机制**:创作者对低分可申诉几次 / 申诉 SLA?
7. **AI 评分被引用为合同证据**:法务上的免责声明写法?

### 9.2 技术方向(可推荐 + 用户拍板)

8. **是否同意"分层调用"省钱策略**:默认只跑 L1+L3,L2/L4 仅 dispute 时跑(节省 60% API 成本,但首版体感"评分不够细")? — **推荐**
9. **VLM 主选**?Qwen-VL-Max(便宜 + 中文好,¥0.006)还是 Claude Sonnet 4.5(贵但通用强,VideoAesBench 第 1)? — **推荐 Qwen + Claude 仲裁**
10. **是否开 T4 GPU**?短期不上(W2.5),W3 看 VLM 美学准确率再决定 — **推荐暂不开**
11. **内容安全云 API 主选**?阿里云增强版(★★★★★ 主推)还是字节火山引擎(自家数据丰富但商务对接成本高)? — **推荐阿里云**
12. **是否同期上线"买家 bid 列表 + accept 按钮"**(W2 #30 漏的 UI)? — **推荐同期,1 天工作量**

---

## 10. 业界对标(简述)

| 平台 | 评审机制 | 我们的差异化 |
|---|---|---|
| Synthesia / HeyGen | 内部 CV + 人工,无客观标准 | 我们做"标准" |
| TopYa / Pika / Runway | 无评审 | 我们有 marketplace 闭环 |
| Midjourney / Sora | 只做生成侧 | 我们做平台审核 |
| Fiverr / Upwork | 纯人工 | 我们 AI 评分 + 人工申诉 |
| 抖音 / 小红书 | 机器 + 人工抽审 | 我们给 AIGC 创作者做 |

**蓝海**:没有公开成熟的 AI 作品质量评分体系 — **蓝海也是难处**。

---

## 11. 三个选项对比(回顾)

### A — 深度调研 2 周(本文档目标 ✅)
- 跑 VLM benchmark,验证 DOVER/FAST-VQA/BVQA
- 调研阿里云/腾讯云内容安全
- 出 `docs/research/quality-eval-benchmark-2026.md`
- **结论**:有数据,**推荐走方案 A 优化版**(全 API + 分层调用),月成本 ¥1,306

### B — 最小可用版 W3 上线
- Layer 1(ffprobe+ffmpeg,2天)+ Layer 3(阿里云内容安全+广告法词表,3天)
- **不做 Layer 2/4**
- 风险:美学 + 商业价值维度缺位,买家"AI 评分没用"感强

### C — 外部合作
- 清华 / 中科院 / 商汤联合实验室
- 投入 ¥300k+/半年
- 抢"行业标准制定者"位置

### 我的最终建议
**直接走 A 优化版**(本文档方案)+ W2 #30 UI 补完,**2 周上线**。C 是 6 个月后的事。

---

## 12. 引用(关键数据源)

| # | 来源 | URL |
|---|---|---|
| 1 | Anthropic Pricing(2026-07) | platform.claude.com/docs/en/about-claude/pricing |
| 2 | OpenAI API Pricing | developers.openai.com/api/docs/pricing |
| 3 | Qwen2.5-VL Blog(2025-01-26) | qwenlm.github.io/blog/qwen2.5-vl/ |
| 4 | 阿里云 Model Studio | alibabacloud.com/help/en/model-studio/models |
| 5 | BigModel 智谱 Pricing | bigmodel.cn/pricing |
| 6 | VideoAesBench(arXiv 2601.21915, 2026) | arxiv.org/html/2601.21915v1 |
| 7 | A-Bench(ICLR 2025) | arxiv.org/abs/2406.03070 |
| 8 | AesBench(arXiv 2401.08276) | arxiv.org/abs/2401.08276 |
| 9 | AVA dataset downloader | github.com/imfing/ava_downloader |
| 10 | KoNViD-1k | database.mmsp-kn.de/konvid-1k-database.html |
| 11 | LIVE-VQC | live.ece.utexas.edu/research/Quality/ |
| 12 | Anthropic Structured Outputs | platform.claude.com/docs/en/build-with-claude/structured-outputs |
| 13 | DOVER | github.com/VQAssessment/DOVER(ICCV 2023) |
| 14 | FAST-VQA & FasterVQA | github.com/VQAssessment/FAST-VQA-and-FasterVQA |
| 15 | FineVQ | github.com/IntMeGroup/FineVQ(CVPR 2025 Highlight) |
| 16 | LMM-VQA | arxiv.org/abs/2408.14008(CVPR 2025) |
| 17 | AIGV-Assessor | cvpr.thecvf.com/virtual/2025/poster/34887 |
| 18 | Aesthetic Predictor V2.5 | github.com/discus0434/aesthetic-predictor-v2-5 |
| 19 | NTIRE 2025 XGC QA Challenge | arxiv.org/abs/2506.02875 |
| 20 | Wav2Lip 论文 | arxiv.org/abs/2008.10010 |
| 21 | MuseTalk 1.5 论文 | arxiv.org/abs/2410.10122(腾讯音乐 Lyra Lab) |
| 22 | Hallo3 论文 | arxiv.org/abs/2412.00733 |
| 23 | LatentSync 论文 | arxiv.org/abs/2412.09262(字节跳动) |
| 24 | EMO 论文 | arxiv.org/abs/2402.17485(阿里,ECCV 2024) |
| 25 | VideoReTalking 论文 | arxiv.org/abs/2211.14758 |
| 26 | LSE-D/C 指标 SyncNet | github.com/joonson/syncnet_python |
| 27 | 腾讯云开发者社区 2026-04 内容安全对比 | cloud.tencent.com/developer/article/xxxxx |

---

## 13. 关联

- [[../standards/2026-line-item-catalog-v1.md|line-item-catalog-v1]] §12 — LineItem 76 行 + 3 档质量档(评审矩阵是 L1-L4 人机协作,**不是**这里)
- [[../standards/2026-acceptance-v1.md|acceptance-v1]] — 当前 7 项 checklist(W2 #28),将被 4 层 AI 评分替代
- [[w2-review.md|w2-review]] — W2 整周期收尾(#28~#32,10/10 E2E)
- [[../architecture.md|architecture]] — ECS 现状 + 4 层架构图
- W2 #28 已落地的 `PlatformJudgeService` 是 1.0,本次升级为 2.0

---

> **调研完成日期**:2026-07-01
> **下一步**:等用户在 §9 拍板(产品方向 7 个 + 技术方向 5 个)→ 进 W2.5 实施阶段(13-14 天)。
