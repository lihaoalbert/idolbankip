<script setup lang="ts">
/**
 * 作品原创性及自主承担侵权责任承诺书 — 静态法律文本页
 * 由 IpWizard 步骤 ③ 提交按钮的"我已阅读并同意"链接跳转而来
 */
const lastUpdated = '2026-06-18';
const version = 'v1.0';

const clauses = [
  {
    no: 'I',
    title: '作品来源及权属承诺',
    items: [
      '承诺人所上传的全部素材 (包括但不限于三视图、表情矩阵、立绘、LoRA 模型、Prompt、人物小传、声音样本、资产包等) 系承诺人本人原创, 或已取得合法、完整、有效的授权, 不存在任何权属争议。',
      '承诺人对上述素材拥有完整的、足以在平台上架并对外授权使用的权利, 包括但不限于著作权、肖像权、商标权及其他相关权利。',
      '作品不包含任何第三方受保护的元素 (明星肖像、品牌 Logo、影视角色等), 亦非通过简单提示词套用、风格迁移等手段对他人作品进行的实质性改动。',
    ],
  },
  {
    no: 'II',
    title: '合法合规承诺',
    items: [
      '作品内容不违反中华人民共和国法律, 不含《网络信息内容生态治理规定》所禁止的任何违法和不良信息。',
      '作品不侵犯任何第三方的著作权、商标权、专利权、肖像权、名誉权、隐私权等合法权益。',
      '如作品包含可识别自然人形象, 承诺人已取得该自然人的书面授权, 或该自然人即为承诺人本人。',
    ],
  },
  {
    no: 'III',
    title: '自主承担侵权责任',
    items: [
      '如因作品存在权属瑕疵、抄袭、未经授权使用等情况, 导致平台或第三方被任何主体主张权利、提起诉讼、要求赔偿的, 承诺人愿自行承担全部法律责任及由此产生的一切费用 (包括但不限于诉讼费、律师费、赔偿金、和解金等)。',
      '平台在收到权利人有效通知后, 有权依据《电子商务法》及平台规则立即下架相关作品, 承诺人对下架措施不持异议。',
      '如因承诺人侵权行为给平台造成损失 (包括但不限于商誉损失、行政罚款、对外赔偿等), 承诺人应向平台承担赔偿责任。',
    ],
  },
  {
    no: 'IV',
    title: '配合核查与证据保全',
    items: [
      '平台有权要求承诺人就作品的原创性或授权链条提供进一步证明 (包括但不限于源文件、工程文件、创作过程记录、授权书等), 承诺人应予配合。',
      '承诺人知悉并同意: 平台对作品进行区块链时间戳存证, 仅作为作品上架时点的事实记录, 不构成对作品原创性的背书或担保。',
    ],
  },
  {
    no: 'V',
    title: '其他',
    items: [
      '本承诺书自承诺人在平台勾选"我已阅读并同意"之时生效, 效力独立于作品是否最终通过平台审核。',
      '本承诺书的订立、效力、解释、履行及争议解决均适用中华人民共和国法律。因本承诺书引起的或与本承诺书有关的争议, 双方应协商解决; 协商不成的, 任何一方有权向平台运营主体所在地有管辖权的人民法院提起诉讼。',
      '本承诺书任一条款被认定为无效、可撤销或不可执行的, 不影响其他条款的效力。',
    ],
  },
];
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <!-- 顶部条 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">IBIren · LEGAL ARCHIVE</div>
        <div class="catalog-no text-ink/40">VOL. I — DECLARATION</div>
        <div class="catalog-no text-ink/30">VERSION {{ version }}</div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-6 lg:px-10 py-14 md:py-20">

      <!-- HERO · 法律文本声明 -->
      <header class="mb-12 md:mb-16">
        <div class="flex items-center justify-between mb-6">
          <div class="catalog-no text-ink/50">№ 099 · LEGAL DECLARATION</div>
          <div class="catalog-no text-ink/30">HANGZHOU · CN</div>
        </div>

        <h1 class="font-display text-4xl md:text-6xl text-ink leading-[0.95]">
          作品原创性及<br>
          <span class="font-display-italic text-gold">自主承担侵权责任</span><br>
          承诺书
        </h1>

        <div class="mt-8 flex flex-wrap items-center gap-6 text-sm text-ink/60">
          <div>
            <span class="catalog-no text-ink/40 mr-2">VERSION</span>
            <span class="font-mono">{{ version }}</span>
          </div>
          <div class="w-px h-4 bg-line"></div>
          <div>
            <span class="catalog-no text-ink/40 mr-2">LAST UPDATED</span>
            <span class="font-mono">{{ lastUpdated }}</span>
          </div>
          <div class="w-px h-4 bg-line"></div>
          <div>
            <span class="catalog-no text-ink/40 mr-2">EFFECTIVE</span>
            <span class="font-mono">UPON CHECK-IN</span>
          </div>
        </div>
      </header>

      <!-- 主体条文 · 像档案章节 -->
      <article class="bg-surface border-0.5 border-ink p-8 md:p-12 space-y-10 md:space-y-12 relative">

        <!-- 印章 -->
        <div class="absolute top-6 right-6 stamp text-gold border-gold hidden md:block">FILED</div>

        <!-- 引言 -->
        <section class="pb-8 hairline-b border-line">
          <div class="catalog-no text-ink/50 mb-4">PREAMBLE · 引言</div>
          <p class="font-display-italic text-lg text-ink/80 leading-relaxed">
            本人 (以下称"承诺人") 拟通过 IBIren 平台
            (下称"平台", 运营主体: 杭州某某科技有限公司)
            上架虚拟人 / 数字人 / AI 生成形象等作品
            (下称"作品"), 在勾选确认本承诺书之前,
            已仔细阅读并充分理解以下全部条款, 自愿作出如下承诺:
          </p>
        </section>

        <!-- 条款 -->
        <section v-for="c in clauses" :key="c.no" class="grid md:grid-cols-12 gap-6">
          <div class="md:col-span-3">
            <div class="catalog-no text-gold mb-2">CLAUSE {{ c.no }}</div>
            <h2 class="font-display text-xl text-ink leading-tight">{{ c.title }}</h2>
          </div>
          <div class="md:col-span-9">
            <ol class="space-y-3 text-sm leading-relaxed text-ink/80">
              <li v-for="(item, idx) in c.items" :key="idx" class="flex gap-3">
                <span class="font-mono text-[10px] text-gold pt-1 shrink-0 w-6">
                  {{ String(idx + 1).padStart(2, '0') }}
                </span>
                <span>{{ item }}</span>
              </li>
            </ol>
          </div>
        </section>

        <!-- 签署说明 -->
        <footer class="pt-8 hairline-t border-line text-sm text-ink/60 space-y-3">
          <p class="font-display-italic">
            本承诺书系电子文本, 在平台勾选"我已阅读并同意"即视为本人签署, 具有法律效力。
          </p>
          <p>
            如对本承诺书内容有任何疑问, 请联系
            <a href="mailto:legal@ibi.ren" class="text-gold hover:underline font-mono">legal@ibi.ren</a>
          </p>
        </footer>
      </article>

      <!-- 底部操作 -->
      <div class="mt-10 md:mt-14 grid md:grid-cols-12 gap-6 items-center">
        <div class="md:col-span-7">
          <p class="font-display-italic text-ink/60 leading-relaxed">
            勾选即代表您已仔细阅读并同意上述全部条款 ·
            IBIren 将以此作为后续取证之依据。
          </p>
        </div>
        <div class="md:col-span-5 md:text-right space-y-3">
          <RouterLink
            to="/creator/ips/new"
            class="inline-flex items-center gap-3 px-6 py-3 bg-ink text-cream hover:bg-gold transition group"
          >
            <span class="catalog-no text-cream/70 group-hover:text-ink/70 text-[10px]">PROCEED</span>
            <span class="font-display">回到捏者中心</span>
            <span class="font-display-italic">→</span>
          </RouterLink>
        </div>
      </div>
    </main>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. LEGAL-099</span>
        <span>SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>
