<script setup lang="ts">
/**
 * /promo — 营销落地页 (2026-08 需求端起量计划 P0)
 * 抖音/视频号/小红书投放流量的承接地: 移动端优先、窄版式、转化优先。
 * 与首页「美术馆图录」风解耦, 但仍用 ink/cream/gold 品牌 token。
 *
 * SKU 数据策略: 先尝试公开 API /catalog/skus; 仅当其 ad 档价格与
 * docs/sku-ad-video-v1.md (¥2,999/¥5,999/¥9,999) 一致时才采用 API 值,
 * 否则回退到按文档硬编码 (当前 catalog 种子价 ¥800/1,700/3,000 是内部
 * 众包菜单价, 与对外销售报价不一致, 见 docs/sku-ad-video-v1.md)。
 */
import { onMounted, ref } from 'vue';
import { apiClient } from '@/api/client';
import { CASE_WORKS, casePosterUrl, caseVideoUrl } from '@/data/case-works';
import { buildLeadSource, trackEvent } from '@/utils/utm';

/* ---------- SKU 数据 (以 docs/sku-ad-video-v1.md 为唯一标准) ---------- */
type Tier = 'essential' | 'standard' | 'premium';

interface PromoSku {
  tier: Tier;
  name: string;
  price: number; // 元
  audience: string;
  delivery: string;
  days: string;
  items: string[];
  recommended?: boolean;
}

const FALLBACK_SKUS: PromoSku[] = [
  {
    tier: 'essential',
    name: '尝鲜版',
    price: 2999,
    audience: '第一次试 AI 广告片的门店/电商',
    delivery: '1 条 · 15–30s · 竖屏 9:16',
    days: '5 个工作日',
    items: ['1 个创意方向', '样片确认 1 次', '成片修改 2 次', '字幕版 + 无字幕版', '全平台商用 · 永久授权'],
  },
  {
    tier: 'standard',
    name: '标准版',
    price: 5999,
    audience: '有稳定投放计划的电商卖家',
    delivery: '1 条 · 30–60s · 竖屏 + 横屏双尺寸',
    days: '7 个工作日',
    items: ['出 2 个创意方向选 1', '样片确认 1 次', '成片修改 3 次', '封面图 3 张 + 投放文案 3 条', '全平台商用 · 永久授权'],
    recommended: true,
  },
  {
    tier: 'premium',
    name: '旗舰版',
    price: 9999,
    audience: '要一组内容打 campaign 的品牌',
    delivery: '3 条系列片 · 每条 15–60s · 双尺寸',
    days: '12 个工作日',
    items: ['统一创意概念 + 3 条分集脚本', '每集样片确认 1 次', '每条成片修改 3 次', '含分镜脚本 + 提示词/素材清单', '全平台商用 · 永久授权'],
  },
];

const skus = ref<PromoSku[]>(FALLBACK_SKUS);

// 尝试用公开 SKU API 覆盖价格/周期; 价格与文档不一致时保留硬编码 fallback
onMounted(async () => {
  try {
    const { data } = await apiClient.get('/catalog/skus', { params: { category: 'ad' } });
    const items = Array.isArray(data?.items) ? data.items : [];
    const merged = skus.value.map((sku) => {
      const remote = items.find(
        (s: { tier: string; basePrice: string; deliveryDays: number }) =>
          s.tier === sku.tier && Math.round(Number(s.basePrice)) === sku.price,
      );
      return remote ? { ...sku, days: `${remote.deliveryDays} 个工作日` } : sku;
    });
    skus.value = merged;
  } catch {
    // API 不可用 (离线/后端未起) — 静默用 fallback, 页面照常渲染
  }
});

/* ---------- 案例墙 (复用 /cases 数据) ---------- */
const works = CASE_WORKS;
const heroWork = works[0]; // 《一双舒服的鞋》— 销售话术指定的商业片代表

// 移动端点击播放/暂停 (app.css 全局隐藏了原生 controls, 故自管播放态)
const playingSrc = ref<string | null>(null);
function toggleWork(w: { src: string }, e: MouseEvent) {
  const v = (e.currentTarget as HTMLElement).querySelector('video');
  if (!v) return;
  if (v.paused) {
    if (!v.getAttribute('src')) v.src = v.dataset.src!;
    v.play().catch(() => {});
    playingSrc.value = w.src;
    trackEvent('case_play', { src: w.src });
  } else {
    v.pause();
    playingSrc.value = null;
  }
}

/* ---------- 留资表单 ---------- */
const formRef = ref<HTMLElement | null>(null);
const intentTier = ref<Tier>('standard');
const form = ref({ name: '', contact: '', message: '' });
const submitting = ref(false);
const submitted = ref(false);
const error = ref('');

function tierLabel(t: Tier): string {
  const sku = skus.value.find((s) => s.tier === t);
  return sku ? `${sku.name} ¥${sku.price.toLocaleString('zh-CN')}` : t;
}

function pickTier(t: Tier) {
  intentTier.value = t;
  trackEvent('sku_cta', { tier: t });
  formRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToForm() {
  formRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submit() {
  error.value = '';
  if (submitting.value || submitted.value) return; // 防重复提交
  const name = form.value.name.trim();
  const contact = form.value.contact.trim();
  const demand = form.value.message.trim();
  if (name.length < 2) {
    error.value = '请填写称呼 (至少 2 个字)';
    return;
  }
  if (!contact) {
    error.value = '请留下手机号或微信号, 方便商务联系你';
    return;
  }
  if (demand.length < 2) {
    error.value = '请用一句话说说你的需求';
    return;
  }
  // 一个字段同时收手机号/微信号: 纯数字且 11 位按手机号走, 否则按微信号
  const payload: Record<string, string> = {
    name,
    message: `【意向档位: ${tierLabel(intentTier.value)}】${demand}`,
    source: buildLeadSource('promo'),
  };
  if (/^1\d{10}$/.test(contact)) payload.phone = contact;
  else payload.wechat = contact;

  submitting.value = true;
  try {
    await apiClient.post('/leads', payload);
    submitted.value = true;
    trackEvent('lead_submit', { tier: intentTier.value });
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
    error.value = Array.isArray(msg) ? msg.join('; ') : msg || '提交失败, 请稍后再试或直接加企微';
  } finally {
    submitting.value = false;
  }
}

/* ---------- 企微复制 ---------- */
const WECHAT_ID = 'ibi-ren-biz';
const copied = ref(false);
async function copyWechat() {
  try {
    await navigator.clipboard.writeText(WECHAT_ID);
    copied.value = true;
    trackEvent('wechat_copy');
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // 剪贴板不可用时用户可直接长按复制文字
  }
}

/* ---------- 担保机制 ---------- */
const guarantees = [
  { title: '定金托管', desc: '50% 定金走平台托管, 不直接给制作方。' },
  { title: '样片确认', desc: '先出 10–15s 样片。不满意免费换 1 次创意方向; 仍不满意, 退全部定金。' },
  { title: '成片验收', desc: '对照 7 项验收清单逐项过。不达标重做 1 次; 仍不达标, 退尾款。' },
  { title: '满意放款', desc: '验收通过, 平台才把款项结算给制作方。' },
];
</script>

<template>
  <div class="bg-cream text-ink">

    <!-- ============ HERO ============ -->
    <section class="bg-ink text-cream">
      <div class="max-w-xl mx-auto px-5 pt-8 pb-10 md:pt-14 md:pb-16">
        <div class="flex items-center justify-between font-mono text-[10px] tracking-[0.2em] text-cream/50 mb-8">
          <span>IBI.REN · AI 广告片</span>
          <span>5 天交付 · 不满意退定金</span>
        </div>
        <h1 class="font-display text-4xl md:text-5xl leading-[1.15] tracking-tight">
          AI 广告片,<br />
          <span class="text-gold">¥2,999 起</span>, 5 天交付。
        </h1>
        <p class="mt-4 text-sm md:text-base text-cream/70 leading-relaxed">
          传统拍摄一条 3 万起 / 3 周。我们 AI 原生制作:
          写死交付物、写死验收清单, 样片不满意<span class="text-cream">退全部定金</span>。
        </p>

        <!-- 案例视频自动播放 (muted loop, 移动端可自动播) -->
        <div class="mt-6 border border-cream/15">
          <video
            :src="caseVideoUrl(heroWork.src)"
            :poster="casePosterUrl(heroWork.src)"
            muted
            loop
            autoplay
            playsinline
            class="w-full h-auto block bg-black"
          />
          <div class="px-3 py-2 font-mono text-[10px] tracking-widest text-cream/50">
            {{ heroWork.title }} · {{ heroWork.meta }} · 全 AI 制作
          </div>
        </div>

        <button
          class="mt-6 w-full py-4 bg-gold text-ink text-base font-medium rounded-full hover:bg-cream transition"
          @click="scrollToForm"
        >
          免费领创意脚本 · 留个需求 →
        </button>
        <p class="mt-3 text-center text-xs text-cream/40">30 秒填完 · 商务 2 小时内响应</p>
      </div>
    </section>

    <!-- ============ 案例墙 ============ -->
    <section class="border-b border-line">
      <div class="max-w-xl mx-auto px-5 py-10 md:py-14">
        <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-2">— 先看货, 再下单 —</div>
        <h2 class="font-display text-3xl md:text-4xl">交付实物</h2>
        <p class="mt-2 text-sm text-ink/60">全部由平台认证工作室全 AI 制作, 点一下直接播。</p>

        <div class="mt-6 grid grid-cols-2 gap-3">
          <div
            v-for="w in works"
            :key="w.src"
            class="relative bg-ink cursor-pointer overflow-hidden"
            role="button"
            tabindex="0"
            :aria-label="`播放 ${w.title}`"
            @click="toggleWork(w, $event)"
            @keydown.enter.prevent="toggleWork(w, $event as unknown as MouseEvent)"
          >
            <video
              muted
              loop
              playsinline
              preload="none"
              :poster="casePosterUrl(w.src)"
              :data-src="caseVideoUrl(w.src)"
              class="w-full h-full object-cover block aspect-[4/3]"
            />
            <div
              v-if="playingSrc !== w.src"
              class="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <span class="w-10 h-10 flex items-center justify-center bg-ink/60 border border-cream/40 rounded-full">
                <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 fill-cream ml-0.5"><path d="M3 1.5v13l11-6.5z"/></svg>
              </span>
            </div>
            <div class="absolute bottom-0 inset-x-0 px-2 py-1.5 bg-gradient-to-t from-ink/85 to-transparent pointer-events-none">
              <div class="text-[11px] text-cream leading-tight">{{ w.title }}</div>
              <div class="font-mono text-[9px] text-cream/60">{{ w.meta }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ SKU 卡片 ============ -->
    <section class="border-b border-line bg-surface">
      <div class="max-w-xl mx-auto px-5 py-10 md:py-14">
        <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-2">— 三档标品, 价格透明 —</div>
        <h2 class="font-display text-3xl md:text-4xl">选一档, 直接开做</h2>
        <p class="mt-2 text-sm text-ink/60">
          1080p 及以上 · H.264/mp4 · 可直接投抖音/视频号/小红书/千川。加急周期减半, 加收 50%。
        </p>

        <div class="mt-6 space-y-4">
          <article
            v-for="s in skus"
            :key="s.tier"
            class="relative bg-cream border p-5"
            :class="s.recommended ? 'border-gold border-2' : 'border-line'"
          >
            <div
              v-if="s.recommended"
              class="absolute -top-3 left-4 px-2 py-0.5 bg-gold text-ink font-mono text-[10px] tracking-widest"
            >最多人选</div>
            <div class="flex items-baseline justify-between gap-3">
              <h3 class="font-display text-2xl">{{ s.name }}</h3>
              <div class="font-mono text-2xl text-gold">¥{{ s.price.toLocaleString('zh-CN') }}</div>
            </div>
            <p class="mt-1 text-xs text-ink/50">{{ s.audience }}</p>
            <div class="mt-3 flex flex-wrap gap-2 font-mono text-[11px] text-ink/70">
              <span class="px-2 py-1 bg-surface border border-line">{{ s.delivery }}</span>
              <span class="px-2 py-1 bg-surface border border-line">交付 {{ s.days }}</span>
            </div>
            <ul class="mt-3 space-y-1.5 text-sm text-ink/75">
              <li v-for="(item, i) in s.items" :key="i" class="flex gap-2">
                <span class="text-gold flex-none">✓</span>{{ item }}
              </li>
            </ul>
            <button
              class="mt-4 w-full py-3.5 text-base font-medium rounded-full transition"
              :class="s.recommended
                ? 'bg-ink text-cream hover:bg-gold hover:text-ink'
                : 'border border-ink text-ink hover:bg-ink hover:text-cream'"
              @click="pickTier(s.tier)"
            >
              选{{ s.name }}, 留个需求 →
            </button>
          </article>
        </div>

        <p class="mt-4 text-xs text-ink/45 leading-relaxed">
          你需要提供: 产品资料 (图片/链接/卖点) + 品牌要求 (logo/色号/禁忌) + 投放渠道。资料齐后起算工期。
        </p>
      </div>
    </section>

    <!-- ============ 信任区 · 担保机制 ============ -->
    <section class="border-b border-line">
      <div class="max-w-xl mx-auto px-5 py-10 md:py-14">
        <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-2">— 你的风险是 0 —</div>
        <h2 class="font-display text-3xl md:text-4xl">平台担保交付</h2>

        <div class="mt-6 grid grid-cols-1 gap-px bg-line border border-line">
          <div v-for="(g, i) in guarantees" :key="i" class="bg-cream p-5 flex gap-4">
            <div class="font-display text-2xl text-gold flex-none">{{ String(i + 1).padStart(2, '0') }}</div>
            <div>
              <h3 class="font-medium">{{ g.title }}</h3>
              <p class="mt-1 text-sm text-ink/60 leading-relaxed">{{ g.desc }}</p>
            </div>
          </div>
        </div>

        <div class="mt-6 border border-line bg-surface p-5">
          <div class="font-mono text-[10px] tracking-[0.3em] text-ink/40 mb-2">— 已成交 —</div>
          <p class="text-sm text-ink/70 leading-relaxed">
            首批 3 单人工成交、合计 ¥10,400, 覆盖电商投流素材 / 情感短片 / 技能培训。
            每单都按上面的担保机制走: 定金托管、样片先行、验收放款。
          </p>
        </div>
      </div>
    </section>

    <!-- ============ 留资表单 ============ -->
    <section ref="formRef" class="bg-ink text-cream scroll-mt-4">
      <div class="max-w-xl mx-auto px-5 py-10 md:py-14">
        <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-2">— 30 秒, 留个需求 —</div>
        <h2 class="font-display text-3xl md:text-4xl">免费领创意脚本</h2>
        <p class="mt-2 text-sm text-cream/60">说清楚产品和投放渠道, 当天给创意方向。</p>

        <!-- 成功态 -->
        <div v-if="submitted" class="mt-8 border border-gold/50 p-8 text-center">
          <div class="font-display text-3xl text-gold mb-3">已收到 ✓</div>
          <p class="text-sm text-cream/70 leading-relaxed">
            商务将在 <span class="text-cream font-medium">2 小时内</span>联系你 (工作日 10:00–19:00)。
            着急可直接加企微 <span class="font-mono text-gold">{{ WECHAT_ID }}</span>。
          </p>
        </div>

        <form v-else class="mt-8 space-y-4" @submit.prevent="submit">
          <!-- 意向档位 (SKU 卡片 CTA 带入, 可改) -->
          <div>
            <label class="block font-mono text-[10px] tracking-[0.2em] text-cream/50 mb-2">意向档位</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="s in skus"
                :key="s.tier"
                type="button"
                class="px-3 py-1.5 text-xs border rounded-full transition"
                :class="intentTier === s.tier
                  ? 'bg-gold text-ink border-gold'
                  : 'border-cream/30 text-cream/60 hover:border-cream'"
                @click="intentTier = s.tier"
              >{{ s.name }} ¥{{ s.price.toLocaleString('zh-CN') }}</button>
            </div>
          </div>

          <div>
            <label class="block font-mono text-[10px] tracking-[0.2em] text-cream/50 mb-2">称呼 *</label>
            <input
              v-model="form.name"
              required
              placeholder="如: 张总"
              class="w-full px-4 py-3.5 bg-cream/10 border border-cream/25 text-cream placeholder:text-cream/30 focus:border-gold focus:outline-none transition"
            />
          </div>

          <div>
            <label class="block font-mono text-[10px] tracking-[0.2em] text-cream/50 mb-2">手机号或微信号 *</label>
            <input
              v-model="form.contact"
              required
              placeholder="11 位手机号, 或你的微信号"
              class="w-full px-4 py-3.5 bg-cream/10 border border-cream/25 text-cream placeholder:text-cream/30 focus:border-gold focus:outline-none transition font-mono"
            />
          </div>

          <div>
            <label class="block font-mono text-[10px] tracking-[0.2em] text-cream/50 mb-2">一句话需求 *</label>
            <textarea
              v-model="form.message"
              rows="3"
              required
              placeholder="如: 天猫女装店, 想要一条抖音投流的产品视频"
              class="w-full px-4 py-3.5 bg-cream/10 border border-cream/25 text-cream placeholder:text-cream/30 focus:border-gold focus:outline-none transition"
            />
          </div>

          <div v-if="error" class="p-3 border border-danger/50 bg-danger/10 text-danger text-sm">{{ error }}</div>

          <button
            type="submit"
            :disabled="submitting"
            class="w-full py-4 bg-gold text-ink text-base font-medium rounded-full hover:bg-cream transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ submitting ? '提交中…' : '提交, 等商务联系我' }}
          </button>
          <p class="text-center text-xs text-cream/40">提交即视为同意我们就本次需求与你联系</p>
        </form>

        <!-- 辅助 CTA: 企微 -->
        <div class="mt-8 border border-cream/20 p-5 flex items-center justify-between gap-4">
          <div>
            <div class="font-mono text-[10px] tracking-[0.2em] text-cream/50 mb-1">不想填表? 直接加企微</div>
            <div class="font-mono text-lg text-gold">{{ WECHAT_ID }}</div>
          </div>
          <button
            class="flex-none px-5 py-2.5 border border-gold text-gold rounded-full text-sm hover:bg-gold hover:text-ink transition"
            @click="copyWechat"
          >{{ copied ? '已复制 ✓' : '复制微信号' }}</button>
        </div>
      </div>
    </section>

    <!-- 移动端悬浮 CTA (提交成功后隐藏) -->
    <div
      v-if="!submitted"
      class="fixed bottom-0 inset-x-0 z-50 md:hidden bg-ink/95 backdrop-blur border-t border-cream/15 px-4 py-3"
    >
      <button
        class="w-full py-3.5 bg-gold text-ink text-base font-medium rounded-full"
        @click="scrollToForm"
      >免费领创意脚本 · ¥2,999 起</button>
    </div>
    <!-- 给悬浮条让出底部空间 -->
    <div v-if="!submitted" class="h-16 md:hidden" />

  </div>
</template>
