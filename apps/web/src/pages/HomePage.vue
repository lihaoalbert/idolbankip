<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiClient, ossUrl } from '@/api/client';
import BecomeCreatorLink from '@/components/BecomeCreatorLink.vue';

/**
 * 首页 — MUSEUM ARCHIVE / 美术馆图录
 * 视觉语言: 拍卖图录封面 × 美术馆展墙 × 摄影集画册
 * 字体: Cormorant Garamond (display swash) + Inter Tight (body) + JetBrains Mono (元数据)
 * 业务承诺: 买家痛点 → IBIren 解决方案 → 精选展品 → 鉴定流程 → 资产包三层 → 商务档案
 */

const featured = ref<any[]>([]);
const featuredLoading = ref(true);

onMounted(async () => {
  try {
    const { data } = await apiClient.get('/ips', {
      params: { status: 'PUBLIC_INTENT', size: 4, sort: 'newest' },
    });
    featured.value = data.items ?? [];
  } catch {
    /* 静默 */
  } finally {
    featuredLoading.value = false;
  }
});

// 鉴定流程 — 用罗马数字 + 时间节点
const steps = [
  {
    no: 'I',
    label: 'STEP',
    title: '上传资产包',
    desc: '捏者按 8 类标准上传: 三视图 / 表情 / 立绘 / LoRA / Prompt / 小传 / 声音 / 资产包。',
    meta: 'D-00',
  },
  {
    no: 'II',
    label: 'STEP',
    title: '三道审核',
    desc: '机审合规性 → 相似度比对 (撞脸明星库) → 国家或省级作品著作权登记。',
    meta: 'D-03',
  },
  {
    no: 'III',
    label: 'STEP',
    title: '区块链存证',
    desc: '证书下发即打时间戳上链, 全程不可篡改, 采购方购买即获完整授权链副本。',
    meta: 'D-10',
  },
  {
    no: 'IV',
    label: 'STEP',
    title: '5 分钟交付',
    desc: '资产包 + 著作权证书副本 + 区块链查询凭证, 一次买断, 终身可用。',
    meta: 'D-30',
  },
];

// 三层交付 — 横向 plate 列表
const layers = [
  {
    no: '01',
    title: '视觉矩阵',
    sub: 'VISUAL MATRIX',
    desc: '三视图 + 5 种核心表情 + 透明 PNG。短剧分镜、海报设计、角色参考, 拿来即用。',
    format: 'JPG / PNG · ≥2048',
    items: ['正面', '侧面 45°', '背面', '立绘'],
  },
  {
    no: '02',
    title: 'AI 核心资产',
    sub: 'AI CORE',
    desc: 'LoRA / LyCORIS 模型 + 触发词 + 推荐参数。后期在 SD / ComfyUI 中无限生成新剧照。',
    format: '.safetensors · ≤300MB',
    items: ['LoRA', '触发词', '采样器', 'Steps'],
  },
  {
    no: '03',
    title: '身份小传',
    sub: 'LORE & IDENTITY',
    desc: '姓名 / 年龄 / 性格标签 / 声音音色 + 选配音频样本。剧本选角与 TTS 配音一气呵成。',
    format: '.md / .wav',
    items: ['姓名', '性格', '小传', '声音'],
  },
];

const tickerItems = [
  'CHRISTIE\'S · 数字艺术品拍卖标准',
  '区块链存证 · SHA-256 链上锁定',
  'DWT-SVD 隐水印 · 盗版可溯',
  '国家作品著作权登记 · 法律确权',
  'AI 形象 · 100% 自营创作者',
  '电子签授权书 · 一次性 5 分钟有效链接',
];
</script>

<template>
  <div class="relative bg-cream dark:bg-ink">

    <!-- =========================================================
         TOP TICKER · 顶部滚动条 · 美术馆开放通知
         ========================================================= -->
    <div class="bg-ink text-cream overflow-hidden border-b border-ink/40">
      <div class="ticker-track py-2.5 font-mono text-[10px] tracking-[0.32em] uppercase">
        <span v-for="(t, i) in [...tickerItems, ...tickerItems]" :key="i" class="px-8 inline-flex items-center gap-3">
          <span class="text-gold">◆</span>
          <span>{{ t }}</span>
        </span>
      </div>
    </div>

    <!-- =========================================================
         ISSUE BAR · 杂志期刊号
         ========================================================= -->
    <div class="border-b hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-3 grid grid-cols-3 items-center">
        <div class="flex items-center gap-2">
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-gold animate-pulse-slow" />
          <span class="catalog-no">VOL. I · 2026</span>
        </div>
        <div class="text-center">
          <span class="font-display italic text-base md:text-lg text-ink/70 dark:text-ink/60">IBIren · IP Catalogue</span>
        </div>
        <div class="text-right catalog-no">EST. 2026 / CN</div>
      </div>
    </div>

    <!-- =========================================================
         HERO · 美术馆邀请函
         ========================================================= -->
    <section class="relative paper-grain">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 pt-16 md:pt-24 pb-20 md:pb-32 relative z-10">

        <!-- Plate metadata top -->
        <div class="grid grid-cols-12 gap-4 mb-12 md:mb-16">
          <div class="col-span-3 col-start-1 catalog-no text-ink/50 dark:text-ink/40">№ 001</div>
          <div class="col-span-3 col-start-5 catalog-no text-ink/50 dark:text-ink/40">CAT. NF-26·A</div>
          <div class="col-span-3 col-start-9 catalog-no text-ink/50 dark:text-ink/40">EDITION 23 / 100</div>
          <div class="col-span-3 col-start-12 catalog-no text-ink/50 dark:text-ink/40 text-right hidden md:block">— MANIFESTO</div>
        </div>

        <!-- Massive display headline -->
        <h1 class="font-display text-[14vw] md:text-[10.5rem] lg:text-[12.5rem] leading-[0.88] tracking-tight text-ink max-w-[1500px]">
          <span class="block animate-reveal-up">你拍了</span>
          <span class="block ml-[8vw] md:ml-[14vw] animate-reveal-up" style="animation-delay:.12s">一部<span class="font-display-italic text-gold"> 短剧</span></span>
          <span class="block animate-reveal-up" style="animation-delay:.24s">上线后才</span>
          <span class="block ml-[4vw] md:ml-[6vw] animate-reveal-up" style="animation-delay:.36s">
            发现<span class="swash font-serif text-ink/15">那个</span>
            <span class="font-display-italic text-gold">AI 形象</span>
          </span>
          <span class="block text-right animate-reveal-up" style="animation-delay:.48s">
            <span class="swash">是</span>别人的。
          </span>
        </h1>

        <!-- DEK · 副标题 -->
        <div class="mt-14 md:mt-20 grid md:grid-cols-12 gap-8 items-end">
          <div class="md:col-span-1 hidden md:flex flex-col items-center gap-3">
            <div class="w-px h-16 bg-ink/30 dark:bg-cream/30" />
            <span class="catalog-no [writing-mode:vertical-rl]">DEK · 2026·I</span>
          </div>

          <p class="md:col-span-6 font-display text-2xl md:text-3xl lg:text-[2.5rem] leading-[1.1] text-ink/85 dark:text-cream/85 swash">
            IBIren 让每个 IP<br />
            都带<span class="text-gold italic">版权证书</span>。
          </p>

          <p class="md:col-span-5 text-base md:text-lg text-ink/60 dark:text-cream/60 leading-relaxed max-w-md">
            上架即获国家或省级
            <span class="text-ink/85 dark:text-cream/85 border-b border-gold pb-0.5">作品著作权登记证书</span>,
            区块链时间戳存证, 完整授权链随包。
            <br /><br />
            <span class="text-ink/80 dark:text-cream/80 italic font-display text-xl">短剧上线那天, 律师函追不到你。</span>
          </p>
        </div>

        <!-- CTA · 双按钮 -->
        <div class="mt-12 md:mt-16 flex flex-wrap items-center gap-4">
          <RouterLink
            to="/ips"
            class="group relative inline-flex items-center gap-3 px-8 py-4 bg-ink text-cream rounded-none overflow-hidden transition-all duration-500 hover:bg-gold hover:text-ink"
          >
            <span class="catalog-no text-cream/60 group-hover:text-ink/60">CAT. NF</span>
            <span class="text-base font-medium tracking-wide">浏览资产库</span>
            <span class="inline-block transition-transform duration-500 group-hover:translate-x-2">→</span>
            <!-- cropmarks -->
            <span class="cropmark cropmark-tl" style="border-color:currentColor" />
            <span class="cropmark cropmark-br" style="border-color:currentColor" />
          </RouterLink>
          <BecomeCreatorLink
            class="inline-flex items-center gap-3 px-8 py-4 border-0.5 border-ink text-ink rounded-none hover:bg-ink hover:text-cream transition-colors duration-500"
          >
            <span class="catalog-no text-ink/60">CREATOR</span>
            <span class="text-base font-medium tracking-wide">成为捏者</span>
          </BecomeCreatorLink>
        </div>

        <!-- Footnote row · 鉴定签名 -->
        <div class="mt-20 md:mt-28 grid grid-cols-12 gap-4 border-t hairline-t border-line pt-6">
          <div class="col-span-3 catalog-no">FIG. A — 风险图谱</div>
          <div class="col-span-3 catalog-no">FIG. B — 鉴定流程</div>
          <div class="col-span-3 catalog-no">FIG. C — 资产交付</div>
          <div class="col-span-3 catalog-no text-right">© 2026 IBIren</div>
        </div>
      </div>

      <!-- Bottom signature rule -->
      <div class="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
    </section>

    <!-- =========================================================
         01 · SELECTED WORKS · 本期精选 (1 + 3 不对称画廊)
         ========================================================= -->
    <section class="border-b hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-20 md:py-28">

        <header class="grid md:grid-cols-12 gap-6 mb-12 md:mb-16 items-end">
          <div class="md:col-span-7">
            <div class="catalog-no text-gold mb-4">— 01 — SELECTED WORKS</div>
            <h2 class="font-display text-5xl md:text-6xl lg:text-7xl leading-[0.95] text-ink">
              本期<span class="font-display-italic text-gold">精选</span>
            </h2>
          </div>
          <div class="md:col-span-4 md:col-start-9 text-ink/60 dark:text-cream/55 leading-relaxed">
            已登记, 可商用。每件作品附国家级或省级作品著作权登记证书 + 区块链时间戳,
            复制不走样, 维权有抓手。
          </div>
        </header>

        <!-- Loading state -->
        <div v-if="featuredLoading" class="grid grid-cols-12 gap-4 md:gap-6">
          <div class="col-span-12 md:col-span-6 aspect-[4/5] bg-surface-2 hairline border-line animate-pulse" />
          <div class="col-span-12 md:col-span-6 grid grid-cols-2 gap-4 md:gap-6">
            <div v-for="i in 4" :key="i" class="aspect-[3/4] bg-surface-2 hairline border-line animate-pulse" />
          </div>
        </div>

        <!-- Empty -->
        <div v-else-if="featured.length === 0" class="text-center py-32 text-ink/40 font-mono text-sm tracking-widest">
          — NO WORKS PUBLICLY LISTED —
        </div>

        <!-- 1 + 3 不对称画廊 -->
        <div v-else class="grid grid-cols-12 gap-4 md:gap-6">
          <!-- 主推展品 (大) -->
          <RouterLink
            v-if="featured[0]"
            :to="`/ips/${featured[0].code}`"
            class="plate col-span-12 md:col-span-6 group"
          >
            <div class="plate-frame aspect-[4/5] relative">
              <img
                v-if="featured[0].thumbnailKey"
                :src="ossUrl(featured[0].thumbnailKey)"
                :alt="featured[0].displayName"
                class="w-full h-full object-cover"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center font-display text-9xl text-ink/10"
              >{{ featured[0].code }}</div>
              <!-- 档案角标 -->
              <div class="absolute top-3 left-3 stamp text-cream bg-ink/70 border-ink">
                CAT. {{ String(1).padStart(2, '0') }}
              </div>
              <div v-if="featured[0].officialCertNo || featured[0].blockchainTxId" class="absolute bottom-3 left-3 stamp text-cream bg-gold border-gold">
                © 已登记
              </div>
              <span class="cropmark cropmark-tl" />
              <span class="cropmark cropmark-tr" />
              <span class="cropmark cropmark-bl" />
              <span class="cropmark cropmark-br" />
            </div>
            <div class="mt-4 flex items-baseline justify-between gap-4">
              <h3 class="font-display text-3xl md:text-4xl text-ink group-hover:text-gold transition">{{ featured[0].displayName }}</h3>
              <span class="font-mono text-xs tracking-widest text-ink/40">{{ featured[0].code }}</span>
            </div>
            <div class="mt-1.5 font-display-italic text-base text-ink/50">{{ featured[0].tagline || '— A licensed identity, ready for production —' }}</div>
          </RouterLink>

          <!-- 副展品 (3 / 4) -->
          <div class="col-span-12 md:col-span-6 grid grid-cols-2 gap-4 md:gap-6">
            <RouterLink
              v-for="(ip, idx) in featured.slice(1)"
              :key="ip.id"
              :to="`/ips/${ip.code}`"
              class="plate group"
            >
              <div class="plate-frame aspect-[3/4] relative">
                <img
                  v-if="ip.thumbnailKey"
                  :src="ossUrl(ip.thumbnailKey)"
                  :alt="ip.displayName"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center font-display text-5xl text-ink/10">
                  {{ ip.code }}
                </div>
                <div class="absolute top-2 left-2 catalog-no text-cream bg-ink/70 px-1.5 py-0.5">
                  CAT. {{ String(idx + 2).padStart(2, '0') }}
                </div>
                <div v-if="ip.officialCertNo || ip.blockchainTxId" class="absolute bottom-2 right-2 catalog-no text-cream bg-gold/95 px-1.5 py-0.5">
                  ©
                </div>
              </div>
              <div class="mt-3 flex items-baseline justify-between gap-2">
                <h3 class="font-display text-lg text-ink truncate group-hover:text-gold transition">{{ ip.displayName }}</h3>
                <span class="font-mono text-[10px] tracking-widest text-ink/40 shrink-0">{{ ip.code }}</span>
              </div>
            </RouterLink>
          </div>
        </div>

        <RouterLink
          to="/ips"
          class="mt-12 inline-flex items-center gap-3 catalog-no text-ink/60 hover:text-gold transition group"
        >
          <span class="w-8 h-px bg-current group-hover:w-14 transition-all duration-500" />
          VIEW ALL CATALOGUE
          <span>→</span>
        </RouterLink>
      </div>
    </section>

    <!-- =========================================================
         02 · 鉴定流程 · AUTHENTICATION TIMELINE
         ========================================================= -->
    <section class="relative border-b hairline-b border-line bg-surface paper-grain">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-20 md:py-28 relative z-10">

        <header class="grid md:grid-cols-12 gap-6 mb-16 md:mb-20 items-end">
          <div class="md:col-span-2 catalog-no text-gold">— 02 — PROCESS</div>
          <div class="md:col-span-6">
            <h2 class="font-display text-5xl md:text-6xl lg:text-7xl leading-[0.95] text-ink">
              鉴定<span class="font-display-italic text-gold">流程</span>
            </h2>
          </div>
          <div class="md:col-span-4 text-ink/60 dark:text-cream/55 leading-relaxed text-sm">
            从创作者上传到采购方交付, 每一道关卡都留痕。
            区块链 + 国家版权登记双重背书, 让您的资产经得起追溯。
          </div>
        </header>

        <!-- 罗马数字 · 横向时间轴 -->
        <ol class="relative grid grid-cols-1 md:grid-cols-4 gap-px bg-line hairline border-line">
          <li
            v-for="(step, i) in steps"
            :key="i"
            class="bg-surface dark:bg-ink/40 p-8 md:p-10 group hover:bg-cream dark:hover:bg-ink transition-colors duration-500 relative"
          >
            <!-- 罗马数字巨大浮雕 -->
            <div class="absolute top-4 right-4 catalog-no text-ink/30">{{ step.meta }}</div>
            <div class="font-display text-7xl md:text-8xl text-gold/40 leading-none mb-6 group-hover:text-gold/80 transition-colors">
              {{ step.no }}
            </div>
            <div class="catalog-no text-ink/40 mb-3">{{ step.label }}</div>
            <h3 class="font-display text-xl md:text-2xl text-ink mb-3 leading-tight">{{ step.title }}</h3>
            <p class="text-sm text-ink/60 leading-relaxed">{{ step.desc }}</p>
            <!-- hairline -->
            <div class="mt-8 pt-4 hairline-t border-line flex items-center gap-2 catalog-no text-ink/30">
              <span class="inline-block w-1 h-1 bg-gold rounded-full" />
              <span>{{ String(i + 1).padStart(2, '0') }} / 04</span>
            </div>
          </li>
        </ol>
      </div>
    </section>

    <!-- =========================================================
         03 · 三层资产交付 · ASSET PACK
         ========================================================= -->
    <section class="border-b hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-20 md:py-28">

        <header class="grid md:grid-cols-12 gap-6 mb-16 items-end">
          <div class="md:col-span-7">
            <div class="catalog-no text-gold mb-4">— 03 — DELIVERABLES</div>
            <h2 class="font-display text-5xl md:text-6xl lg:text-7xl leading-[0.95] text-ink">
              三层<span class="font-display-italic text-gold">交付</span>
            </h2>
            <p class="mt-4 text-sm text-ink/50 dark:text-ink/40 font-mono tracking-wide">Asset Pack · 资产包 + 著作权证书 + 区块链凭证</p>
          </div>
          <div class="md:col-span-4 md:col-start-9 text-right">
            <div class="font-display text-7xl text-gold/30 dark:text-gold/40 leading-none">III</div>
            <div class="catalog-no text-ink/40 dark:text-ink/35 mt-2">LAYERS</div>
          </div>
        </header>

        <!-- 三层 plate · 横排 -->
        <div class="grid md:grid-cols-3 gap-px bg-line hairline border-line">
          <article
            v-for="layer in layers"
            :key="layer.no"
            class="bg-cream dark:bg-ink/95 p-8 md:p-10 group hover:bg-surface dark:hover:bg-ink/40 transition-colors duration-500 relative overflow-hidden"
          >
            <!-- 巨大背景编号 -->
            <div class="absolute -top-4 -right-2 font-display text-[10rem] leading-none text-ink/[0.03] select-none pointer-events-none group-hover:text-gold/[0.08] transition-colors duration-700">
              {{ layer.no }}
            </div>

            <div class="relative z-10">
              <div class="flex items-baseline justify-between mb-8">
                <div class="font-display text-3xl text-gold">{{ layer.no }}</div>
                <div class="catalog-no text-ink/30">{{ layer.sub }}</div>
              </div>

              <h3 class="font-display text-2xl md:text-3xl text-ink mb-4 leading-tight">{{ layer.title }}</h3>
              <p class="text-sm text-ink/65 leading-relaxed mb-8">{{ layer.desc }}</p>

              <div class="pt-6 hairline-t border-line/60">
                <div class="catalog-no text-ink/40 mb-3">FORMAT</div>
                <div class="font-mono text-xs text-ink/80 mb-6">{{ layer.format }}</div>
                <div class="catalog-no text-ink/40 mb-2">CONTAINS</div>
                <div class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink/70">
                  <span v-for="(item, idx) in layer.items" :key="item" class="flex items-center gap-2">
                    <span class="text-gold">·</span>
                    <span>{{ item }}</span>
                    <span v-if="idx < layer.items.length - 1" class="text-ink/20">|</span>
                  </span>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- =========================================================
         EPILOGUE · 商务档案 + PLUS 增值服务
         ========================================================= -->
    <section class="bg-ink text-cream relative overflow-hidden">
      <!-- paper grain -->
      <div class="absolute inset-0 paper-grain opacity-50 pointer-events-none" />

      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-20 md:py-28 relative z-10">

        <header class="grid md:grid-cols-12 gap-6 mb-12 items-end">
          <div class="md:col-span-2 catalog-no text-gold">— EPILOGUE —</div>
          <div class="md:col-span-7">
            <h2 class="font-display text-5xl md:text-6xl lg:text-7xl leading-[0.95] text-cream">
              想直接谈?<br />
              <span class="font-display-italic text-gold">商务 1 个工作日</span><br />
              主动联系您。
            </h2>
          </div>
          <div class="md:col-span-3 text-cream/55 dark:text-cream/60 leading-relaxed text-sm">
            大量采购 / 联合开发 / IP 代理合作, 留个联系方式, 商务团队主动对接;
            也可以直接下单走标准流程, 两条路并行。
          </div>
        </header>

        <div class="grid md:grid-cols-12 gap-px bg-cream/10 hairline border-cream/15">
          <!-- 左侧: 联系方式档案 -->
          <div class="md:col-span-7 bg-ink p-8 md:p-12">
            <div class="catalog-no text-gold/80 mb-6">— CONTACT —</div>
            <div class="grid grid-cols-2 gap-px bg-cream/10 hairline border-cream/10">
              <div class="bg-ink p-6">
                <div class="catalog-no text-cream/40 mb-2">企业微信</div>
                <div class="font-mono text-lg">ibi-ren-biz</div>
              </div>
              <div class="bg-ink p-6">
                <div class="catalog-no text-cream/40 mb-2">邮箱</div>
                <div class="font-mono text-lg">biz@ibi.ren</div>
              </div>
              <div class="bg-ink p-6">
                <div class="catalog-no text-cream/40 mb-2">电话</div>
                <div class="font-mono text-lg">400-xxx-xxxx</div>
              </div>
              <div class="bg-ink p-6">
                <div class="catalog-no text-cream/40 mb-2">服务时间</div>
                <div class="font-mono text-lg">10:00 – 19:00</div>
              </div>
            </div>

            <div class="mt-10 flex flex-wrap gap-3">
              <RouterLink
                to="/contact"
                class="group inline-flex items-center gap-3 px-8 py-4 bg-gold text-ink hover:bg-cream transition-colors duration-500"
              >
                <span class="catalog-no text-ink/60">BUSINESS</span>
                <span class="text-base font-medium tracking-wide">联系商务</span>
                <span class="inline-block transition-transform duration-500 group-hover:translate-x-2">→</span>
              </RouterLink>
              <a
                href="mailto:biz@ibi.ren"
                class="inline-flex items-center gap-3 px-8 py-4 border-0.5 border-cream/30 text-cream hover:border-gold hover:text-gold transition-colors duration-500"
              >
                <span class="catalog-no text-cream/50">EMAIL</span>
                <span class="font-mono">biz@ibi.ren</span>
              </a>
            </div>
          </div>

          <!-- 右侧: PLUS 增值服务 -->
          <div class="md:col-span-5 bg-gradient-to-br from-ink to-ink/80 p-8 md:p-12 relative">
            <div class="absolute top-6 right-6 stamp text-gold border-gold">
              PLUS · 2026 Q3
            </div>
            <div class="catalog-no text-gold/80 mb-6">— VALUE-ADD —</div>
            <h3 class="font-display text-4xl md:text-5xl text-cream leading-[0.95] mb-6">
              形象<span class="font-display-italic text-gold">相似度</span><br />
              体检
            </h3>
            <p class="text-cream/70 leading-relaxed mb-8">
              你的虚拟人 vs 国内外明星库, 人脸相似度比对。
              捏者上架前自检 + 采购方下单前确认, 双重保险。
            </p>
            <ul class="space-y-3 text-sm text-cream/80 mb-8">
              <li class="flex items-start gap-3 pb-3 hairline-b border-cream/10">
                <span class="text-gold font-display text-xl leading-none mt-0.5">—</span>
                <span>覆盖国内 5 万 + 国外 50 万 + 明星 / 网红 / 名人人像库</span>
              </li>
              <li class="flex items-start gap-3 pb-3 hairline-b border-cream/10">
                <span class="text-gold font-display text-xl leading-none mt-0.5">—</span>
                <span>Top-5 相似人物 + 相似度分数报告</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="text-gold font-display text-xl leading-none mt-0.5">—</span>
                <span>按次 ¥9.9 / 包月 ¥99 / 包年 ¥899</span>
              </li>
            </ul>
            <RouterLink
              to="/contact"
              class="inline-flex items-center gap-3 px-6 py-3 border-0.5 border-gold text-gold hover:bg-gold hover:text-ink transition-colors duration-500"
            >
              <span class="catalog-no">INQUIRY</span>
              <span class="text-sm font-medium tracking-wide">联系商务开通</span>
              <span>→</span>
            </RouterLink>
          </div>
        </div>

        <!-- 末页 colophon -->
        <div class="mt-16 pt-6 hairline-t border-cream/15 grid grid-cols-12 gap-4">
          <div class="col-span-3 catalog-no text-cream/40">COLOPHON</div>
          <div class="col-span-6 col-start-4 text-cream/55 text-xs leading-relaxed">
            Set in Cormorant Garamond, Inter Tight & JetBrains Mono.
            Designed as a digital archive of AI human IP rights — every plate notarised, every certificate signed, every transfer on-chain.
          </div>
          <div class="col-span-3 col-start-10 text-right catalog-no text-cream/40">© 2026 IBIren</div>
        </div>
      </div>
    </section>

  </div>
</template>

<style scoped>
/* 用 v-html 注入水印 SVG (避免破坏现有组件 contract) */
</style>