<script setup lang="ts">
/**
 * #30 admin 任务中心 — 列表 + 发布
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiClient } from '@/api/client';

const router = useRouter();
// ok=false 表示错误, 控制台 + 屏幕顶部 banner (admin 没有 toast composable)
const formError = ref<string>('');
const formSuccess = ref<string>('');
function notify(msg: string, ok = true) {
  console.log(ok ? '✅' : '❌', msg);
  if (ok) { formSuccess.value = msg; formError.value = ''; }
  else { formError.value = msg; formSuccess.value = ''; }
}

const tasks = ref<any[]>([]);
const loading = ref(false);
const statusFilter = ref<string>(''); // '' = all

const showCreate = ref(false);
const submitting = ref(false);
const newTask = reactive({
  title: '',
  description: '',
  budgetYuan: 3600,
  perIpYuan: 100,
  maxAccepts: 10,
  deadlineAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  spec: {
    count: 36,
    gender: 'FEMALE' as 'FEMALE' | 'MALE' | 'NONBINARY' | '',
    ageBuckets: ['YOUNG'] as string[],
    ethnicities: ['EAST_ASIAN'] as string[],
    styleTags: ['现代'] as string[],
    scenarioTags: ['短剧(单集)'] as string[],
  },
});

const statusLabel: Record<string, string> = {
  OPEN: '招募中',
  CLOSED: '已关闭',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};
const statusColor: Record<string, string> = {
  OPEN: 'bg-success/15 text-success',
  CLOSED: 'bg-ink/10 text-ink/50',
  COMPLETED: 'bg-gold/15 text-gold',
  CANCELLED: 'bg-danger/15 text-danger',
};
const genderLabel: Record<string, string> = { FEMALE: '女', MALE: '男', NONBINARY: '无性别' };
const ageLabel: Record<string, string> = { CHILD: '童颜', YOUNG: '青年', MIDDLE: '中年', ELDERLY: '银发' };
const ethLabel: Record<string, string> = {
  EAST_ASIAN: '东亚', SOUTHEAST_ASIAN: '东南亚', SOUTH_ASIAN: '南亚',
  AFRICAN: '非洲', EUROPEAN: '欧洲', MIXED: '混合/其他',
};

const allGenders = ['FEMALE', 'MALE', 'NONBINARY'];
const allAges = ['CHILD', 'YOUNG', 'MIDDLE', 'ELDERLY'];
const allEths = ['EAST_ASIAN', 'SOUTHEAST_ASIAN', 'SOUTH_ASIAN', 'AFRICAN', 'EUROPEAN', 'MIXED'];
const allStyles = ['现代', '古风', '赛博', '二次元', '民国', '未来', '复古', '国潮', '日系', '韩系', '欧美', '港风'];
const allScenarios = ['短剧(单集)', '短剧(系列)', '品牌合作', '平面拍摄', '游戏角色', '直播', '广告', '电影角色', '电商模特', 'MV/短片'];

function toggle<T>(arr: T[], v: T) {
  const i = arr.indexOf(v);
  if (i === -1) arr.push(v); else arr.splice(i, 1);
}

async function load() {
  loading.value = true;
  try {
    const params = statusFilter.value ? `?status=${statusFilter.value}` : '';
    const { data } = await apiClient.get(`/admin/tasks${params}`);
    tasks.value = data || [];
  } catch (e: any) {
    notify(e?.response?.data?.message || '加载失败', false);
  } finally {
    loading.value = false;
  }
}

async function createTask() {
  if (!newTask.title || newTask.title.length < 3) {
    notify(`标题至少 3 字 (当前 ${newTask.title.length})`, false);
    return;
  }
  if (!newTask.description || newTask.description.length < 10) {
    notify(`描述至少 10 字 (当前 ${newTask.description.length})`, false);
    return;
  }
  if (newTask.spec.styleTags.length === 0) {
    notify('请至少选 1 个风格', false);
    return;
  }
  if (newTask.spec.scenarioTags.length === 0) {
    notify('请至少选 1 个场景', false);
    return;
  }
  formError.value = '';
  submitting.value = true;
  try {
    const payload: any = {
      title: newTask.title,
      description: newTask.description,
      spec: {
        count: newTask.spec.count,
        styleTags: newTask.spec.styleTags,
        scenarioTags: newTask.spec.scenarioTags,
      },
      budgetFen: Math.round(newTask.budgetYuan * 100),
      perIpFen: newTask.perIpYuan ? Math.round(newTask.perIpYuan * 100) : undefined,
      maxAccepts: newTask.maxAccepts,
      deadlineAt: new Date(newTask.deadlineAt).toISOString(),
    };
    if (newTask.spec.gender) payload.spec.gender = newTask.spec.gender;
    if (newTask.spec.ageBuckets.length > 0) payload.spec.ageBuckets = newTask.spec.ageBuckets;
    if (newTask.spec.ethnicities.length > 0) payload.spec.ethnicities = newTask.spec.ethnicities;
    const { data } = await apiClient.post('/admin/tasks', payload);
    notify('任务已发布');
    showCreate.value = false;
    router.push(`/tasks/${data.id}`);
  } catch (e: any) {
    notify(e?.response?.data?.message || '发布失败', false);
  } finally {
    submitting.value = false;
  }
}

async function closeTask(t: any) {
  if (!confirm(`确认关闭「${t.title}」? 创作者将无法再接单`)) return;
  try {
    await apiClient.patch(`/admin/tasks/${t.id}`, { action: 'CLOSE' });
    notify('任务已关闭');
    load();
  } catch (e: any) {
    notify(e?.response?.data?.message || '关闭失败', false);
  }
}

onMounted(load);
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-6 space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-display text-2xl">任务中心</h1>
        <p class="text-sm text-ink/60 mt-1">发布任务让创作者接单,扩官方形象库。版权归平台</p>
      </div>
      <button
        @click="showCreate = !showCreate"
        class="px-5 py-2 bg-ink text-cream rounded-full text-sm font-medium hover:bg-gold transition"
      >
        {{ showCreate ? '× 取消' : '+ 发布任务' }}
      </button>
    </div>

    <!-- 发布表单 -->
    <div v-if="showCreate" class="card-base border-gold/30 bg-gold/5 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-medium">新任务</h2>
        <button @click="showCreate = false" class="text-xs text-ink/50 hover:text-ink">× 收起</button>
      </div>
      <!-- 错误/成功提示 (admin 没有 toast, 用顶部 banner 顶上) -->
      <div v-if="formError" class="p-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
        ✕ {{ formError }}
      </div>
      <div v-if="formSuccess" class="p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success">
        ✓ {{ formSuccess }}
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-ink/60 block mb-1">标题 <span class="text-danger">*</span></label>
          <input v-model="newTask.title" class="w-full px-3 py-2 border border-line rounded-lg bg-cream" placeholder="如:36 个中国都市女性" />
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="text-xs text-ink/60 block mb-1">总预算 (元)</label>
            <input v-model.number="newTask.budgetYuan" type="number" min="1" class="w-full px-3 py-2 border border-line rounded-lg bg-cream" />
          </div>
          <div>
            <label class="text-xs text-ink/60 block mb-1">单 IP (元)</label>
            <input v-model.number="newTask.perIpYuan" type="number" min="0" class="w-full px-3 py-2 border border-line rounded-lg bg-cream" />
          </div>
          <div>
            <label class="text-xs text-ink/60 block mb-1">最多接单</label>
            <input v-model.number="newTask.maxAccepts" type="number" min="1" class="w-full px-3 py-2 border border-line rounded-lg bg-cream" />
          </div>
        </div>
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-1">详细描述 <span class="text-danger">*</span></label>
        <textarea v-model="newTask.description" rows="3" class="w-full px-3 py-2 border border-line rounded-lg bg-cream font-mono text-sm" placeholder="说明需求/风格/合同条款/报酬细则..."></textarea>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-ink/60 block mb-1">截止日期</label>
          <input v-model="newTask.deadlineAt" type="date" class="w-full px-3 py-2 border border-line rounded-lg bg-cream" />
        </div>
        <div>
          <label class="text-xs text-ink/60 block mb-1">期望产出数</label>
          <input v-model.number="newTask.spec.count" type="number" min="1" class="w-full px-3 py-2 border border-line rounded-lg bg-cream" />
        </div>
      </div>
      <!-- 规格 -->
      <div>
        <label class="text-xs text-ink/60 block mb-1">性别</label>
        <select v-model="newTask.spec.gender" class="w-full px-3 py-2 border border-line rounded-lg bg-cream">
          <option value="">不限</option>
          <option v-for="g in allGenders" :key="g" :value="g">{{ genderLabel[g] }}</option>
        </select>
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-2">年龄段 (多选)</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="a in allAges"
            :key="a"
            type="button"
            @click="toggle(newTask.spec.ageBuckets, a)"
            :class="newTask.spec.ageBuckets.includes(a) ? 'bg-ink text-cream' : 'bg-cream text-ink/60 border border-line'"
            class="px-3 py-1 text-xs rounded-full"
          >{{ ageLabel[a] }}</button>
        </div>
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-2">种族 (多选, 不勾=不限)</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="e in allEths"
            :key="e"
            type="button"
            @click="toggle(newTask.spec.ethnicities, e)"
            :class="newTask.spec.ethnicities.includes(e) ? 'bg-ink text-cream' : 'bg-cream text-ink/60 border border-line'"
            class="px-3 py-1 text-xs rounded-full"
          >{{ ethLabel[e] }}</button>
        </div>
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-2">风格 (多选, 至少 1 个)</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="s in allStyles"
            :key="s"
            type="button"
            @click="toggle(newTask.spec.styleTags, s)"
            :class="newTask.spec.styleTags.includes(s) ? 'bg-ink text-cream' : 'bg-cream text-ink/60 border border-line'"
            class="px-3 py-1 text-xs rounded-full"
          >{{ s }}</button>
        </div>
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-2">场景 (多选, 至少 1 个)</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="s in allScenarios"
            :key="s"
            type="button"
            @click="toggle(newTask.spec.scenarioTags, s)"
            :class="newTask.spec.scenarioTags.includes(s) ? 'bg-ink text-cream' : 'bg-cream text-ink/60 border border-line'"
            class="px-3 py-1 text-xs rounded-full"
          >{{ s }}</button>
        </div>
      </div>
      <div class="flex justify-end gap-3 pt-2">
        <button
          type="button"
          @click="createTask"
          :disabled="submitting"
          class="px-8 py-2.5 bg-ink text-cream rounded-full text-sm font-medium hover:bg-gold transition disabled:opacity-50"
        >{{ submitting ? '发布中...' : '发布任务' }}</button>
      </div>
    </div>

    <!-- 筛选 + 列表 -->
    <div class="flex items-center gap-2 text-sm">
      <span class="text-xs text-ink/60">状态:</span>
      <button
        v-for="s in ['', 'OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED']"
        :key="s || 'all'"
        @click="statusFilter = s; load()"
        :class="statusFilter === s ? 'bg-ink text-cream' : 'bg-cream text-ink/60 border border-line'"
        class="px-3 py-1 text-xs rounded-full"
      >{{ s ? statusLabel[s] : '全部' }}</button>
    </div>

    <div v-if="loading" class="text-center text-sm text-ink/50 py-8">加载中…</div>
    <div v-else-if="tasks.length === 0" class="text-center text-sm text-ink/50 py-8">暂无任务</div>
    <div v-else class="space-y-3">
      <div
        v-for="t in tasks"
        :key="t.id"
        class="card-base hover:border-gold/50 transition cursor-pointer"
        @click="router.push(`/tasks/${t.id}`)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span :class="statusColor[t.status] || 'bg-ink/10 text-ink/50'" class="text-xs px-2 py-0.5 rounded-full">
                {{ statusLabel[t.status] || t.status }}
              </span>
              <h3 class="font-medium">{{ t.title }}</h3>
            </div>
            <p class="text-xs text-ink/60 line-clamp-2 mb-2">{{ t.description }}</p>
            <div class="flex items-center gap-3 text-xs text-ink/50 flex-wrap">
              <span>预算 ¥{{ (t.budgetFen / 100).toFixed(0) }}</span>
              <span v-if="t.perIpFen">单 IP ¥{{ (t.perIpFen / 100).toFixed(0) }}</span>
              <span>已接 {{ t._count?.accepts || 0 }}/{{ t.maxAccepts }}</span>
              <span>已交 {{ t._count?.submissions || 0 }}</span>
              <span>截止 {{ new Date(t.deadlineAt).toLocaleDateString() }}</span>
            </div>
          </div>
          <div class="shrink-0 flex items-center gap-2">
            <button
              v-if="t.status === 'OPEN'"
              @click.stop="closeTask(t)"
              class="text-xs px-3 py-1.5 border border-line rounded-full hover:bg-ink hover:text-cream transition"
            >关闭</button>
            <span class="text-ink/30">→</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
