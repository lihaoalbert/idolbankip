<script setup lang="ts">
import { ossUrl } from '@/api/client';
import BecomeCreatorLink from '@/components/BecomeCreatorLink.vue';

/**
 * 首页 — AIGC 服务交易平台 (2026-07-24 改版)
 * 定位: 把非标创意服务做成标品 — 写死交付物 / 写死验收清单 / 满意再放款
 * 首发楔子品类: 电商/门店广告片, 3 档 SKU (详见 docs/sku-ad-video-v1.md)
 * 旧 IP 资产库保留在 /ips, 首页不再主推。
 */

function casePoster(src: string): string {
  return ossUrl(`cases/${src}.jpg`);
}

const skus = [
  {
    name: '尝鲜版',
    price: '¥2,999',
    tag: '第一次试 AI 广告片',
    items: ['1 条 · 15–30s · 竖屏 9:16', '1 个创意方向', '样片确认 1 次 + 成片修改 2 次', '5 个工作日交付', '字幕版 + 无字幕版'],
    featured: false,
  },
  {
    name: '标准版',
    price: '¥5,999',
    tag: '有稳定投放计划',
    items: ['1 条 · 30–60s · 竖屏+横屏双尺寸', '出 2 个创意方向选 1', '样片确认 1 次 + 成片修改 3 次', '7 个工作日交付', '封面图 3 张 + 投放文案 3 条'],
    featured: true,
  },
  {
    name: '旗舰版',
    price: '¥9,999',
    tag: '一组内容打 campaign',
    items: ['3 条系列片 · 每条 15–60s · 双尺寸', '统一创意概念 + 3 条分集脚本', '每集样片确认 + 每条修改 3 次', '12 个工作日交付', '含分镜脚本 + 提示词/素材清单'],
    featured: false,
  },
];

const guarantee = [
  { title: '托管支付', desc: '50% 定金走平台托管, 不直接给制作方。' },
  { title: '样片确认', desc: '先出 10–15 秒样片。不满意免费换方向, 仍不满意退全部定金。' },
  { title: '成片验收', desc: '对照 7 项验收清单逐项过。任一项不达标重做 1 次。' },
  { title: '满意放款', desc: '验收通过平台才结算。重做仍不达标, 退尾款。' },
];

const showcase = [
  { src: '03-golf-shoes', title: '《一双舒服的鞋》', meta: '商业广告 · 横屏 0:34' },
  { src: '04-boss-shoes', title: '《大佬带货》', meta: '剧情带货 · 竖屏 1:29' },
  { src: '05-mansion-night', title: '《深宅夜宴》', meta: '古装剧情 · 横屏 0:56' },
  { src: '01-coffee-voyage', title: '《咖啡豆环游记》', meta: '3D 卡通 IP · 竖屏 1:06' },
];
</script>

<template>
  <div class="bg-cream">

    <!-- 顶部 issue 标识 -->
    <section class="border-b border-line">
      <div class="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between text-[10px] md:text-xs tracking-[0.2em] text-ink/50 font-mono">
        <span>IBI.REN · AIGC 服务交易平台</span>
        <span class="hidden md:inline">ISSUE 02 · 2026 · 电商/门店广告片 首发</span>
        <span>EST. 2026</span>
      </div>
    </section>

    <!-- HERO: 标品化价值主张 -->
    <section class="border-b border-line">
      <div class="max-w-7xl mx-auto px-6 pt-14 pb-20 md:pt-20 md:pb-28">

        <div class="flex items-end justify-between mb-10 md:mb-14">
          <div class="font-mono text-[10px] md:text-xs tracking-[0.2em] text-ink/40">№ 002 · MANIFESTO</div>
          <div class="font-mono text-[10px] md:text-xs tracking-[0.2em] text-ink/40 hidden md:block">
            — 你买的不是「找个会做 AI 的人」, 是一个确定的结果
          </div>
        </div>

        <h1 class="font-display text-5xl sm:text-6xl md:text-7xl lg:text-[7rem] leading-[1.04] tracking-tight text-ink max-w-6xl">
          <span class="block">广告片报价 3 万,</span>
          <span class="block">交付要等 3 周,</span>
          <span class="block mt-2 md:mt-4">
            <span class="text-ink/30">翻车</span>
            <span class="italic text-gold">还没处说。</span>
          </span>
        </h1>

        <div class="my-12 md:my-16 flex items-center gap-6 max-w-3xl">
          <div class="h-px flex-1 bg-ink/20" />
          <div class="font-mono text-[10px] tracking-[0.3em] text-ink/40">DEK</div>
          <div class="h-px flex-1 bg-ink/20" />
        </div>

        <div class="grid md:grid-cols-2 gap-8 md:gap-12 max-w-5xl">
          <p class="font-display text-2xl md:text-3xl lg:text-4xl leading-snug text-ink/85">
            ibi.ren 把 AIGC 服务<br />
            <span class="text-gold">做成标品。</span>
          </p>
          <p class="text-base md:text-lg text-ink/60 leading-relaxed max-w-md">
            ¥2,999 起, 5 个工作日交付。交付物、修改次数、验收清单全部写死,
            <span class="text-ink/85">定金平台托管, 样片不满意全额退。</span>
            <br />
            <span class="text-ink/80">你的风险是 0。</span>
          </p>
        </div>

        <div class="mt-12 md:mt-14 flex flex-wrap gap-3">
          <RouterLink
            to="/cases"
            class="px-7 py-3.5 bg-ink text-cream rounded-full hover:bg-gold transition font-medium tracking-wide"
          >先看案例集 →</RouterLink>
          <RouterLink
            to="/contact"
            class="px-7 py-3.5 border border-ink rounded-full hover:bg-ink hover:text-cream transition tracking-wide"
          >留个需求</RouterLink>
        </div>
      </div>
    </section>

    <!-- 01 · 三档标品 -->
    <section class="border-b border-line bg-surface">
      <div class="max-w-7xl mx-auto px-6 py-16 md:py-20">
        <div class="flex items-end justify-between mb-10 md:mb-14">
          <div>
            <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-3">— 01 —</div>
            <h2 class="font-display text-4xl md:text-5xl">三档标品</h2>
            <p class="text-sm text-ink/50 mt-2 font-mono tracking-wide">Fixed Scope · 交付物写死, 价格写死, 没有增项</p>
          </div>
          <div class="hidden md:block font-mono text-xs text-ink/40 text-right">
            全平台商用授权 · 永久<br />加急周期减半 +50%
          </div>
        </div>

        <div class="grid md:grid-cols-3 gap-px bg-line border border-line">
          <div
            v-for="s in skus"
            :key="s.name"
            class="bg-surface p-6 md:p-8 relative"
            :class="s.featured ? 'outline outline-1 outline-gold -outline-offset-1' : ''"
          >
            <div
              v-if="s.featured"
              class="absolute top-4 right-4 font-mono text-[10px] tracking-[0.3em] text-gold border border-gold/50 px-2 py-0.5"
            >主推</div>
            <div class="font-mono text-[10px] tracking-[0.3em] text-ink/40 mb-2">{{ s.tag }}</div>
            <h3 class="font-display text-2xl md:text-3xl text-ink">{{ s.name }}</h3>
            <div class="font-display text-4xl md:text-5xl text-gold my-5">{{ s.price }}</div>
            <ul class="space-y-2.5 text-sm text-ink/70">
              <li v-for="(it, i) in s.items" :key="i" class="flex gap-2">
                <span class="text-gold flex-none">—</span>
                <span>{{ it }}</span>
              </li>
            </ul>
            <RouterLink
              to="/contact"
              class="mt-8 inline-block px-6 py-2.5 border rounded-full text-sm transition"
              :class="s.featured
                ? 'bg-ink text-cream border-ink hover:bg-gold hover:border-gold hover:text-ink'
                : 'border-ink/30 text-ink hover:border-ink'"
            >按此档询价 →</RouterLink>
          </div>
        </div>

        <p class="mt-6 text-xs text-ink/40 font-mono tracking-wide">
          * 客户需提供: 产品资料 + 品牌要求 + 投放渠道, 资料齐后起算工期。超出修改次数 ¥300–500/次。
        </p>
      </div>
    </section>

    <!-- 02 · 平台担保交付 -->
    <section class="border-b border-line">
      <div class="max-w-7xl mx-auto px-6 py-16 md:py-20">
        <div class="mb-10 md:mb-14">
          <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-3">— 02 —</div>
          <h2 class="font-display text-4xl md:text-5xl">平台担保交付</h2>
          <p class="text-sm text-ink/50 mt-2 font-mono tracking-wide">Escrow · 钱不过手, 验收不过不结算</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-px bg-line border border-line">
          <div v-for="(g, i) in guarantee" :key="i" class="bg-cream p-6 md:p-8">
            <div class="flex items-baseline justify-between mb-6">
              <div class="font-mono text-[10px] tracking-[0.3em] text-ink/30">STEP</div>
              <div class="font-display text-3xl text-gold">{{ String(i + 1).padStart(2, '0') }}</div>
            </div>
            <h3 class="font-display text-xl md:text-2xl mb-3 text-ink">{{ g.title }}</h3>
            <p class="text-sm text-ink/60 leading-relaxed">{{ g.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 03 · 精选案例 -->
    <section class="border-b border-line">
      <div class="max-w-7xl mx-auto px-6 py-16 md:py-20">
        <div class="flex items-end justify-between mb-10 md:mb-14">
          <div>
            <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-3">— 03 —</div>
            <h2 class="font-display text-4xl md:text-5xl">精选案例</h2>
            <p class="text-sm text-ink/50 mt-2 font-mono tracking-wide">Case Files · 认证工作室全 AI 制作, 这就是交付质量</p>
          </div>
          <RouterLink
            to="/cases"
            class="hidden md:inline-block text-sm text-ink/60 hover:text-gold underline underline-offset-4"
          >全部案例 →</RouterLink>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <RouterLink
            v-for="(c, idx) in showcase"
            :key="c.src"
            to="/cases"
            class="group block"
          >
            <div class="relative bg-surface border border-line overflow-hidden mb-3 group-hover:border-gold transition">
              <img :src="casePoster(c.src)" :alt="c.title" class="w-full h-auto block" loading="lazy" />
              <div class="absolute top-2 left-2 font-mono text-[10px] tracking-widest text-cream/90 bg-ink/70 px-1.5 py-0.5">
                № {{ String(idx + 1).padStart(2, '0') }}
              </div>
            </div>
            <div class="font-display text-base md:text-lg text-ink truncate group-hover:text-gold transition">{{ c.title }}</div>
            <div class="font-mono text-xs text-ink/50 mt-0.5">{{ c.meta }}</div>
          </RouterLink>
        </div>

        <RouterLink
          to="/cases"
          class="md:hidden mt-8 inline-block text-sm text-ink/60 underline underline-offset-4"
        >全部案例 →</RouterLink>
      </div>
    </section>

    <!-- 04 · 供给端 -->
    <section class="border-b border-line bg-surface">
      <div class="max-w-7xl mx-auto px-6 py-16 md:py-20">
        <div class="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-3">— 04 —</div>
            <h2 class="font-display text-4xl md:text-5xl mb-6">你是 AIGC 工作室<br />或自由职业者?</h2>
            <p class="text-ink/60 leading-relaxed max-w-md">
              平台按统一标准派单: 需求写死、验收清单写死、结算平台担保。
              不竞价、不比稿, 通过品类认证即可接单。
            </p>
          </div>
          <div class="grid grid-cols-1 gap-px bg-line border border-line">
            <div class="bg-surface p-5 flex items-baseline gap-4">
              <span class="font-display text-2xl text-gold flex-none">01</span>
              <div>
                <h3 class="font-display text-lg text-ink">品类认证</h3>
                <p class="text-sm text-ink/60">按品类提交作品, 达到案例集同等质量即发证。</p>
              </div>
            </div>
            <div class="bg-surface p-5 flex items-baseline gap-4">
              <span class="font-display text-2xl text-gold flex-none">02</span>
              <div>
                <h3 class="font-display text-lg text-ink">数据派单</h3>
                <p class="text-sm text-ink/60">按品类、评级和交付记录派单, 不做低价竞价。</p>
              </div>
            </div>
            <div class="bg-surface p-5 flex items-baseline gap-4">
              <span class="font-display text-2xl text-gold flex-none">03</span>
              <div>
                <h3 class="font-display text-lg text-ink">担保结算</h3>
                <p class="text-sm text-ink/60">验收通过即结算, 平台兜底拖欠。</p>
              </div>
            </div>
            <div class="bg-surface p-5">
              <BecomeCreatorLink
                class="inline-block px-6 py-2.5 bg-ink text-cream rounded-full text-sm hover:bg-gold hover:text-ink transition"
              >申请入驻 →</BecomeCreatorLink>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 末页 · EPILOGUE -->
    <section class="bg-ink text-cream">
      <div class="max-w-7xl mx-auto px-6 py-16 md:py-24">
        <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-6">— EPILOGUE —</div>

        <div class="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <h2 class="font-display text-4xl md:text-5xl lg:text-6xl leading-tight mb-6">
              留个需求,<br />
              <span class="text-gold italic">当天给创意方向。</span>
            </h2>
            <p class="text-cream/60 leading-relaxed max-w-md mb-6">
              说清楚产品、受众和投放渠道即可。批量采购 / 长期内容订阅 /
              工作室入驻, 商务 1 个工作日内主动联系您。
            </p>
            <div class="flex flex-wrap gap-3">
              <RouterLink
                to="/contact"
                class="px-7 py-3.5 bg-gold text-ink rounded-full font-medium hover:bg-cream transition"
              >留个需求 →</RouterLink>
              <a
                href="mailto:biz@ibi.ren"
                class="px-7 py-3.5 border border-cream/30 rounded-full hover:border-gold hover:text-gold transition"
              >发邮件 biz@ibi.ren</a>
            </div>

            <div class="mt-8 grid grid-cols-2 gap-px bg-cream/10 border border-cream/10 max-w-md">
              <div class="bg-ink p-4">
                <div class="text-[10px] font-mono tracking-widest text-cream/40 mb-1">企业微信</div>
                <div class="font-mono text-sm">ibi-ren-biz</div>
              </div>
              <div class="bg-ink p-4">
                <div class="text-[10px] font-mono tracking-widest text-cream/40 mb-1">邮箱</div>
                <div class="font-mono text-sm">biz@ibi.ren</div>
              </div>
              <div class="bg-ink p-4">
                <div class="text-[10px] font-mono tracking-widest text-cream/40 mb-1">响应</div>
                <div class="font-mono text-sm">1 个工作日内</div>
              </div>
              <div class="bg-ink p-4">
                <div class="text-[10px] font-mono tracking-widest text-cream/40 mb-1">服务时间</div>
                <div class="font-mono text-sm">10:00–19:00</div>
              </div>
            </div>
          </div>

          <!-- 首单保障 -->
          <div class="border border-gold/30 p-6 md:p-8 relative">
            <div class="absolute top-4 right-4 font-mono text-[10px] tracking-[0.3em] text-gold border border-gold/40 px-2 py-0.5">
              首单保障
            </div>
            <div class="font-mono text-[10px] tracking-[0.3em] text-gold/80 mb-3">— ZERO RISK —</div>
            <h3 class="font-display text-2xl md:text-3xl leading-tight mb-4">
              不满意, 不花钱。
            </h3>
            <ul class="space-y-3 text-sm text-cream/80 mb-6">
              <li class="flex gap-2">
                <span class="text-gold">—</span>
                <span>50% 定金平台托管, 制作方碰不到钱</span>
              </li>
              <li class="flex gap-2">
                <span class="text-gold">—</span>
                <span>样片不满意: 免费换方向, 仍不满意退全部定金</span>
              </li>
              <li class="flex gap-2">
                <span class="text-gold">—</span>
                <span>成片对照 7 项验收清单, 不达标重做, 仍不达标退尾款</span>
              </li>
              <li class="flex gap-2">
                <span class="text-gold">—</span>
                <span>过程稿全程留痕, 纠纷平台仲裁</span>
              </li>
            </ul>
            <RouterLink
              to="/cases"
              class="inline-block px-6 py-3 border border-gold text-gold rounded-full hover:bg-gold hover:text-ink transition"
            >先看案例再决定 →</RouterLink>
          </div>
        </div>
      </div>
    </section>

  </div>
</template>
