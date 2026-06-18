<script setup lang="ts">
/**
 * 作品原创性及自主承担侵权责任承诺书 — 静态法律文本页
 *
 * 由 IpWizard 步骤 ③ 提交按钮的"我已阅读并同意"链接跳转而来
 * (见 [[project-post-mvp-backlog]] #18 — 之前链接目标是 404)
 *
 * MVP 阶段: 无需 e-sign,创作者勾选即视为已阅读并承诺。
 * 后续如需取证,可让创作者勾选时同时记录时间戳 + IP + userAgent 到 audit log。
 */
const lastUpdated = '2026-06-18';
const version = 'v1.0';
</script>

<template>
  <div class="max-w-3xl mx-auto px-6 py-12">
    <div class="mb-8">
      <div class="text-xs text-ink/40 mb-2">ibi.ren · 法律文本</div>
      <h1 class="font-display text-3xl mb-2">作品原创性及自主承担侵权责任承诺书</h1>
      <p class="text-xs text-ink/40">版本 {{ version }} · 最后更新 {{ lastUpdated }}</p>
    </div>

    <article class="bg-surface border border-line rounded-2xl p-8 space-y-6 text-sm leading-relaxed text-ink/80">
      <p>
        本人(以下称"承诺人")拟通过 ibi.ren 平台(下称"平台",运营主体:杭州某某科技有限公司)
        上架虚拟人 / 数字人 / AI 生成形象等作品(下称"作品"),在勾选确认本承诺书之前,
        已仔细阅读并充分理解以下全部条款,自愿作出如下承诺:
      </p>

      <section>
        <h2 class="font-medium text-base text-ink mb-2">一、作品来源及权属承诺</h2>
        <ol class="list-decimal pl-6 space-y-1.5">
          <li>承诺人所上传的全部素材(包括但不限于三视图、表情矩阵、立绘、LoRA 模型、Prompt、人物小传、声音样本、资产包等)系承诺人本人原创,或已取得合法、完整、有效的授权,不存在任何权属争议。</li>
          <li>承诺人对上述素材拥有完整的、足以在平台上架并对外授权使用的权利,包括但不限于著作权、肖像权、商标权及其他相关权利。</li>
          <li>作品不包含任何第三方受保护的元素(明星肖像、品牌 Logo、影视角色等),亦非通过简单提示词套用、风格迁移等手段对他人作品进行的实质性改动。</li>
        </ol>
      </section>

      <section>
        <h2 class="font-medium text-base text-ink mb-2">二、合法合规承诺</h2>
        <ol class="list-decimal pl-6 space-y-1.5">
          <li>作品内容不违反中华人民共和国法律,不含《网络信息内容生态治理规定》所禁止的任何违法和不良信息。</li>
          <li>作品不侵犯任何第三方的著作权、商标权、专利权、肖像权、名誉权、隐私权等合法权益。</li>
          <li>如作品包含可识别自然人形象,承诺人已取得该自然人的书面授权,或该自然人即为承诺人本人。</li>
        </ol>
      </section>

      <section>
        <h2 class="font-medium text-base text-ink mb-2">三、自主承担侵权责任</h2>
        <ol class="list-decimal pl-6 space-y-1.5">
          <li>如因作品存在权属瑕疵、抄袭、未经授权使用等情况,导致平台或第三方被任何主体主张权利、提起诉讼、要求赔偿的,承诺人愿自行承担全部法律责任及由此产生的一切费用(包括但不限于诉讼费、律师费、赔偿金、和解金等)。</li>
          <li>平台在收到权利人有效通知后,有权依据《电子商务法》及平台规则立即下架相关作品,承诺人对下架措施不持异议。</li>
          <li>如因承诺人侵权行为给平台造成损失(包括但不限于商誉损失、行政罚款、对外赔偿等),承诺人应向平台承担赔偿责任。</li>
        </ol>
      </section>

      <section>
        <h2 class="font-medium text-base text-ink mb-2">四、配合核查与证据保全</h2>
        <ol class="list-decimal pl-6 space-y-1.5">
          <li>平台有权要求承诺人就作品的原创性或授权链条提供进一步证明(包括但不限于源文件、工程文件、创作过程记录、授权书等),承诺人应予配合。</li>
          <li>承诺人知悉并同意:平台对作品进行区块链时间戳存证,仅作为作品上架时点的事实记录,不构成对作品原创性的背书或担保。</li>
        </ol>
      </section>

      <section>
        <h2 class="font-medium text-base text-ink mb-2">五、其他</h2>
        <ol class="list-decimal pl-6 space-y-1.5">
          <li>本承诺书自承诺人在平台勾选"我已阅读并同意"之时生效,效力独立于作品是否最终通过平台审核。</li>
          <li>本承诺书的订立、效力、解释、履行及争议解决均适用中华人民共和国法律。因本承诺书引起的或与本承诺书有关的争议,双方应协商解决;协商不成的,任何一方有权向平台运营主体所在地有管辖权的人民法院提起诉讼。</li>
          <li>本承诺书任一条款被认定为无效、可撤销或不可执行的,不影响其他条款的效力。</li>
        </ol>
      </section>

      <div class="pt-4 mt-4 border-t border-line text-xs text-ink/50 space-y-1">
        <p>本承诺书系电子文本,在平台勾选"我已阅读并同意"即视为本人签署,具有法律效力。</p>
        <p>如对本承诺书内容有任何疑问,请联系 <a href="mailto:legal@ibi.ren" class="text-gold hover:underline">legal@ibi.ren</a>。</p>
      </div>
    </article>

    <div class="mt-8 text-center">
      <RouterLink to="/creator/ips/new" class="text-xs text-gold hover:underline">← 返回创作者中心</RouterLink>
    </div>
  </div>
</template>