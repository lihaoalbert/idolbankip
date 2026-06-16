<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="bg-cream">
    <section class="max-w-7xl mx-auto px-6 pt-20 pb-24 grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <div class="inline-block px-3 py-1 bg-ink text-cream text-xs tracking-widest mb-6 rounded-full">
          IDOL BANK IP · 抢跑公测
        </div>
        <h1 class="font-display text-5xl lg:text-6xl leading-tight mb-6">
          中国首个<br />
          <span class="text-gold">AI 虚拟人资产银行</span>
        </h1>
        <p class="text-ink/70 text-lg leading-relaxed mb-8 max-w-xl">
          把 AI 创造的虚拟形象，变成可确权、可授权、可交易的标准化数字资产。
          短剧、广告、游戏，一键调用，零塌房风险。
        </p>
        <div class="flex flex-wrap gap-3">
          <RouterLink
            to="/ips"
            class="px-6 py-3 bg-ink text-cream rounded-full hover:bg-gold transition font-medium"
          >浏览形象库 →</RouterLink>
          <RouterLink
            to="/register"
            class="px-6 py-3 border border-ink rounded-full hover:bg-ink hover:text-cream transition"
          >成为创作者</RouterLink>
        </div>

        <div class="mt-12 grid grid-cols-3 gap-6 max-w-md">
          <div>
            <div class="text-3xl font-display text-gold">100+</div>
            <div class="text-xs text-ink/60 mt-1">创世形象</div>
          </div>
          <div>
            <div class="text-3xl font-display text-gold">¥199</div>
            <div class="text-xs text-ink/60 mt-1">测试期意向金</div>
          </div>
          <div>
            <div class="text-3xl font-display text-gold">5min</div>
            <div class="text-xs text-ink/60 mt-1">资产包下载</div>
          </div>
        </div>
      </div>

      <div class="relative aspect-square max-w-md ml-auto">
        <div class="absolute inset-0 rounded-3xl bg-gradient-to-br from-gold/30 to-cream shadow-soft" />
        <div class="absolute inset-8 rounded-2xl bg-surface shadow-soft flex items-center justify-center text-center p-8">
          <div>
            <div class="text-6xl mb-3">🎭</div>
            <div class="font-display text-xl mb-2">「 林知夏 」</div>
            <div class="text-xs text-ink/50">都市冷感御姐 · 现代</div>
            <div class="mt-4 text-xs text-gold">已上链 · 存证号 mock-tx-xxxx</div>
          </div>
        </div>
      </div>
    </section>

    <section class="max-w-7xl mx-auto px-6 py-16 border-t border-line">
      <h2 class="font-display text-3xl mb-2">三层资产交付 · 拿来即用</h2>
      <p class="text-ink/60 mb-12">每个上架 IP 都是标准生产力工具包，不是单张图片</p>

      <div class="grid md:grid-cols-3 gap-6">
        <div class="p-6 bg-surface rounded-2xl border border-line">
          <div class="text-3xl mb-3">🎨</div>
          <h3 class="font-display text-lg mb-2">视觉矩阵</h3>
          <p class="text-sm text-ink/60 leading-relaxed">
            三视图 + 5 种核心表情 + 透明 PNG。短剧分镜、海报设计、角色参考都能直接用。
          </p>
        </div>
        <div class="p-6 bg-surface rounded-2xl border border-line">
          <div class="text-3xl mb-3">🤖</div>
          <h3 class="font-display text-lg mb-2">AI 核心资产</h3>
          <p class="text-sm text-ink/60 leading-relaxed">
            LoRA / LyCORIS 模型 + 触发词 + 推荐参数。后期团队在 Stable Diffusion / ComfyUI 中无限生成新剧照。
          </p>
        </div>
        <div class="p-6 bg-surface rounded-2xl border border-line">
          <div class="text-3xl mb-3">📜</div>
          <h3 class="font-display text-lg mb-2">身份小传</h3>
          <p class="text-sm text-ink/60 leading-relaxed">
            姓名 / 年龄 / 性格标签 / 声音音色 + 选配音频样本。可对接剧本选角与 TTS 配音克隆。
          </p>
        </div>
      </div>
    </section>

    <section class="max-w-7xl mx-auto px-6 py-16 border-t border-line">
      <div class="grid md:grid-cols-4 gap-4">
        <div class="p-5 bg-ink text-cream rounded-2xl">
          <div class="text-xs text-cream/60 mb-2">① 上传</div>
          <div class="text-base font-medium mb-1">创作者上传标准包</div>
          <div class="text-xs text-cream/50">视觉矩阵 + AI 核心 + 身份</div>
        </div>
        <div class="p-5 bg-surface border border-line rounded-2xl">
          <div class="text-xs text-ink/40 mb-2">② 审核 + 存证</div>
          <div class="text-base font-medium mb-1">机审 + 区块链时间戳</div>
          <div class="text-xs text-ink/50">2-3 工作日</div>
        </div>
        <div class="p-5 bg-surface border border-line rounded-2xl">
          <div class="text-xs text-ink/40 mb-2">③ 阶梯授权</div>
          <div class="text-base font-medium mb-1">199 意向金 → 正式授权</div>
          <div class="text-xs text-ink/50">附条件生效</div>
        </div>
        <div class="p-5 bg-gold/20 border border-gold/40 rounded-2xl">
          <div class="text-xs text-ink/60 mb-2">④ 交付</div>
          <div class="text-base font-medium mb-1">5 分钟下载资产包</div>
          <div class="text-xs text-ink/60">OSS 签名链 + 临时凭证</div>
        </div>
      </div>
    </section>

    <section class="max-w-7xl mx-auto px-6 py-16 border-t border-line text-center">
      <h2 class="font-display text-3xl mb-3">合规先行 · 30 天版权空窗期也有保障</h2>
      <p class="text-ink/60 max-w-2xl mx-auto mb-10">
        版权登记前,平台以区块链时间戳 + 附条件合同 + 平台担保承诺三重机制,把风险压到最低。
        B 端支付意向金后即锁定独家排他期,版权下发后合同自动升级为完备法律文书。
      </p>
      <RouterLink
        to="/ips"
        class="inline-block px-8 py-3 bg-ink text-cream rounded-full hover:bg-gold transition"
      >立即查看 100 个创世形象</RouterLink>
    </section>

    <!-- 商务留资区 -->
    <section class="bg-ink text-cream">
      <div class="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <h2 class="font-display text-3xl mb-3">想直接谈? 商务 1 个工作日联系您</h2>
          <p class="text-cream/70 leading-relaxed mb-6">
            大量采购 / 联合开发 / IP 代理合作,留个联系方式,
            商务团队主动对接;也可以直接下单走标准流程,两条路并行。
          </p>
          <div class="flex flex-wrap gap-3">
            <RouterLink
              to="/contact"
              class="px-6 py-3 bg-gold text-ink rounded-full font-medium hover:bg-cream transition"
            >联系商务 →</RouterLink>
            <a
              href="mailto:biz@ibi.ren"
              class="px-6 py-3 border border-cream/30 rounded-full hover:border-gold hover:text-gold transition"
            >发邮件 biz@ibi.ren</a>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="p-4 bg-cream/10 border border-cream/20 rounded-2xl">
            <div class="text-xs text-cream/50 mb-1">企业微信</div>
            <div class="font-mono text-sm">ibi-ren-biz</div>
          </div>
          <div class="p-4 bg-cream/10 border border-cream/20 rounded-2xl">
            <div class="text-xs text-cream/50 mb-1">邮箱</div>
            <div class="font-mono text-sm">biz@ibi.ren</div>
          </div>
          <div class="p-4 bg-cream/10 border border-cream/20 rounded-2xl">
            <div class="text-xs text-cream/50 mb-1">电话</div>
            <div class="font-mono text-sm">400-xxx-xxxx</div>
          </div>
          <div class="p-4 bg-cream/10 border border-cream/20 rounded-2xl">
            <div class="text-xs text-cream/50 mb-1">服务时间</div>
            <div class="font-mono text-sm">10:00 – 19:00</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>