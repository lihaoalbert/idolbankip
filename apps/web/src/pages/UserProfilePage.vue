<script setup lang="ts">
/**
 * UserProfilePage — 公开个人主页 · ARCHIVE PORTRAIT
 * 路径: /u/:userId
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getUserProfile, type UserProfileData } from '@/api/client';
import HonorChip from '@/components/HonorChip.vue';
import HonorStreakChip from '@/components/HonorStreakChip.vue';
import BadgeCard from '@/components/BadgeCard.vue';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{ userId: string }>();

const router = useRouter();
const auth = useAuthStore();

const data = ref<UserProfileData | null>(null);
const loading = ref(true);
const notFound = ref(false);
const error = ref<string | null>(null);

async function load(force = false) {
  loading.value = true;
  notFound.value = false;
  error.value = null;
  try {
    data.value = await getUserProfile(props.userId);
  } catch (e: any) {
    if (e?.response?.status === 404) {
      notFound.value = true;
    } else {
      error.value = e?.message ?? '加载失败';
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());
watch(() => props.userId, () => load());

const isSelf = computed(() => auth.user?.id === props.userId);

function goIp(code: string) {
  router.push({ name: 'ip-detail', params: { code } });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function shortId(id: string, len = 8): string {
  return id ? id.slice(-len).toUpperCase() : '—';
}
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <!-- 顶部条 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">IBIren · ARCHIVE PORTRAIT</div>
        <div class="catalog-no text-ink/40">VOL. I — CREATOR DOSSIER</div>
        <div class="catalog-no text-ink/30">{{ new Date().toISOString().slice(0, 10) }}</div>
      </div>
    </header>

    <main class="max-w-5xl mx-auto px-6 lg:px-10 py-10 md:py-14">
      <!-- 返回 — 公开页 (从任意位置点过来都行, router.back) -->
      <button @click="router.back()" class="catalog-no text-ink/50 hover:text-gold transition inline-flex items-center gap-2 mb-6">
        <span>←</span><span>RETURN</span>
      </button>

      <!-- Loading -->
      <div v-if="loading" class="py-24 text-center">
        <div class="catalog-no text-ink/40 mb-2">— LOADING PORTRAIT —</div>
        <div class="font-display text-lg text-ink/60">加载中…</div>
      </div>

      <!-- Not Found -->
      <div v-else-if="notFound" class="py-24 text-center bg-surface border-0.5 border-line">
        <div class="catalog-no text-ink/40 mb-3">— EXHIBIT MISSING —</div>
        <div class="font-display text-3xl text-ink mb-2">找不到这个用户</div>
        <p class="text-sm text-ink/60">可能链接已失效 · 或用户已注销</p>
        <RouterLink to="/" class="inline-flex items-center gap-2 mt-6 px-5 py-2 border-0.5 border-ink hover:bg-ink hover:text-cream transition catalog-no text-xs">
          <span>RETURN</span><span>回到首页 →</span>
        </RouterLink>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="py-24 text-center bg-surface border-0.5 border-danger/40">
        <div class="catalog-no text-danger mb-3">— ERROR —</div>
        <div class="font-display text-2xl text-ink mb-2">加载失败</div>
        <p class="text-sm text-ink/60 mb-6">{{ error }}</p>
        <button @click="load(true)" class="inline-flex items-center gap-2 px-5 py-2 bg-ink text-cream hover:bg-gold transition catalog-no text-xs">
          <span>RETRY</span><span>重试 →</span>
        </button>
      </div>

      <template v-else-if="data">
        <!-- 章节头 -->
        <div class="grid grid-cols-12 gap-4 mb-8">
          <div class="col-span-3 catalog-no text-ink/50">№ U-{{ shortId(data.user.id) }}</div>
          <div class="col-span-3 col-start-5 catalog-no text-ink/50">PORTRAIT · 个人档案</div>
          <div class="col-span-3 col-start-9 catalog-no text-ink/50">{{ data.honor.level.icon }} {{ data.honor.level.title }}</div>
          <div class="col-span-3 col-start-12 catalog-no text-ink/50 text-right hidden md:block">JOINED {{ fmtDate(data.user.createdAt) }}</div>
        </div>

        <!-- 头部 · 档案肖像 -->
        <header class="mb-12 bg-surface border-0.5 border-ink p-8 md:p-10 relative overflow-hidden">
          <div class="absolute top-4 right-4 stamp text-gold border-gold bg-cream">PORTRAIT</div>

          <div class="flex flex-col md:flex-row gap-8 items-start">
            <!-- 头像 -->
            <div class="shrink-0">
              <div class="relative w-32 h-32 md:w-40 md:h-40">
                <div class="absolute inset-0 border-0.5 border-gold"></div>
                <img
                  v-if="data.user.avatarUrl"
                  :src="data.user.avatarUrl"
                  :alt="data.user.displayName"
                  class="w-full h-full object-cover border-0.5 border-ink"
                />
                <div
                  v-else
                  class="w-full h-full bg-ink text-cream flex items-center justify-center font-display text-5xl"
                >
                  {{ data.user.displayName.slice(0, 1) }}
                </div>
                <span class="absolute -bottom-2 -right-2 catalog-no text-xs px-2 py-1 bg-gold text-ink">
                  № {{ shortId(data.user.id, 4) }}
                </span>
              </div>
            </div>

            <!-- 文字 -->
            <div class="flex-1 min-w-0">
              <div class="catalog-no text-ink/40 mb-2">CREATOR · 捏者</div>
              <h1 class="font-display text-4xl md:text-6xl text-ink leading-[0.95] mb-4">
                {{ data.user.displayName }}<span class="font-display-italic text-gold">.</span>
              </h1>

              <p v-if="data.user.bio" class="font-display-italic text-lg text-ink/70 leading-relaxed mb-6 max-w-xl">
                {{ data.user.bio }}
              </p>
              <p v-else class="text-sm text-ink/40 italic mb-6">这位捏者还没有写简介 ✍️</p>

              <div class="flex items-center gap-3 flex-wrap mb-4">
                <HonorChip :level="data.honor.level" variant="block" />
                <HonorStreakChip :current="data.honor.streak.current" :longest="data.honor.streak.longest" />
                <div class="flex items-baseline gap-2 px-4 py-2 bg-gold/10 border-0.5 border-gold/40">
                  <span class="font-display-italic text-gold text-xl">✦</span>
                  <span class="font-mono text-base">{{ data.honor.totalPoints.toLocaleString() }}</span>
                  <span class="catalog-no text-ink/60 text-[10px]">FACE-COIN</span>
                </div>
              </div>

              <p class="catalog-no text-xs text-ink/50">
                JOINED · 加入于 {{ fmtDate(data.user.createdAt) }} · 共 {{ data.honor.streak.totalDays }} 天活跃
              </p>
            </div>
          </div>
        </header>

        <!-- 数据看板 -->
        <section class="mb-12">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            — 01 — DOSSIER STATS · 数据看板
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-surface border-0.5 border-ink p-6 text-center relative">
              <div class="catalog-no text-ink/40 mb-2">IP COUNT</div>
              <div class="font-display text-4xl text-ink leading-none mb-1">{{ data.stats.ipCount }}</div>
              <div class="catalog-no text-xs text-ink/50">手下 IP</div>
            </div>
            <div class="bg-surface border-0.5 border-ink p-6 text-center relative">
              <div class="catalog-no text-ink/40 mb-2">VIEWS</div>
              <div class="font-display text-4xl text-ink leading-none mb-1">{{ data.stats.totalViews.toLocaleString() }}</div>
              <div class="catalog-no text-xs text-ink/50">总浏览</div>
            </div>
            <div class="bg-surface border-0.5 border-ink p-6 text-center relative">
              <div class="catalog-no text-ink/40 mb-2">FAVORITES</div>
              <div class="font-display text-4xl text-ink leading-none mb-1">{{ data.stats.totalFavorites.toLocaleString() }}</div>
              <div class="catalog-no text-xs text-ink/50">总收藏</div>
            </div>
            <div class="bg-surface border-0.5 border-ink p-6 text-center relative">
              <div class="catalog-no text-ink/40 mb-2">BADGES</div>
              <div class="font-display text-4xl text-gold leading-none mb-1">{{ data.badges.length }}</div>
              <div class="catalog-no text-xs text-ink/50">已获徽章</div>
            </div>
          </div>
        </section>

        <!-- 徽章墙 -->
        <section v-if="data.badges.length" class="mb-12">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            — 02 — BADGE WALL · 徽章墙 ({{ data.badges.length }})
          </div>
          <div class="bg-surface border-0.5 border-ink p-6 md:p-8">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <BadgeCard v-for="b in data.badges" :key="b.code" :badge="b" earned />
            </div>
          </div>
        </section>

        <!-- IP 团队 -->
        <section v-if="data.ips.length" class="mb-12">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            — 03 — IP COLLECTION · IP 团队 ({{ data.ips.length }})
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <article
              v-for="ip in data.ips"
              :key="ip.id"
              class="plate cursor-pointer group"
              @click="goIp(ip.code)"
            >
              <div class="plate-frame aspect-square bg-cream">
                <img v-if="ip.thumbUrl" :src="ip.thumbUrl" :alt="ip.name" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center catalog-no text-ink/30 text-xs">
                  NO PLATE
                </div>
              </div>
              <div class="mt-3">
                <div class="font-display text-base text-ink truncate group-hover:text-gold transition">{{ ip.name }}</div>
                <div class="catalog-no text-[10px] text-ink/40 mt-0.5">{{ ip.code }}</div>
                <div class="flex items-center gap-3 mt-2 catalog-no text-[10px] text-ink/50">
                  <span>👁 {{ ip.viewCount }}</span>
                  <span>⭐ {{ ip.favoriteCount }}</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        <!-- 空提示 -->
        <div v-if="!data.ips.length" class="py-20 text-center bg-surface border-0.5 border-line">
          <div class="catalog-no text-ink/40 mb-2">— NO PLATES —</div>
          <div class="font-display-italic text-xl text-ink/60">这位捏者还没有公开作品</div>
        </div>

        <!-- 自我提示 -->
        <div v-if="isSelf" class="mt-10 p-5 bg-gold/5 border-0.5 border-gold/30 flex items-start gap-3">
          <span class="font-display-italic text-gold text-2xl shrink-0">※</span>
          <div class="text-sm">
            <div class="catalog-no text-gold mb-1">YOUR PUBLIC PROFILE</div>
            这是你的公开主页 · 让更多人通过 <code class="font-mono text-xs">/u/{{ data.user.id }}</code> 链接认识你
          </div>
        </div>
      </template>
    </main>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line mt-12">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. PROFILE-U</span>
        <span>SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>
