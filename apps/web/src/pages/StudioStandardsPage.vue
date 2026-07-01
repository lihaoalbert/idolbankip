<script setup lang="ts">
/**
 * /studio/standards — 平台标准公开页
 * #30.7.1 W2 #28
 * 平台公信力底层:3 份标准文档(brief package / acceptance / pricing & settlement)
 * 公开可访问,买/卖双边事前协商的"参考标准"
 */
const STANDARDS = [
  {
    code: 'STANDARD-BRIEF-PACKAGE-V1',
    title: '标准任务包 (Brief Package)',
    summary: '买家发包 = 平台标准任务包,含 7 项固定字段 + 自由描述',
    sections: [
      { name: '① 基本信息', body: '标题(≥5字) + 描述 + 品类(5 选 1)' },
      { name: '② 投放平台', body: '9 平台枚举(抖音/小红书/视频号/YouTube/TikTok/IG/X/LinkedIn/B站) — 多选' },
      { name: '③ 数字人 IP', body: '从买家已购 IP 选 1~N 个;必选,创作者用这些形象出镜' },
      { name: '④ 套餐', body: '从 15 SKU(5 品类 × 3 档)选 1;菜单价锁定' },
      { name: '⑤ 预算区间', body: '¥ 区间;菜单价 ±20% 内合理,过高/过低需说明' },
      { name: '⑥ 截止时间', body: '≥ 当前 + 1 天' },
      { name: '⑦ 验收标准', body: '挂 SKU 后自动绑定 7 项 checklist,带权重' },
    ],
    promise: '买家填 7 项,平台自动组装成标准任务包。',
  },
  {
    code: 'STANDARD-ACCEPTANCE-V1',
    title: '验收清单 (Acceptance)',
    summary: '7 项 checklist + 通过线 0.80,缺一项不可结案',
    sections: [
      { name: '内容完整性', body: '成片数量、平台覆盖、IP 出镜次数与 brief 一致' },
      { name: '时长 / 比例', body: '符合各平台时长要求(抖音 15-60s / 视频号 ≤ 60s / B 站 ≤ 5min)与比例(9:16 / 16:9 / 1:1)' },
      { name: '音画质量', body: '无明显水印/黑边/花屏;音轨清晰;字幕正确' },
      { name: 'IP 一致性', body: '数字人形象与选定 IP 匹配(脸/声/动作风格) — 平台 Agent 用 LLM 校验' },
      { name: '品牌调性', body: '视觉/语气符合买家描述(品牌调性、目标人群)' },
      { name: '合规', body: '无违规词/违规画面/未授权音乐;含 <数字人> 角标(广告合规指南 §3)' },
      { name: '可投性', body: '文件格式/分辨率/编码符合目标平台要求' },
    ],
    promise: '任一项 score=0,整单不通过。Agent 判定 ≠ 最终结论,争议由 admin /disputes 人工复核。',
  },
  {
    code: 'STANDARD-PRICING-SETTLEMENT-V1',
    title: '价格 & 清算 (Pricing & Settlement)',
    summary: '菜单价不可议 + 动态调价 3 道软护栏 + 清算分账透明',
    sections: [
      { name: '① 菜单价', body: '15 SKU 菜单价全国统一,不可议' },
      { name: '② 加项', body: 'ADD_PLATFORM +5% / ADD_IP +8% / RUSH_3D +25% / HIGH_COMPLEXITY +30% / EXTRA_VIDEO 按量 — 加价不超菜单价 50%' },
      { name: '③ 动态调价', body: 'bidding 阶段无人接单可加价;3 道软护栏(详见下)' },
      { name: '④ 清算分账', body: '验收通过后:创作者 70% / 平台 25% / IP 所有者 5%(独立 IP) — T+1 自动到账' },
      { name: '⑤ 退款', body: '未通过验收:全额退买家,平台 0 抽成;二次验收仍未过:50% 退买家,创作者承担工时' },
      { name: '⑥ 跳单罚', body: '见 用户协议 v2 §2.5 跳单条款 — 双边各扣 200 信用分 + 冻结账户 7 天' },
    ],
    promise: '3 道软护栏(动态调价):① 累计 ≤ 3 次 ② 加价后总价 > 2x 菜单价需"我知这是高溢价"二次确认 ③ 创作者端只看到当前价,看不到加价幅度。',
  },
];
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">
    <div class="max-w-5xl mx-auto px-6 py-10">
      <!-- HEADER -->
      <div class="border-b border-ink pb-6 mb-8">
        <div class="catalog-no mb-2">PLATFORM · STANDARDS · STUDIO</div>
        <h1 class="font-display text-4xl tracking-wide">平台标准</h1>
        <p class="text-sm text-ink/60 mt-2 max-w-2xl">
          平台公信力底层 = 标准制定者。3 份标准文档 — 买/卖双边事前协商的"参考标准",平台 Agent 按这些标准判定。
        </p>
      </div>

      <!-- 3 份标准 -->
      <article
        v-for="(s, idx) in STANDARDS"
        :key="s.code"
        class="plate paper-grain p-8 mb-8 border-0.5 border-line bg-surface"
      >
        <div class="flex items-start justify-between mb-3">
          <div>
            <div class="catalog-no text-stamp-red mb-1">{{ String(idx + 1).padStart(2, '0') }} · {{ s.code }}</div>
            <h2 class="font-display text-2xl">{{ s.title }}</h2>
          </div>
        </div>
        <p class="text-sm text-ink/80 mb-5 leading-relaxed">{{ s.summary }}</p>

        <div class="space-y-3 mb-5">
          <div
            v-for="sec in s.sections"
            :key="sec.name"
            class="border-l-2 border-gold pl-4 py-1"
          >
            <div class="text-xs font-medium text-stamp-red mb-0.5">{{ sec.name }}</div>
            <div class="text-sm text-ink/70">{{ sec.body }}</div>
          </div>
        </div>

        <div class="bg-cream border-0.5 border-gold p-3 text-xs text-ink/80 italic">
          ✦ 平台承诺:{{ s.promise }}
        </div>
      </article>

      <!-- 法律责任 -->
      <article class="plate paper-grain p-8 border-0.5 border-stamp-red bg-cream">
        <div class="catalog-no mb-2 text-stamp-red">LEGAL · 法律责任原则</div>
        <h2 class="font-display text-xl mb-3">平台 Agent 出错时的免责上限</h2>
        <ul class="text-sm text-ink/80 space-y-2 leading-relaxed">
          <li>• 平台 Agent 判定是"参考",终极争议由 admin /disputes 人工复核。</li>
          <li>• 平台 Agent 出错(误判 / 漏判)导致双边损失的,平台累计赔付上限 = 12 个月服务费。</li>
          <li>• 买/卖双边 Agent 是用户本地工具,行为视同用户行为,法律责任在用户(人)。</li>
          <li>• 完整条款见 <RouterLink to="/legal" class="text-stamp-red underline">用户协议 v2</RouterLink> §2.5 与 §10.x。</li>
        </ul>
      </article>

      <!-- CTA -->
      <div class="mt-10 text-center">
        <RouterLink
          to="/buyer/brief/new"
          class="inline-block px-8 py-3 bg-stamp-red text-cream text-sm font-medium tracking-widest uppercase hover:bg-ink transition"
        >
          按标准发包 →
        </RouterLink>
        <RouterLink
          to="/studio/catalog"
          class="inline-block ml-3 px-8 py-3 border-0.5 border-ink/30 text-sm hover:border-ink"
        >
          查看标准 SKU
        </RouterLink>
      </div>
    </div>
  </div>
</template>
