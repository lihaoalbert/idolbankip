<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiClient, ossUrl } from '@/api/client';
import BecomeCreatorLink from '@/components/BecomeCreatorLink.vue';

/**
 * 首页 — 编辑杂志风 (Editorial)
 * 价值主张: 买家痛点 — 短剧/广告做完了才发现 AI 形象侵权, 钱已花无法挽回
 * 解决方案: ibi.ren 上架的 IP 都有 作品著作权登记证书 + 区块链时间戳 + 完整授权链
 *
 * PLUS 附加值 (收费): 形象相似度体检 — 国内外明星库比对
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

const steps = [
  {
    title: '上传资产包',
    desc: '创作者按 8 类标准上传: 三视图 / 表情 / 立绘 / LoRA / Prompt / 小传 / 声音 / 资产包。',
  },
  {
    title: '三道审核',
    desc: '机审合规性 → 相似度比对 (撞脸明星库) → 国家或省级作品著作权登记。',
  },
  {
    title: '区块链存证',
    desc: '证书下发即打时间戳上链, 全程不可篡改, 采购方购买即获完整授权链副本。',
  },
  {
    title: '5 分钟交付',
    desc: '资产包 + 著作权证书副本 + 区块链查询凭证, 一次买断, 终身可用。',
  },
];

const layers = [
  {
    no: 'I',
    title: '视觉矩阵',
    desc: '三视图 + 5 种核心表情 + 透明 PNG。短剧分镜、海报设计、角色参考, 拿来即用。',
  },
  {
    no: 'II',
    title: 'AI 核心资产',
    desc: 'LoRA / LyCORIS 模型 + 触发词 + 推荐参数。后期在 SD / ComfyUI 中无限生成新剧照。',
  },
  {
    no: 'III',
    title: '身份小传',
    desc: '姓名 / 年龄 / 性格标签 / 声音音色 + 选配音频样本。剧本选角与 TTS 配音一气呵成。',
  },
];
</script>

<template>
  <div class="bg-cream">

    <!-- 顶部 issue 标识 -->
    <section class="border-b border-line">
      <div class="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between text-[10px] md:text-xs tracking-[0.2em] text-ink/50 font-mono">
        <span>IDOL BANK IP</span>
        <span class="hidden md:inline">ISSUE 01 · 2026 · 抢跑公测</span>
        <span>EST. 2026</span>
      </div>
    </section>

    <!-- HERO: 买家痛点 -->
    <section class="border-b border-line">
      <div class="max-w-7xl mx-auto px-6 pt-14 pb-20 md:pt-20 md:pb-28">

        <div class="flex items-end justify-between mb-10 md:mb-14">
          <div class="font-mono text-[10px] md:text-xs tracking-[0.2em] text-ink/40">№ 001 · MANIFESTO</div>
          <div class="font-mono text-[10px] md:text-xs tracking-[0.2em] text-ink/40 hidden md:block">
            — 你买的不是一张图, 是一个有产权的资产
          </div>
        </div>

        <h1 class="font-display text-5xl sm:text-6xl md:text-7xl lg:text-[7.5rem] leading-[1.02] tracking-tight text-ink max-w-6xl">
          <span class="block">你拍了部短剧。</span>
          <span class="block">上线后才发现</span>
          <span class="block mt-2 md:mt-4">
            <span class="text-ink/30">那个</span>
            <span class="italic text-gold"> AI 形象</span>
          </span>
          <span class="block">是别人的。</span>
        </h1>

        <div class="my-12 md:my-16 flex items-center gap-6 max-w-3xl">
          <div class="h-px flex-1 bg-ink/20" />
          <div class="font-mono text-[10px] tracking-[0.3em] text-ink/40">DEK</div>
          <div class="h-px flex-1 bg-ink/20" />
        </div>

        <div class="grid md:grid-cols-2 gap-8 md:gap-12 max-w-5xl">
          <p class="font-display text-2xl md:text-3xl lg:text-4xl leading-snug text-ink/85">
            ibi.ren 让每个 IP<br />
            <span class="text-gold">都带版权证书。</span>
          </p>
          <p class="text-base md:text-lg text-ink/60 leading-relaxed max-w-md">
            上架即获国家或省级
            <span class="text-ink/85">作品著作权登记证书</span>,
            区块链时间戳存证, 完整授权链随包。
            <br />
            <span class="text-ink/80">短剧上线那天, 律师函追不到你。</span>
          </p>
        </div>

        <div class="mt-12 md:mt-14 flex flex-wrap gap-3">
          <RouterLink
            to="/ips"
            class="px-7 py-3.5 bg-ink text-cream rounded-full hover:bg-gold transition font-medium tracking-wide"
          >浏览资产库 →</RouterLink>
          <BecomeCreatorLink
            class="px-7 py-3.5 border border-ink rounded-full hover:bg-ink hover:text-cream transition tracking-wide"
          >成为创作者</BecomeCreatorLink>
        </div>
      </div>
    </section>

    <!-- 01 · 本期精选 -->
    <section class="border-b border-line">
      <div class="max-w-7xl mx-auto px-6 py-16 md:py-20">
        <div class="flex items-end justify-between mb-10 md:mb-14">
          <div>
            <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-3">— 01 —</div>
            <h2 class="font-display text-4xl md:text-5xl">本期精选</h2>
            <p class="text-sm text-ink/50 mt-2 font-mono tracking-wide">Selected Works · 已登记, 可商用</p>
          </div>
          <RouterLink
            to="/ips"
            class="hidden md:inline-block text-sm text-ink/60 hover:text-gold underline underline-offset-4"
          >全部资产 →</RouterLink>
        </div>

        <div v-if="featuredLoading" class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <div v-for="i in 4" :key="i" class="aspect-[3/4] bg-surface border border-line rounded-sm animate-pulse" />
        </div>
        <div v-else-if="featured.length === 0" class="text-center py-20 text-ink/40 font-mono text-sm">
          暂无公开资产
        </div>
        <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <RouterLink
            v-for="(ip, idx) in featured"
            :key="ip.id"
            :to="`/ips/${ip.code}`"
            class="group block"
          >
            <div class="relative aspect-[3/4] bg-surface border border-line rounded-sm overflow-hidden mb-3 group-hover:border-gold transition">
              <img
                v-if="ip.thumbnailKey"
                :src="ossUrl(ip.thumbnailKey)"
                :alt="ip.displayName"
                class="w-full h-full object-cover"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center font-display text-3xl md:text-5xl text-ink/20"
              >{{ ip.code }}</div>
              <div class="absolute top-2 left-2 font-mono text-[10px] tracking-widest text-cream/90 bg-ink/70 px-1.5 py-0.5 rounded-sm">
                № {{ String(idx + 1).padStart(2, '0') }}
              </div>
              <!-- 版权登记角标 -->
              <div
                v-if="ip.officialCertNo || ip.blockchainTxId"
                class="absolute bottom-2 right-2 font-mono text-[9px] tracking-widest text-cream bg-gold/95 px-1.5 py-0.5 rounded-sm"
                :title="ip.officialCertNo ? `登记号: ${ip.officialCertNo}` : '区块链已存证'"
              >
                © 已登记
              </div>
            </div>
            <div class="font-display text-base md:text-lg text-ink truncate group-hover:text-gold transition">{{ ip.displayName }}</div>
            <div class="font-mono text-xs text-ink/50 mt-0.5">{{ ip.code }}</div>
          </RouterLink>
        </div>

        <RouterLink
          to="/ips"
          class="md:hidden mt-8 inline-block text-sm text-ink/60 underline underline-offset-4"
        >全部资产 →</RouterLink>
      </div>
    </section>

    <!-- 02 · 怎么运作 -->
    <section class="border-b border-line bg-surface">
      <div class="max-w-7xl mx-auto px-6 py-16 md:py-20">
        <div class="mb-10 md:mb-14">
          <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-3">— 02 —</div>
          <h2 class="font-display text-4xl md:text-5xl">怎么运作</h2>
          <p class="text-sm text-ink/50 mt-2 font-mono tracking-wide">How it works · 从上传到交付, 四步到位, 版权随身</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-px bg-line border border-line">
          <div
            v-for="(step, i) in steps"
            :key="i"
            class="bg-surface p-6 md:p-8"
          >
            <div class="flex items-baseline justify-between mb-6">
              <div class="font-mono text-[10px] tracking-[0.3em] text-ink/30">STEP</div>
              <div class="font-display text-3xl text-gold">{{ String(i + 1).padStart(2, '0') }}</div>
            </div>
            <h3 class="font-display text-xl md:text-2xl mb-3 text-ink">{{ step.title }}</h3>
            <p class="text-sm text-ink/60 leading-relaxed">{{ step.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 03 · 三层资产交付 -->
    <section class="border-b border-line">
      <div class="max-w-7xl mx-auto px-6 py-16 md:py-20">
        <div class="mb-10 md:mb-14">
          <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-3">— 03 —</div>
          <h2 class="font-display text-4xl md:text-5xl">三层资产交付</h2>
          <p class="text-sm text-ink/50 mt-2 font-mono tracking-wide">What you get · 资产包 + 著作权证书 + 区块链凭证</p>
        </div>

        <div class="grid md:grid-cols-3 gap-10 md:gap-12">
          <div v-for="layer in layers" :key="layer.no">
            <div class="font-display text-5xl text-gold/70 mb-4">{{ layer.no }}</div>
            <h3 class="font-display text-2xl md:text-3xl mb-3 text-ink">{{ layer.title }}</h3>
            <p class="text-sm md:text-base text-ink/60 leading-relaxed">{{ layer.desc }}</p>
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
              想直接谈?<br />
              <span class="text-gold italic">商务 1 个工作日</span><br />
              主动联系您。
            </h2>
            <p class="text-cream/60 leading-relaxed max-w-md mb-6">
              大量采购 / 联合开发 / IP 代理合作, 留个联系方式, 商务团队主动对接;
              也可以直接下单走标准流程, 两条路并行。
            </p>
            <div class="flex flex-wrap gap-3">
              <RouterLink
                to="/contact"
                class="px-7 py-3.5 bg-gold text-ink rounded-full font-medium hover:bg-cream transition"
              >联系商务 →</RouterLink>
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
                <div class="text-[10px] font-mono tracking-widest text-cream/40 mb-1">电话</div>
                <div class="font-mono text-sm">400-xxx-xxxx</div>
              </div>
              <div class="bg-ink p-4">
                <div class="text-[10px] font-mono tracking-widest text-cream/40 mb-1">服务时间</div>
                <div class="font-mono text-sm">10:00–19:00</div>
              </div>
            </div>
          </div>

          <!-- PLUS · 形象相似度体检 (收费) -->
          <div class="border border-gold/30 rounded-2xl p-6 md:p-8 bg-gradient-to-br from-ink to-ink/80 relative overflow-hidden">
            <div class="absolute top-4 right-4 font-mono text-[10px] tracking-[0.3em] text-gold border border-gold/40 rounded-full px-2 py-0.5">
              PLUS
            </div>
            <div class="font-mono text-[10px] tracking-[0.3em] text-gold/80 mb-3">— VALUE-ADD —</div>
            <h3 class="font-display text-2xl md:text-3xl leading-tight mb-4">
              形象相似度体检
            </h3>
            <p class="text-cream/70 leading-relaxed mb-6">
              你的虚拟人 vs 国内外明星库, 人脸相似度比对。
              创作者上架前自检 + 采购方下单前确认, 双重保险。
            </p>
            <ul class="space-y-2 text-sm text-cream/80 mb-6">
              <li class="flex gap-2">
                <span class="text-gold">—</span>
                <span>覆盖国内 5 万 + 国外 50 万 + 明星 / 网红 / 名人人像库</span>
              </li>
              <li class="flex gap-2">
                <span class="text-gold">—</span>
                <span>Top-5 相似人物 + 相似度分数报告</span>
              </li>
              <li class="flex gap-2">
                <span class="text-gold">—</span>
                <span>按次 ¥9.9 / 包月 ¥99 / 包年 ¥899</span>
              </li>
            </ul>
            <RouterLink
              to="/contact"
              class="inline-block px-6 py-3 border border-gold text-gold rounded-full hover:bg-gold hover:text-ink transition"
            >联系商务开通 →</RouterLink>
            <div class="mt-4 text-[10px] font-mono tracking-widest text-cream/40">
              COMING SOON · 2026 Q3
            </div>
          </div>
        </div>
      </div>
    </section>

  </div>
</template>
