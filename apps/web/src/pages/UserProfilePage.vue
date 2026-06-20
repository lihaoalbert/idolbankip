<script setup lang="ts">
/**
 * UserProfilePage — 公开个人主页
 * 路径: /u/:userId
 *
 * 数据来源: GET /api/v1/users/:userId/profile (公开)
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getUserProfile, type UserProfileData, ossUrl as _unused } from '@/api/client';
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
</script>

<template>
  <div class="user-profile-page">
    <div v-if="loading" class="loading">加载中...</div>

    <div v-else-if="notFound" class="empty">
      <h2>找不到这个用户</h2>
      <p>可能链接已失效, 或用户已注销。</p>
    </div>

    <div v-else-if="error" class="empty">
      <h2>加载失败</h2>
      <p>{{ error }}</p>
      <button @click="load(true)">重试</button>
    </div>

    <template v-else-if="data">
      <!-- 头部 -->
      <header class="profile-header">
        <div class="avatar-wrap">
          <img
            v-if="data.user.avatarUrl"
            :src="data.user.avatarUrl"
            :alt="data.user.displayName"
            class="avatar"
          />
          <div v-else class="avatar placeholder">
            {{ data.user.displayName.slice(0, 1) }}
          </div>
        </div>
        <div class="meta">
          <h1 class="name">{{ data.user.displayName }}</h1>
          <p v-if="data.user.bio" class="bio">{{ data.user.bio }}</p>
          <p v-else class="bio muted">这位捏脸师还没有写简介 ✍️</p>
          <div class="chips">
            <HonorChip :level="data.honor.level" variant="block" />
            <HonorStreakChip :current="data.honor.streak.current" :longest="data.honor.streak.longest" />
            <span class="total-points">💰 {{ data.honor.totalPoints.toLocaleString() }} 捏脸币</span>
          </div>
          <p class="joined">加入于 {{ fmtDate(data.user.createdAt) }} · 共 {{ data.honor.streak.totalDays }} 天活跃</p>
        </div>
      </header>

      <!-- 数据看板 -->
      <section class="stats">
        <div class="stat">
          <div class="num">{{ data.stats.ipCount }}</div>
          <div class="label">手下 IP</div>
        </div>
        <div class="stat">
          <div class="num">{{ data.stats.totalViews.toLocaleString() }}</div>
          <div class="label">总浏览</div>
        </div>
        <div class="stat">
          <div class="num">{{ data.stats.totalFavorites.toLocaleString() }}</div>
          <div class="label">总收藏</div>
        </div>
        <div class="stat">
          <div class="num">{{ data.badges.length }}</div>
          <div class="label">已获徽章</div>
        </div>
      </section>

      <!-- 徽章墙 -->
      <section v-if="data.badges.length" class="badges-section">
        <h2>🏅 已获徽章 ({{ data.badges.length }})</h2>
        <div class="badge-grid">
          <BadgeCard v-for="b in data.badges" :key="b.code" :badge="b" earned />
        </div>
      </section>

      <!-- IP 团队 -->
      <section v-if="data.ips.length" class="ips-section">
        <h2>🎨 手下 IP 团队</h2>
        <div class="ip-grid">
          <div
            v-for="ip in data.ips"
            :key="ip.id"
            class="ip-card"
            @click="goIp(ip.code)"
          >
            <div class="thumb">
              <img v-if="ip.thumbUrl" :src="ip.thumbUrl" :alt="ip.name" />
              <div v-else class="thumb-placeholder">无图</div>
            </div>
            <div class="ip-meta">
              <div class="ip-name">{{ ip.name }}</div>
              <div class="ip-code">{{ ip.code }}</div>
              <div class="ip-stats">
                <span>👁 {{ ip.viewCount }}</span>
                <span>⭐ {{ ip.favoriteCount }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <p v-if="!data.ips.length" class="empty-tip">这位捏脸师还没有公开作品</p>

      <p v-if="isSelf" class="hint">这是你的主页 — 让更多人通过 `/u/{{ data.user.id }}` 链接认识你 👋</p>
    </template>
  </div>
</template>

<style scoped>
.user-profile-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px;
  color: var(--color-text-primary);
}

.loading,
.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-secondary);
}
.empty h2 {
  margin: 0 0 8px;
  font-size: 20px;
}
.empty button {
  margin-top: 12px;
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-card-bg);
  cursor: pointer;
}

/* 头部 */
.profile-header {
  display: flex;
  gap: 24px;
  padding: 24px;
  background: var(--color-card-bg);
  border-radius: 16px;
  margin-bottom: 24px;
}
.avatar-wrap {
  flex-shrink: 0;
}
.avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}
.avatar.placeholder {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  font-size: 40px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.meta {
  flex: 1;
  min-width: 0;
}
.meta .name {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 600;
}
.bio {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}
.bio.muted {
  opacity: 0.6;
  font-style: italic;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}
.total-points {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #fef3c7, #fcd34d);
  color: #92400e;
  font-size: 13px;
  font-weight: 600;
}
.joined {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.75;
}

/* 数据看板 */
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}
.stat {
  background: var(--color-card-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px 12px;
  text-align: center;
}
.stat .num {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-accent, #6366f1);
  line-height: 1.2;
}
.stat .label {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

/* 徽章墙 */
.badges-section,
.ips-section {
  background: var(--color-card-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}
.badges-section h2,
.ips-section h2 {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
}
.badge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

/* IP 团队 */
.ip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.ip-card {
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--color-bg-secondary, transparent);
  transition: transform 0.15s, box-shadow 0.15s;
}
.ip-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.ip-card .thumb {
  aspect-ratio: 1;
  background: var(--color-bg-secondary);
  overflow: hidden;
}
.ip-card .thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.ip-meta {
  padding: 8px 10px;
}
.ip-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ip-code {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 1px;
}
.ip-stats {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.empty-tip {
  text-align: center;
  color: var(--color-text-secondary);
  padding: 40px;
}

.hint {
  margin-top: 24px;
  padding: 12px;
  text-align: center;
  background: var(--color-bg-secondary, rgba(99, 102, 241, 0.06));
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

@media (max-width: 640px) {
  .profile-header {
    flex-direction: column;
    text-align: center;
  }
  .meta .name,
  .chips {
    justify-content: center;
  }
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>