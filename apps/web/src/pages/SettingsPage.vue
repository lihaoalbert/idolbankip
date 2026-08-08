<script setup lang="ts">
/**
 * SettingsPage — 个人设置 · 头像 / 昵称 / 简介 / 密码
 * 路径: /settings
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import { updateMyProfile, changePassword, getAvatarPolicy, ossUrl } from '@/api/client';

const router = useRouter();
const auth = useAuthStore();
const toast = useToast();
const today = new Date().toISOString().slice(0, 10);

const form = ref({
  displayName: auth.user?.displayName ?? '',
  bio: auth.user?.bio ?? '',
});
const profileSaving = ref(false);

async function saveProfile() {
  profileSaving.value = true;
  try {
    const updated = await updateMyProfile({
      displayName: form.value.displayName,
      bio: form.value.bio,
    });
    auth.user = { ...auth.user, ...updated };
    toast.success('资料已保存');
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '保存失败');
  } finally {
    profileSaving.value = false;
  }
}

const avatarInput = ref<HTMLInputElement | null>(null);
const avatarUploading = ref(false);

async function onAvatarChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast.error('头像不能超过 5MB');
    input.value = '';
    return;
  }
  if (file.size < 100 * 1024) {
    toast.error('头像至少 100KB');
    input.value = '';
    return;
  }
  avatarUploading.value = true;
  try {
    const policy = await getAvatarPolicy(file.name, file.size);
    const formData = new FormData();
    formData.append('key', policy.key);
    formData.append('policy', policy.policy);
    formData.append('OSSAccessKeyId', policy.accessKeyId);
    formData.append('signature', policy.signature);
    formData.append('file', file);
    const res = await fetch(policy.host, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`OSS 上传失败: ${res.status}`);
    const updated = await updateMyProfile({ avatarUrl: policy.key });
    auth.user = { ...auth.user, ...updated };
    toast.success('头像已更新');
  } catch (e: any) {
    toast.error(e?.message ?? '上传失败');
  } finally {
    avatarUploading.value = false;
    input.value = '';
  }
}

async function removeAvatar() {
  if (!confirm('确认移除头像?')) return;
  try {
    const updated = await updateMyProfile({ avatarUrl: '' });
    auth.user = { ...auth.user, ...updated };
    toast.success('头像已移除');
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? '移除失败');
  }
}

const pwd = ref({ old: '', new: '', confirm: '' });
const pwdSaving = ref(false);

async function onChangePassword() {
  if (pwd.value.new !== pwd.value.confirm) {
    toast.error('两次输入的新密码不一致');
    return;
  }
  if (pwd.value.new.length < 8) {
    toast.error('新密码至少 8 位');
    return;
  }
  pwdSaving.value = true;
  try {
    await changePassword(pwd.value.old, pwd.value.new);
    toast.success('密码已修改 · 请重新登录');
    setTimeout(() => auth.logout(), 1500);
  } catch (e: any) {
    const msg = e?.response?.data?.message;
    toast.error(Array.isArray(msg) ? msg.join('; ') : (msg ?? '修改失败'));
  } finally {
    pwdSaving.value = false;
  }
}
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">IBIren · PERSONAL DOSSIER</div>
        <div class="catalog-no text-ink/40">VOL. II — SETTINGS</div>
        <div class="catalog-no text-ink/30">{{ today }}</div>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-6 py-12">

      <button @click="router.back()" class="catalog-no text-ink/50 hover:text-gold mb-6 inline-flex items-center gap-2">
        <span>←</span><span>RETURN</span>
      </button>

      <div class="mb-10">
        <div class="catalog-no text-ink/50 mb-2">№ 200 · PERSONAL DOSSIER</div>
        <h1 class="font-display text-4xl md:text-5xl text-ink leading-[0.95]">
          个人设置<span class="font-display-italic text-gold">.</span>
        </h1>
        <p class="mt-4 text-sm text-ink/60 leading-relaxed max-w-md">
          管理你的头像、昵称、简介和登录密码 ·
          修改密码后其他设备将自动登出。
        </p>
      </div>

      <!-- § 01 头像 -->
      <section class="bg-surface border-0.5 border-ink p-8 md:p-10 relative mb-8">
        <div class="absolute -top-3 left-8">
          <div class="stamp text-gold bg-cream">01 · AVATAR</div>
        </div>

        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div class="relative w-24 h-24 md:w-28 md:h-28 shrink-0">
            <div class="absolute inset-0 border-0.5 border-gold pointer-events-none"></div>
            <img
              v-if="auth.user?.avatarUrl"
              :src="ossUrl(auth.user.avatarUrl)"
              :alt="auth.user.displayName"
              class="w-full h-full object-cover border-0.5 border-ink"
              referrerpolicy="no-referrer"
            />
            <div
              v-else
              class="w-full h-full bg-ink text-cream flex items-center justify-center font-display text-3xl border-0.5 border-ink"
            >
              {{ auth.user?.displayName?.slice(0, 1) }}
            </div>
            <span
              v-if="avatarUploading"
              class="absolute inset-0 bg-ink/70 text-cream flex items-center justify-center text-xs font-mono"
            >上传中…</span>
          </div>

          <div class="flex-1 min-w-0">
            <div class="text-sm text-ink mb-1">更换头像</div>
            <div class="text-xs text-ink/50 mb-4">
              建议正方形 · 100KB-5MB · jpg/png/webp
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <input
                ref="avatarInput"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="hidden"
                @change="onAvatarChange"
              />
              <button
                type="button"
                @click="avatarInput?.click()"
                :disabled="avatarUploading"
                class="px-5 py-2 border-0.5 border-ink hover:bg-ink hover:text-cream transition catalog-no text-xs disabled:opacity-50"
              >
                {{ auth.user?.avatarUrl ? '更换头像' : '上传头像' }}
              </button>
              <button
                v-if="auth.user?.avatarUrl"
                type="button"
                @click="removeAvatar"
                :disabled="avatarUploading"
                class="px-5 py-2 border-0.5 border-line text-ink/60 hover:border-danger hover:text-danger transition catalog-no text-xs disabled:opacity-50"
              >
                移除
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- § 02 昵称 + 简介 -->
      <section class="bg-surface border-0.5 border-ink p-8 md:p-10 relative mb-8">
        <div class="absolute -top-3 left-8">
          <div class="stamp text-gold bg-cream">02 · PROFILE</div>
        </div>

        <form @submit.prevent="saveProfile" class="space-y-6">
          <div>
            <label class="catalog-no text-ink/60 block mb-2">DISPLAY NAME · 昵称</label>
            <input
              v-model="form.displayName"
              required
              maxlength="40"
              class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm"
            />
          </div>

          <div>
            <label class="catalog-no text-ink/60 block mb-2">
              BIO · 个人简介
              <span class="text-ink/30">(选填, ≤500 字)</span>
            </label>
            <textarea
              v-model="form.bio"
              rows="4"
              maxlength="500"
              placeholder="一句话介绍你 · 风格 / 专注领域 / 作品方向"
              class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-sans text-sm resize-none"
            ></textarea>
            <div class="text-[10px] text-ink/40 text-right mt-1 font-mono">{{ (form.bio ?? '').length }}/500</div>
          </div>

          <div class="flex justify-end">
            <button
              type="submit"
              :disabled="profileSaving"
              class="px-6 py-2.5 bg-ink text-cream hover:bg-gold transition catalog-no text-xs disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <span>{{ profileSaving ? '保存中…' : '保存资料' }}</span>
              <span class="font-display-italic">→</span>
            </button>
          </div>
        </form>
      </section>

      <!-- § 03 修改密码 -->
      <section class="bg-surface border-0.5 border-ink p-8 md:p-10 relative">
        <div class="absolute -top-3 left-8">
          <div class="stamp text-gold bg-cream">03 · SECURITY</div>
        </div>

        <div class="text-xs text-ink/50 mb-6 leading-relaxed">
          修改成功后,其他设备的登录状态将自动失效,需要使用新密码重新登录。
        </div>

        <form @submit.prevent="onChangePassword" class="space-y-6">
          <div>
            <label class="catalog-no text-ink/60 block mb-2">CURRENT PASSWORD · 当前密码</label>
            <input
              v-model="pwd.old"
              type="password"
              required
              autocomplete="current-password"
              class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm"
            />
          </div>

          <div>
            <label class="catalog-no text-ink/60 block mb-2">NEW PASSWORD · 新密码 (≥8 位)</label>
            <input
              v-model="pwd.new"
              type="password"
              required
              minlength="8"
              autocomplete="new-password"
              class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm"
            />
          </div>

          <div>
            <label class="catalog-no text-ink/60 block mb-2">CONFIRM · 确认新密码</label>
            <input
              v-model="pwd.confirm"
              type="password"
              required
              minlength="8"
              autocomplete="new-password"
              class="w-full px-4 py-3 bg-cream border-0.5 border-line focus:border-ink focus:outline-none transition font-mono text-sm"
            />
          </div>

          <div class="flex justify-end">
            <button
              type="submit"
              :disabled="pwdSaving"
              class="px-6 py-2.5 bg-ink text-cream hover:bg-gold transition catalog-no text-xs disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <span>{{ pwdSaving ? '提交中…' : '修改密码' }}</span>
              <span class="font-display-italic">→</span>
            </button>
          </div>
        </form>
      </section>
    </main>

    <footer class="hairline-t border-line mt-12">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. SETTINGS-200</span>
        <span>SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>
