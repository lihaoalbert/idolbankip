<script setup lang="ts">
/**
 * AI 自动评分免责声明 — 静态法律文本页
 * 关联: docs/research/quality-eval-benchmark-2026.md §9.6 (草案 v0.1)
 * 上线前必须经法务 review + 签字 (USER-ACTION-CHECKLIST.md #16)
 *
 * 由 3 处入口跳转:
 *   - 评分详情页 footer "AI 评分免责声明"
 *   - 创作者交付页评分卡 "查看 AI 评分依据"
 *   - 注册流程 / 创作者入驻流程的协议链接
 */
const lastUpdated = '2026-07-02';
const version = 'v0.1';

const sections = [
  {
    no: '一',
    title: '评分系统性质',
    items: [
      '本平台 AI 评分系统 (以下简称"评分系统") 基于多模态大语言模型 (Claude Sonnet 4.6 / MiniMax-M3 等) 与阿里云内容安全增强版 API, 对创作者交付物进行技术、美学、合规、商业价值 4 个维度的自动化评估, 评分结果仅供参考, 不构成质量保证或合同标的。',
      'AI 评分为平台的辅助决策机制之一, 不替代人工抽审与人工申诉复审结论。平台对 AI 评分系统输出的具体分数、S/A/B/C 分级、各项证据描述, 不承担与该等输出完全对应的法律责任。',
    ],
  },
  {
    no: '二',
    title: '评分系统的已知局限',
    items: [
      '对 AIGC 长尾美感 (动漫风 / 2.5D / 虚拟人 / 古风) 的判断可能存在偏见, 评分不必然反映中国短视频市场的真实审美。',
      '模型在中文 prompt 较长或含专业术语时偶发省略关键约束, 评分描述可能不够具体。',
      '长视频通过抽帧采样 (默认 8 帧) 后评分, 可能丢失部分动态细节。',
      '阿里云内容安全 API 对 AIGC 内容 (尤其是含虚拟人脸的素材) 可能误判为"敏感", 已建立误判申诉通道 (见 §三)。',
      '跨境 API 调用 (Anthropic) 受国内合规要求约束, 仅传输经 PII 脱敏的图像帧与文本, 部分场景可能因网络中断延迟评分。',
    ],
  },
  {
    no: '三',
    title: '创作者申诉权',
    items: [
      '创作者对评分结果有异议的, 可在评分公布后 48 小时内提交 1 次申诉。',
      '申诉由独立于初评的运营人员复审; 复审期间启用 Claude 重跑 (独立证据链)。',
      '复审结论为最终结论, 不再二次申诉。',
      '复审不影响创作者已获得的同月内全部评审记录, 仅对被申诉的该次评分生效。',
      '申诉不影响创作者既有的 SKU 准入结论 (S/A/B/C ↔ essential/standard/premium), 除非复审结论改变了 score (且改后 ≥ 0.85 = premium 等)。',
    ],
  },
  {
    no: '四',
    title: 'AI 评分不作为以下用途的唯一依据',
    items: [
      '司法 / 仲裁证据; 平台对评分证据的存证仅用于内部审计与争议复审, 不构成公证文书。',
      '投资决策依据; 平台买家不应仅凭 AI 评分做出投资 / 选品决策。',
      '保险理赔依据; 平台对评分争议不提供保险 / 担保类背书。',
    ],
  },
  {
    no: '五',
    title: '平台免责情形',
    items: [
      '因 AI 评分错误 (包括但不限于模型偏见、prompt 偏差、API 故障、人工标注偏差) 导致的创作损失, 平台不承担赔偿责任。',
      '因跨境 API (Anthropic 等) 中断导致的评分延迟, 平台不构成违约, 但承诺在 24h 内通过站内信通知创作者。',
      '因内容安全 API (阿里云增强版) 误判导致的临时下架, 平台承诺 48h 内完成人工复核, 通过后立即恢复上架; 期间产生的损失由平台按合同条款补偿。',
    ],
  },
  {
    no: '六',
    title: '其他',
    items: [
      '本免责声明随评分系统的版本演进同步更新, 重大变更将通过站内信 + 邮件通知创作者。',
      '本免责声明的解释权归 IBIren 平台所有; 如有争议, 按《IBIren 创作者入驻协议》争议解决条款执行。',
    ],
  },
];

const faq = [
  {
    q: '我可以拒绝 AI 评分吗?',
    a: '不可以。自 2026-07-15 起, 创作者交付物须经评分系统初次评分方可进入买家平台。但创作者可于 48h 内对任一评分提交 1 次申诉, 由独立运营人员复审。',
  },
  {
    q: 'AI 评分会导致我被下架吗?',
    a: 'AI 评分仅为参考分数, 不直接触发下架。平台下架权仅由人工或内容安全 API 触发, 且均提供申诉入口。',
  },
  {
    q: '评分材料会出境 (Anthropic API 调用) 吗?',
    a: '会, 但已经过 PII 脱敏 (手机号、邮箱、身份证、银行卡、声音样本已被替换为占位符), 且评分材料只包含缩略图 (最多 8 帧), 不含原始素材。详见 §五 与 docs/research/quality-eval-benchmark-2026.md §8.4。',
  },
  {
    q: '评分会公示给买家吗?',
    a: '会。S/A/B/C 分级与 evidence 简述对买家公开 (技术评分内部项不公开), 详见 §二·评分公开范围。',
  },
];
</script>

<template>
  <div class="legal-shell">
    <div class="legal-card">
      <header class="legal-head">
        <h1>AI 自动评分免责声明</h1>
        <div class="legal-meta">
          <span>版本 {{ version }}</span>
          <span class="dot">·</span>
          <span>最后更新 {{ lastUpdated }}</span>
        </div>
        <p class="legal-tag">
          草案 — 上线前必须经法务 review + 签字 (USER-ACTION-CHECKLIST.md #16)
        </p>
      </header>

      <section
        v-for="sec in sections"
        :key="sec.no"
        class="legal-section"
      >
        <h2>{{ sec.no }}. {{ sec.title }}</h2>
        <ol>
          <li v-for="(item, i) in sec.items" :key="i">{{ item }}</li>
        </ol>
      </section>

      <section class="legal-section">
        <h2>常见问题</h2>
        <div class="faq">
          <details v-for="(f, i) in faq" :key="i">
            <summary><strong>Q{{ i + 1 }}.</strong> {{ f.q }}</summary>
            <p>{{ f.a }}</p>
          </details>
        </div>
      </section>

      <section class="legal-section contact">
        <h2>联系方式</h2>
        <ul>
          <li>法务邮箱: <code>legal@ibi.ren</code> <span class="muted">(待开通)</span></li>
          <li>争议处理 SLA: 48 小时</li>
          <li>申诉提交入口: <code>POST /api/v1/quality-eval/:id/appeal</code></li>
        </ul>
      </section>

      <footer class="legal-foot">
        <p class="muted">
          本文档由 W2.5 调研产出 (关联
          <code>docs/research/quality-eval-benchmark-2026.md</code>)，由平台最终发布版本为准。
        </p>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.legal-shell {
  min-height: 100vh;
  padding: 48px 20px;
  background: #f6f7f9;
  display: flex;
  justify-content: center;
}
.legal-card {
  max-width: 820px;
  width: 100%;
  background: #fff;
  padding: 56px 64px;
  border-radius: 12px;
  box-shadow: 0 6px 28px rgba(15, 23, 42, 0.05);
  line-height: 1.75;
}
.legal-head {
  border-bottom: 1px solid #e6e8eb;
  padding-bottom: 24px;
  margin-bottom: 32px;
}
.legal-head h1 {
  margin: 0 0 12px;
  font-size: 28px;
  color: #1a1d24;
}
.legal-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #6b7280;
}
.legal-meta .dot { color: #c7cad0; }
.legal-tag {
  margin-top: 14px;
  padding: 6px 12px;
  background: #fff7e6;
  color: #b07000;
  border-radius: 6px;
  font-size: 13px;
  display: inline-block;
}
.legal-section {
  margin-bottom: 28px;
}
.legal-section h2 {
  font-size: 18px;
  margin: 0 0 12px;
  color: #1a1d24;
}
.legal-section ol {
  padding-left: 22px;
  margin: 0;
  color: #2d3138;
}
.legal-section li + li {
  margin-top: 8px;
}
.faq details {
  border: 1px solid #ecedf0;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 10px;
  background: #fafbfc;
}
.faq summary {
  cursor: pointer;
  font-size: 14px;
  color: #1a1d24;
}
.faq summary strong { color: #b07000; margin-right: 4px; }
.faq p { margin: 10px 0 0 16px; color: #4a4f57; font-size: 14px; }
.contact ul { padding-left: 18px; }
.contact code {
  background: #f0f1f3;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.muted { color: #9098a3; font-size: 13px; }
.legal-foot {
  margin-top: 32px;
  border-top: 1px solid #e6e8eb;
  padding-top: 16px;
}
@media (max-width: 640px) {
  .legal-card { padding: 28px 24px; }
  .legal-head h1 { font-size: 22px; }
}
</style>
