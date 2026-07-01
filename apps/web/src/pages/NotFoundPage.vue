<script setup lang="ts">
import { useRoute } from 'vue-router';
const route = useRoute();
</script>

<template>
  <div class="min-h-[88vh] bg-cream paper-grain relative flex flex-col">

    <!-- 顶部条 · 像图录的书脊 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">ibi.ren · ARCHIVE DEPT.</div>
        <div class="catalog-no text-ink/40">VOL. I — ERROR · EXHIBIT</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <!-- 主区 -->
    <main class="flex-1 relative">
      <!-- 四角裁切标记 -->
      <span class="cropmark cropmark-tl"></span>
      <span class="cropmark cropmark-tr"></span>
      <span class="cropmark cropmark-bl"></span>
      <span class="cropmark cropmark-br"></span>

      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-20 md:py-28 grid grid-cols-12 gap-8 items-end relative z-10">

        <!-- 左侧 · 巨型编号 -->
        <div class="col-span-12 md:col-span-7">
          <div class="catalog-no text-ink/50 mb-6">PLATE № — MISSING</div>

          <div class="flex items-end gap-6">
            <div class="font-display text-[18vw] md:text-[14vw] leading-[0.85] text-ink">404</div>
            <div class="pb-6 md:pb-10">
              <div class="stamp text-danger">EXHIBIT WITHDRAWN</div>
            </div>
          </div>

          <h1 class="mt-8 font-display text-3xl md:text-4xl text-ink leading-tight max-w-xl">
            <span class="font-display-italic text-gold">作品已下架</span>,
            或从未在此档案中登记过。
          </h1>

          <p class="mt-5 text-base text-ink/60 max-w-lg leading-relaxed">
            您访问的路径 <span class="font-mono text-sm bg-surface px-2 py-0.5 border-0.5 border-line">{{ route.fullPath }}</span>
            在 ibi.ren 档案库中找不到对应条目。
            可能的原因:链接已过期、作品已下架,或您输错了编号。
          </p>

          <div class="mt-10 flex flex-wrap items-center gap-3">
            <RouterLink
              to="/"
              class="inline-flex items-center gap-3 px-6 py-3 bg-ink text-cream hover:bg-gold transition group"
            >
              <span class="catalog-no text-cream/70 group-hover:text-ink/70">RETURN</span>
              <span class="font-display">回到首页</span>
              <span class="font-display-italic">→</span>
            </RouterLink>
            <RouterLink
              to="/ips"
              class="inline-flex items-center gap-3 px-6 py-3 border-0.5 border-ink text-ink hover:bg-ink hover:text-cream transition"
            >
              <span class="catalog-no opacity-60">BROWSE</span>
              <span class="font-sans">浏览全部形象</span>
            </RouterLink>
          </div>
        </div>

        <!-- 右侧 · 档案备忘 -->
        <aside class="col-span-12 md:col-span-4 md:col-start-9 md:border-l-0.5 md:border-line md:pl-8">
          <div class="space-y-6">
            <div>
              <div class="catalog-no text-ink/50 mb-2">CATALOGUER'S NOTE</div>
              <p class="font-display-italic text-base text-ink/70 leading-relaxed">
                所有有效 IP 编号形如
                <span class="font-mono text-sm not-italic text-ink">IBI-2026-0133</span>,
                可在形象库按性别 / 年龄 / 种族 / 风格 / 场景筛选。
              </p>
            </div>

            <div class="hairline-t border-line pt-6">
              <div class="catalog-no text-ink/50 mb-2">SUGGESTED ROUTES</div>
              <ul class="space-y-2 font-mono text-xs uppercase tracking-widest">
                <li>
                  <RouterLink to="/ips" class="text-ink/70 hover:text-gold transition">
                    A · 形象库 CATALOGUE
                  </RouterLink>
                </li>
                <li>
                  <RouterLink to="/contact" class="text-ink/70 hover:text-gold transition">
                    B · 联系商务 CONTACT
                  </RouterLink>
                </li>
                <li>
                  <RouterLink to="/legal/originality-commitment" class="text-ink/70 hover:text-gold transition">
                    C · 原创承诺 DECLARATION
                  </RouterLink>
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </main>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line mt-12">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-6 grid grid-cols-12 gap-4 catalog-no text-ink/40">
        <div class="col-span-3">CAT. ERR-404</div>
        <div class="col-span-6 col-start-4">SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</div>
        <div class="col-span-3 col-start-10 text-right">© 2026 IBI.REN</div>
      </div>
    </footer>
  </div>
</template>
