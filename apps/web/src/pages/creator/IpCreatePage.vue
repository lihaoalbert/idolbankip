<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiClient } from '@/api/client';

const router = useRouter();
const form = ref({
  displayName: '',
  tagline: '',
  description: '',
  gender: 'female',
  visualAgeBucket: 'young',
  styleTags: [] as string[],
  scenarioTags: [] as string[],
  depositPriceFen: 19900,
  fullLicensePriceFen: 300000,
});
const error = ref('');
const submitting = ref(false);

const styleOptions = ['现代', '古风', '赛博', '二次元', '民国', '未来', '复古'];
const scenarioOptions = ['短剧群演', '短剧主演', '品牌代言', '平面模特', '游戏角色', '直播', '广告'];

function toggle(arr: string[], v: string) {
  const i = arr.indexOf(v);
  if (i === -1) arr.push(v); else arr.splice(i, 1);
}

async function submit() {
  error.value = '';
  if (form.value.styleTags.length === 0) { error.value = '请至少选择一个风格'; return; }
  if (form.value.scenarioTags.length === 0) { error.value = '请至少选择一个应用场景'; return; }
  submitting.value = true;
  try {
    const { data } = await apiClient.post('/ips', form.value);
    router.push(`/creator/ips/${data.ip.id}`);
  } catch (e: any) {
    error.value = e?.response?.data?.message || '创建失败';
  } finally { submitting.value = false; }
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-6 py-10">
    <RouterLink to="/creator" class="text-xs text-ink/50 hover:text-ink mb-4 inline-block">← 返回创作者中心</RouterLink>
    <h1 class="font-display text-3xl mb-2">新建 IP</h1>
    <p class="text-sm text-ink/60 mb-8">填写基础信息后,下一步上传资产包</p>

    <form @submit.prevent="submit" class="bg-white rounded-2xl border border-line p-6 space-y-5">
      <div>
        <label class="text-xs text-ink/60 block mb-1">IP 名称 (暂定名)</label>
        <input v-model="form.displayName" required class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" />
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-1">一句话简介</label>
        <input v-model="form.tagline" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" placeholder="如：都市冷感御姐，平面/短剧双栖" />
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-1">人物小传 (Markdown)</label>
        <textarea v-model="form.description" rows="6" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold font-mono text-sm"></textarea>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-ink/60 block mb-1">性别</label>
          <select v-model="form.gender" class="w-full px-3 py-2 border border-line rounded-lg bg-cream">
            <option value="female">女</option>
            <option value="male">男</option>
            <option value="nonbinary">无性别</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-ink/60 block mb-1">视觉年龄</label>
          <select v-model="form.visualAgeBucket" class="w-full px-3 py-2 border border-line rounded-lg bg-cream">
            <option value="child">童</option>
            <option value="young">青</option>
            <option value="middle">中</option>
            <option value="old">老</option>
          </select>
        </div>
      </div>

      <div>
        <label class="text-xs text-ink/60 block mb-2">风格 (至少 1 个)</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="s in styleOptions"
            :key="s"
            type="button"
            @click="toggle(form.styleTags, s)"
            :class="form.styleTags.includes(s) ? 'bg-ink text-cream' : 'bg-cream text-ink/60 border border-line'"
            class="px-3 py-1.5 text-xs rounded-full"
          >{{ s }}</button>
        </div>
      </div>

      <div>
        <label class="text-xs text-ink/60 block mb-2">应用场景 (至少 1 个)</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="s in scenarioOptions"
            :key="s"
            type="button"
            @click="toggle(form.scenarioTags, s)"
            :class="form.scenarioTags.includes(s) ? 'bg-ink text-cream' : 'bg-cream text-ink/60 border border-line'"
            class="px-3 py-1.5 text-xs rounded-full"
          >{{ s }}</button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-ink/60 block mb-1">意向金 (元)</label>
          <input v-model.number="form.depositPriceFen" type="number" min="0" step="100" class="w-full px-3 py-2 border border-line rounded-lg bg-cream" />
          <div class="text-[10px] text-ink/40 mt-1">默认 199 元 = 19900 分</div>
        </div>
        <div>
          <label class="text-xs text-ink/60 block mb-1">正式授权起价 (元)</label>
          <input v-model.number="form.fullLicensePriceFen" type="number" min="0" step="100" class="w-full px-3 py-2 border border-line rounded-lg bg-cream" />
        </div>
      </div>

      <div v-if="error" class="p-3 bg-danger/10 text-danger text-sm rounded-lg">{{ error }}</div>

      <button
        type="submit"
        :disabled="submitting"
        class="w-full py-3 bg-ink text-cream rounded-full font-medium hover:bg-gold transition disabled:opacity-50"
      >
        {{ submitting ? '创建中...' : '创建并上传资产包' }}
      </button>
    </form>
  </div>
</template>