<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ossUrl } from '@/api/client';
import BecomeCreatorLink from '@/components/BecomeCreatorLink.vue';

/**
 * 案例集 — 平台认证工作室的交付实物
 * 为 h1 假设验证服务: 销售跟客户谈 SKU 时, 现场打开本页放片。
 * 视频托管在 OSS public bucket `cases/` 前缀, 由 EC2 端一次性同步 (2026-07-24)。
 */

interface CaseWork {
  src: string;
  title: string;
  meta: string;
  cat: '商业广告' | '剧情短片' | '动画';
}

const WORKS: CaseWork[] = [
  { src: '03-golf-shoes',    title: '《一双舒服的鞋》', meta: '商业广告 · 横屏 0:34',   cat: '商业广告' },
  { src: '04-boss-shoes',    title: '《大佬带货》',     meta: '剧情带货 · 竖屏 1:29',   cat: '商业广告' },
  { src: '02-huaxing',       title: '《化形》',         meta: 'AI 真人玄幻剧 · 横屏 6:20', cat: '剧情短片' },
  { src: '05-mansion-night', title: '《深宅夜宴》',     meta: '古装剧情 · 横屏 0:56',   cat: '剧情短片' },
  { src: '07-jade-disc',     title: '《完璧归赵》',     meta: '历史短剧 · 竖屏 0:53',   cat: '剧情短片' },
  { src: '06-one-cart-bricks', title: '《一车砖》',     meta: '写实情感 · 4:3 画幅 1:19', cat: '剧情短片' },
  { src: '01-coffee-voyage', title: '《咖啡豆环游记》', meta: '3D 卡通 IP · 竖屏 1:06', cat: '动画' },
  { src: '08-elevator-home', title: '《回家的电梯》',   meta: '粘土动画 · 横屏 1:56',   cat: '动画' },
];

const FILTERS = ['全部', '商业广告', '剧情短片', '动画'] as const;
const activeFilter = ref<(typeof FILTERS)[number]>('全部');
const filtered = computed(() =>
  activeFilter.value === '全部' ? WORKS : WORKS.filter((w) => w.cat === activeFilter.value),
);

function videoUrl(src: string): string {
  return ossUrl(`cases/${src}.mp4`);
}
function posterUrl(src: string): string {
  return ossUrl(`cases/${src}.jpg`);
}

/* ---------- 悬停预览 (仅桌面) ---------- */
const canHover = window.matchMedia('(hover: hover)').matches;

function onEnter(e: MouseEvent) {
  if (!canHover) return;
  const v = (e.currentTarget as HTMLElement).querySelector('video');
  if (!v) return;
  if (!v.getAttribute('src')) v.src = v.dataset.src!;
  v.play().catch(() => {});
}
function onLeave(e: MouseEvent) {
  if (!canHover) return;
  const v = (e.currentTarget as HTMLElement).querySelector('video');
  if (!v) return;
  v.pause();
  v.currentTime = 0;
}

/* ---------- 播放弹层 (自绘控件: app.css 全局隐藏了原生 controls) ---------- */
const active = ref<CaseWork | null>(null);
const playerVideo = ref<HTMLVideoElement | null>(null);
const playing = ref(false);
const current = ref(0);
const duration = ref(0);

function open(w: CaseWork) {
  active.value = w;
}
function close() {
  const v = playerVideo.value;
  if (v) {
    v.pause();
    v.removeAttribute('src');
    v.load();
  }
  active.value = null;
  playing.value = false;
  current.value = 0;
  duration.value = 0;
}
function toggle() {
  const v = playerVideo.value;
  if (!v) return;
  if (v.paused) v.play().catch(() => {});
  else v.pause();
}
function onSeek(e: Event) {
  const v = playerVideo.value;
  if (!v || !v.duration) return;
  const ratio = Number((e.target as HTMLInputElement).value) / 1000;
  v.currentTime = v.duration * ratio;
}
function onTime() {
  const v = playerVideo.value;
  if (!v) return;
  current.value = v.currentTime;
  duration.value = v.duration || 0;
  playing.value = !v.paused;
}
function fmt(t: number): string {
  if (!Number.isFinite(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}
watch(active, (v) => {
  document.body.style.overflow = v ? 'hidden' : '';
  if (v) window.addEventListener('keydown', onKey);
  else window.removeEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.body.style.overflow = '';
  window.removeEventListener('keydown', onKey);
});

const steps = [
  { title: '聊需求', desc: '说清楚产品、受众和投放渠道, 当天给出创意方向和参考风格。' },
  { title: '出样片', desc: '先出 10–15 秒样片确认感觉。不满意免费换方向, 仍不满意退全部定金。' },
  { title: '交成片', desc: '对照验收清单逐项过, 横屏竖屏多尺寸一次交付, 直接投放各平台。' },
];
</script>

<template>
  <div class="bg-cream">

    <!-- 顶部标识条 -->
    <section class="border-b border-line">
      <div class="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between text-[10px] md:text-xs tracking-[0.2em] text-ink/50 font-mono">
        <span>CASE FILES</span>
        <span class="hidden md:inline">认证工作室 · 全 AI 制作</span>
        <span>VOL. 01 · 2026</span>
      </div>
    </section>

    <!-- 页头 -->
    <section class="border-b border-line">
      <div class="max-w-7xl mx-auto px-6 pt-14 pb-12 md:pt-20 md:pb-16">
        <div class="font-mono text-[10px] md:text-xs tracking-[0.2em] text-ink/40 mb-8">
          — 你看到的每一条, 都是某个 SKU 档位的交付标准
        </div>
        <h1 class="font-display text-4xl sm:text-5xl md:text-6xl leading-[1.08] tracking-tight text-ink max-w-4xl">
          案例集。
          <span class="text-ink/30">先看货,</span><br />
          <span class="italic text-gold">再下单。</span>
        </h1>
        <p class="mt-6 text-base md:text-lg text-ink/60 leading-relaxed max-w-2xl">
          以下作品全部由平台认证工作室 <span class="text-ink/85">LuckyNemo Studio</span> 全 AI 制作。
          商业广告档位的客户, 重点看《一双舒服的鞋》和《大佬带货》——
          这就是 ¥2,999 能买到的质量。
        </p>
      </div>
    </section>

    <!-- 作品栅格 -->
    <section class="border-b border-line">
      <div class="max-w-7xl mx-auto px-6 py-12 md:py-16">

        <div class="flex flex-wrap items-center gap-2 mb-8">
          <button
            v-for="f in FILTERS"
            :key="f"
            class="px-4 py-1.5 text-sm border rounded-full transition"
            :class="activeFilter === f
              ? 'bg-ink text-cream border-ink'
              : 'border-line text-ink/60 hover:border-ink hover:text-ink'"
            @click="activeFilter = f"
          >{{ f }}</button>
          <span class="ml-auto font-mono text-xs text-ink/40">{{ filtered.length }} 条</span>
        </div>

        <div class="columns-1 sm:columns-2 lg:columns-3 gap-5">
          <article
            v-for="w in filtered"
            :key="w.src"
            class="break-inside-avoid mb-5 group"
          >
            <div
              class="relative bg-surface border border-line overflow-hidden cursor-pointer group-hover:border-gold transition"
              role="button"
              tabindex="0"
              :aria-label="`播放 ${w.title}`"
              @click="open(w)"
              @keydown.enter.prevent="open(w)"
              @keydown.space.prevent="open(w)"
              @mouseenter="onEnter"
              @mouseleave="onLeave"
            >
              <video
                muted
                loop
                playsinline
                preload="none"
                :poster="posterUrl(w.src)"
                :data-src="videoUrl(w.src)"
                class="w-full h-auto block"
              />
              <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-none">
                <span class="w-14 h-14 flex items-center justify-center bg-ink/60 border border-cream/40 rounded-full">
                  <svg viewBox="0 0 16 16" class="w-4 h-4 fill-cream ml-0.5"><path d="M3 1.5v13l11-6.5z"/></svg>
                </span>
              </div>
              <div class="absolute top-2 left-2 font-mono text-[10px] tracking-widest text-cream/90 bg-ink/70 px-1.5 py-0.5">
                {{ w.cat }}
              </div>
            </div>
            <div class="pt-3 px-0.5">
              <h3 class="font-display text-lg text-ink group-hover:text-gold transition">{{ w.title }}</h3>
              <p class="font-mono text-xs text-ink/50 mt-0.5">{{ w.meta }}</p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- 合作流程 -->
    <section class="border-b border-line bg-surface">
      <div class="max-w-7xl mx-auto px-6 py-16 md:py-20">
        <div class="mb-10 md:mb-14">
          <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-3">— 流程 —</div>
          <h2 class="font-display text-4xl md:text-5xl">怎么合作</h2>
          <p class="text-sm text-ink/50 mt-2 font-mono tracking-wide">样片不满意, 退全部定金</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-px bg-line border border-line">
          <div v-for="(s, i) in steps" :key="i" class="bg-surface p-6 md:p-8">
            <div class="flex items-baseline justify-between mb-6">
              <div class="font-mono text-[10px] tracking-[0.3em] text-ink/30">STEP</div>
              <div class="font-display text-3xl text-gold">{{ String(i + 1).padStart(2, '0') }}</div>
            </div>
            <h3 class="font-display text-xl md:text-2xl mb-3 text-ink">{{ s.title }}</h3>
            <p class="text-sm text-ink/60 leading-relaxed">{{ s.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="bg-ink text-cream">
      <div class="max-w-7xl mx-auto px-6 py-16 md:py-24">
        <div class="font-mono text-[10px] tracking-[0.3em] text-gold mb-6">— 想做一条? —</div>
        <div class="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <h2 class="font-display text-4xl md:text-5xl leading-tight mb-6">
              尝鲜版 ¥2,999 起。<br />
              <span class="text-gold italic">样片不满意,</span><br />
              退全部定金。
            </h2>
            <p class="text-cream/60 leading-relaxed max-w-md mb-6">
              留个联系方式, 说清楚产品和投放渠道, 当天给创意方向。
              定金走平台托管, 验收通过才结算给制作方。
            </p>
            <RouterLink
              to="/contact"
              class="inline-block px-7 py-3.5 bg-gold text-ink rounded-full font-medium hover:bg-cream transition"
            >留个需求 →</RouterLink>
          </div>
          <div class="border border-cream/20 p-6 md:p-8">
            <div class="font-mono text-[10px] tracking-[0.3em] text-gold/80 mb-3">— 供给端 —</div>
            <h3 class="font-display text-2xl md:text-3xl leading-tight mb-4">你是 AIGC 工作室?</h3>
            <p class="text-cream/70 leading-relaxed mb-6">
              平台按统一标准派单: 需求写死、验收清单写死、结算平台担保。
              你只管做出这个页面里的质量。
            </p>
            <BecomeCreatorLink
              class="inline-block px-6 py-3 border border-gold text-gold rounded-full hover:bg-gold hover:text-ink transition"
            >申请入驻 →</BecomeCreatorLink>
          </div>
        </div>
      </div>
    </section>

    <!-- 播放弹层 -->
    <Teleport to="body">
      <div
        v-if="active"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-ink/95 p-4 md:p-10"
        role="dialog"
        aria-modal="true"
        aria-label="播放作品"
        @click.self="close"
      >
        <div class="w-full max-w-4xl">
          <div class="flex items-center justify-between mb-3">
            <p class="font-mono text-xs text-cream/70">{{ active.title }} · {{ active.meta }}</p>
            <button
              class="w-9 h-9 flex items-center justify-center border border-cream/30 text-cream hover:border-cream transition"
              aria-label="关闭"
              @click="close"
            >
              <svg viewBox="0 0 14 14" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l12 12M13 1L1 13"/></svg>
            </button>
          </div>
          <video
            ref="playerVideo"
            :src="videoUrl(active.src)"
            :poster="posterUrl(active.src)"
            playsinline
            autoplay
            class="w-full max-h-[70vh] bg-black cursor-pointer"
            @click="toggle"
            @timeupdate="onTime"
            @play="onTime"
            @pause="onTime"
            @loadedmetadata="onTime"
            @ended="playing = false"
          />
          <!-- 自绘控件条 -->
          <div class="flex items-center gap-3 mt-3">
            <button
              class="w-9 h-9 flex-none flex items-center justify-center border border-cream/30 text-cream hover:border-cream transition"
              :aria-label="playing ? '暂停' : '播放'"
              @click="toggle"
            >
              <svg v-if="!playing" viewBox="0 0 16 16" class="w-3.5 h-3.5 fill-cream ml-0.5"><path d="M3 1.5v13l11-6.5z"/></svg>
              <svg v-else viewBox="0 0 16 16" class="w-3.5 h-3.5 fill-cream"><path d="M3 2h4v12H3zM9 2h4v12H9z"/></svg>
            </button>
            <input
              type="range"
              min="0"
              max="1000"
              :value="duration ? Math.round((current / duration) * 1000) : 0"
              class="flex-1 accent-gold"
              aria-label="播放进度"
              @input="onSeek"
            />
            <span class="font-mono text-xs text-cream/70 tabular-nums flex-none">
              {{ fmt(current) }} / {{ fmt(duration) }}
            </span>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>
