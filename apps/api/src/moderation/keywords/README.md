# 广告法违禁词目录

> **状态**:W2.5-D3 落地。**真实词表需购买**,本目录的 JSON 文件**不入仓**(见根 `.gitignore`)。

## 文件说明

| 文件 | 说明 | 入仓 |
|---|---|---|
| `ad-law-words.json` | 主词表(广告法 + 涉政 + 涉敏),AI 评审 L3 合规 fallback 用 | ❌ gitignored |
| `ad-law-words.example.json` | 字段结构示例(供 Claude 调试用) | ✅ 入仓 |

## 词表字段结构

```jsonc
{
  "_version": "2025-市场监管总局-v1",
  "_purchased": "2026-XX-XX",
  "_source": "国家市场监管总局 2025 版",
  "_license": "商业使用授权 (¥1,000/年)",
  "extreme_absolute": ["最佳", "最优", "第一", ...],   // 极限词
  "medical_guarantee": ["根治", "治愈", ...],         // 医疗保证
  "comparison_rank": ["最好", "销量冠军", ...],        // 比较级 + 排名
  "invest_return": ["稳赚", "无风险", ...],            // 投资承诺
  "minor_sensitive": [...],                            // 未成年人相关
  "politics_sensitive": [...],                         // 涉政(高敏感,词表更新要法务审核)
  "religion_sensitive": [...]                         // 涉宗教
}
```

## 关联

- `apps/api/src/moderation/moderation.service.ts` — `LocalKeywordFallback.scanText()` 加载本文件
- `docs/research/quality-eval-benchmark-2026.md` §5.4 自建 vs 云 API 决策矩阵
- `docs/USER-ACTION-CHECKLIST.md` #15 — 用户必做:购买 + 写入本目录