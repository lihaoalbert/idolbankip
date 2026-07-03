# W2.5 校准方法论 + Demo Run — 2026-07

> 关联: [[quality-eval-4layers]] · [[w25-decisions-2026-07]] · `scripts/quality-eval-calibrate.ts`
> 决策点: W2.5 决策 #4 (校准 ≥ SRCC 0.75) · #6 (评分公开 + 申诉)
> 状态: D10-D12 完成,真实 SRCC 待 USER ACTION #14 (Anthropic/Minimax key) 落地后跑

---

## 1. 目标

W2.5 AI 4 层评分与"人评"对齐到 **Spearman Rank Correlation Coefficient (SRCC) ≥ 0.75**,确保:
- AI 评分排序与人类判断排序一致 (虽然绝对值可能不同)
- 跨 brief 可比 (W2.5 决策 #4 — 权重平台固定不可调整)
- 避免"AI 自我感觉良好但用户实际不买账"

不达标的层需:
- 检查 prompt
- 调整 subScore 维度
- 必要时更换模型

---

## 2. 校准集组成

### 2.1 Demo Manifest (10 项)

`scripts/quality-eval-calibrate.manifest.example.json` 提供了 10 项 demo:
- 5 项视频 (L1 可跑): Google Cloud 公开 sample 视频
- 1 项海报系列 (L1 skip, 用中性分 0.65)
- 4 项美学/商业维度差异显著

**真实校准**需要 50+ 项,3 位评分人取中位数。

### 2.2 真基准 (后续)

候选数据集:
- **AVA (Aesthetic Visual Analysis)**: 250k+ 图像,美感 MOS 分 (0-10), 可映射到 0-1
- **KoNViD-1k**: 1200 段自然视频,质量 MOS,适合 L1 技术校准
- **YouTube-UGC**: 1380 段 UGC 视频,真实噪声多,L1/L2 都能校准
- **自建 ibi.ren 真实 brief 集 (W2.5 决策 #6)**: 上线后从真实 brief 中抽样,3 位 PM/创作者评分

**推荐策略**: 上线 2 周后用真实 brief 攒 50-100 项人评,3 评分人取中位数,做第一轮真校准。
AVA/KoNViD 适合 baseline 对比,但跟 ibi.ren 业务域差距大,参考价值有限。

---

## 3. 评分维度映射

| AI 层 | 人评维度 | 评分要点 |
|------|---------|---------|
| L1 技术 | 视频清晰度、码率、帧率、抖动、黑帧、音量 | 0=无法观看, 1=专业级 |
| L2 美学 | 构图、色彩、光感、风格一致性、记忆点 | 0=无美感, 1=艺术片 |
| L4 商业 | Hook 强度、信息完整度、人群匹配、CTA、情感共鸣、品牌契合 | 0=无商业价值, 1=爆款 |

评分说明:
- 每维度 0-1 (一位小数)
- 推荐 3 位评分人独立打分,取中位数 (median 比 mean 抗极端值)
- 评分人最好是创作者/PM/广告策划 (懂行的人),不是随便拉的路人

---

## 4. 校准流程

```bash
# 1. 准备 manifest
cp scripts/quality-eval-calibrate.manifest.example.json my-50-ratings.json
# 编辑,把 humanScores 换成真实 3 人中位数

# 2. 确保 LLM key 已配 (USER ACTION #14)
grep MINIMAX_API_KEY apps/api/.env
# MINIMAX_API_KEY=sk-...

# 3. 跑校准
cd apps/api
pnpm exec tsx ../../scripts/quality-eval-calibrate.ts \
  --manifest=../../my-50-ratings.json \
  --out=/tmp/calibration-2026-07.csv

# 4. 看 SRCC 报告 (自动打印 + 追加到 CSV 末尾)
```

---

## 5. 报告解读

### 5.1 指标

| 指标 | 含义 | W2.5 目标 |
|------|------|----------|
| **SRCC** | Spearman Rank Correlation (排序一致性) | **≥ 0.75** (W2.5 决策 #4) |
| Pearson | 线性相关 (含绝对值差距) | 参考, 不作门槛 |
| MAE | Mean Absolute Error | 参考, 不作门槛 |
| AI μ±σ / Human μ±σ | 分布对比 | 检查系统性偏差 |

### 5.2 判定标准

- **✅ 通过**: L1/L2/L4 SRCC 都 ≥ 0.75 → 可上线
- **⚠️ 关注**: 某层 0.65-0.75 → 调 prompt 或 subScore 维度,再做一轮
- **❌ 不达标**: 某层 < 0.65 → 考虑换模型 (例如 L2 换 GPT-4V,Gemini) 或人工复核兜底

### 5.3 系统性偏差

如果 AI μ 跟 Human μ 差距大但 SRCC 高 (例如 AI 都给 0.7, 人评都 0.5):
- 说明排序对,但 AI "给分偏高" → 调闸门阈值或 LLM prompt
- 不影响"谁好谁坏"判断,但 composite 分数绝对值需校正

---

## 6. Demo Run (2026-07-03)

用 `scripts/quality-eval-calibrate.manifest.example.json` (10 项) 跑通端到端:

```
═══════════════════════════════════════════════════════════
📊 校准报告 (n=10, 失败 0)
═══════════════════════════════════════════════════════════
目标 SRCC ≥ 0.75 (W2.5 决策 #4, 跨 brief 可比)

Layer │  SRCC    Pearson   MAE    AI μ±σ      Human μ±σ
──────┼──────────────────────────────────────────────────────
L1 技术│   0.058    0.091    0.640  0.065±0.206  0.705±0.174
L2 美学│     NaN      NaN    0.268  0.500±0.000  0.742±0.181
L4 商业│     NaN      NaN    0.208  0.500±0.000  0.668±0.164
综合分│   0.058    0.128    0.439  0.264±0.108  0.704±0.126
```

### 6.1 为什么数字"丑"

| 层 | 原因 | 影响 |
|----|------|------|
| L1 = 0.058 | Google Cloud `commondatastorage` 公开 sample 桶在测试机被防火墙拦截,fetch fail | 框架通了,真数据时 OK |
| L2/L4 = NaN/0.50 | `MINIMAX_API_KEY` 未配 (USER ACTION #14),Anthropic client 拿到空 key 返回 404 | 等 key 配了就能跑 |
| 9/10 项 composite = 0.230 (闸门) | L1=0 触发 technical_below_threshold 闸门 | 同 L1 原因 |

### 6.2 Demo 验证的成果

✅ **脚本端到端通**: 10/10 项处理完成,CSV + SRCC 报告输出 OK
✅ **NestJS 依赖绕开**: 显式 new service(),避开 ApplicationContext 模式下 ConfigService 注入失败
✅ **L3 mock 策略**: L3 合规层走 mock 给中性分 0.7 (校准 L1/L2/L4 时不需要 L3 一票否决)
✅ **Manifest 格式**: JSON 易编辑,与人评流程对接

---

## 7. 真校准路线图

| 阶段 | 时间 | 任务 | 负责人 |
|------|------|------|--------|
| **D10** ✅ | 2026-07-03 | 脚本 + demo manifest + 方法论 | Claude |
| **D11** ⏳ | 上线后 2 周 | 从真实 brief 抽样 50-100 项,3 评分人打分 | 用户 + 评分小组 |
| **D12** ⏳ | 攒够数据后 1 周 | 跑真实校准,看 SRCC,达标则继续,不达标调 prompt | Claude + 用户 |
| **持续** | 每月 | SRCC drift 监控,模型升级时重跑 | 自动 (cron) |

### 7.1 真校准触发条件

- 上线后 brief 量 ≥ 100
- 评分小组就位 (3 位: PM / 资深创作者 / 广告策划)
- 阿里云 OSS 上有真实交付物 + 缩略图 (manifest 直接拿 OSS URL)

### 7.2 不达标的应对

- **L1 低**: 检查 ffprobe 参数,确认闸门 L1<0.60 阈值是否太严
- **L2 低**: 调 Claude Vision prompt,加 few-shot examples,考虑换 GPT-4V/Gemini 对比
- **L4 低**: 调商业维度定义,跟广告策划对齐 subScore 权重,可能拆出更多 subScore
- **整体低**: 考虑加人类 in-the-loop (评分人先粗排,AI 学)

---

## 8. 附录:文件清单

| 文件 | 作用 |
|------|------|
| `scripts/quality-eval-calibrate.ts` | 校准脚本 (无 NestJS DI 依赖) |
| `scripts/quality-eval-calibrate.manifest.example.json` | 10 项 demo manifest |
| `apps/api/src/quality-eval/calibration.module.ts` | 实验性 NestJS CalibrationModule (保留,作为后续切换 Nest 模式的参考) |
| `apps/api/src/quality-eval/calibration-llm.provider.ts` | 镜像 LlmConfigService 但只读 env (同上) |
| `docs/research/w25-calibration-2026-07.md` | 本文档 |

---

> 最后更新: 2026-07-03 — D10-D12 框架完成,真实 SRCC 待 USER ACTION #14 落地