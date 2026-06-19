<script setup lang="ts">
/**
 * IP 创作者向导 — 单页 3 分段,替代 IpCreatePage + IpEditPage
 *
 * 步骤:
 *   1. 基础信息 (displayName / tagline / description / 性别 / 年龄 / 风格 / 场景 / 价格)
 *   2. 资产包 (3 类图片必填 + BIO_TXT 自动生成 + 4 类选填)
 *   3. 预览提交 (汇总 + 提交审核)
 *
 * 路由:
 *   /creator/ips/new  → 进入向导, 步骤 1
 *   /creator/ips/:id  → 加载已有 IP, 进入步骤 2 (或根据 ?step= 跳转)
 *
 * 设计:
 *   - 顶部 sticky 进度条 (3 个圆点 + 连接线), 显示当前步 + 完成度
 *   - 每段独立卡片, 可滚动; 完成该段才能"下一步"
 *   - 步骤 1 "下一步": 新建场景 POST /ips → 自动生成 BIO_TXT → router.replace 到 /creator/ips/:id
 *                       编辑场景 PATCH /ips/:id → 重新生成 BIO_TXT
 *   - 步骤 2 支持并行上传 (uploadingTypes Set + uploadProgress),不阻塞其他 assetType
 *     见 #20: 之前单 uploadingType 锁,创作者传 LoRA(可达 300MB)时其他文件全卡住
 *   - 步骤 3 仅当资产完整度 100% 时显示提交按钮
 *
 * P0 改进 (2026-06-17):
 *   - description 自动生成 BIO_TXT (创作者只写一遍)
 *   - 状态 banner 解释 PUBLIC_INTENT → OFFICIAL_REGISTERED 等待流程
 *   - styleTags / scenarioTags 支持自定义输入
 *   - scenarioTags 术语优化 (短剧(单集) / 短剧(系列) / 品牌合作 等)
 *   - 上传失败时显示校验错误 (后端 deepValidate)
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient } from '@/api/client';
import Skeleton from '@/components/Skeleton.vue';
import { useToast } from '@/composables/useToast';
import CertSubmitSection from './CertSubmitSection.vue';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const ipId = computed(() => route.params.id as string | undefined);
const isNew = computed(() => !ipId.value);
// #30 任务接单上下文 — /creator/ips/new?taskId=xxx 进入简版 wizard
const taskId = computed(() => (route.query.taskId as string) || '');
const taskContext = ref<any>(null);

const step = ref<number>(isNew.value ? 1 : 2);
const ip = ref<any>(null);
const files = ref<any[]>([]);
const cert = ref<any>(null);
const loading = ref(false);
const submitting = ref(false);
const savingInfo = ref(false);
// 并行上传状态 — 见 #20: 改 uploadingType 单锁 → Set 多并发 + 进度
const uploadingTypes = reactive<Record<string, boolean>>({});
const uploadProgress = reactive<Record<string, number>>({});
const isUploading = computed(() => Object.values(uploadingTypes).some(Boolean));
const regeneratingBio = ref(false);
// 提交审核合规承诺 — 未勾选则禁用"提交审核"按钮
const agreedToTerms = ref(false);
// 证书下载
const downloadingCert = ref(false);
// #33 创作过程证据 — 列表 + 累计用量 (与后端 GET /ips/:id/process-evidence 同步)
const processEvidence = ref<Array<{ id: string; originalName: string; sizeBytes: string; description: string | null; processStep: string | null; uploadedAt: string }>>([]);
const processEvidenceTotal = ref(0);
const processEvidenceLoading = ref(false);
const processEvidenceUploading = ref(false);
const processEvidenceUploadProgress = ref(0);
// 新增证据表单
const newEvidenceStep = ref('TRAINING_DATA_PREP');
const newEvidenceDescription = ref('');
const newEvidenceFile = ref<File | null>(null);
const newEvidenceFileName = ref('');

// 风格 chips — value = 内部值 = 显示值 (1:1)
const styleOptions = ['现代', '古风', '赛博', '二次元', '民国', '未来', '复古', '国潮', '日系', '韩系', '欧美', '港风'];
// 场景 chips — 优化术语, value 存新名 (与 DB 一致)
const scenarioOptions = ['短剧(单集)', '短剧(系列)', '品牌合作', '平面拍摄', '游戏角色', '直播', '广告', '电影角色', '电商模特', 'MV/短片'];
const customTagPlaceholder = '回车添加自定义标签';

// #32 标签体系 — enum 值 (大写), 与后端 Prisma enum 1:1 对应
const genderOptions = [
  { value: 'FEMALE', label: '女' },
  { value: 'MALE', label: '男' },
  { value: 'NONBINARY', label: '无性别' },
];
const ageBucketOptions = [
  { value: 'CHILD', label: '童颜 (0-12)' },
  { value: 'YOUNG', label: '青年 (18-29)' },
  { value: 'MIDDLE', label: '中年 (30-49)' },
  { value: 'ELDERLY', label: '老年 (50+)' },
];
const ethnicityOptions = [
  { value: 'EAST_ASIAN', label: '东亚 (中/日/韩)' },
  { value: 'SOUTHEAST_ASIAN', label: '东南亚' },
  { value: 'SOUTH_ASIAN', label: '南亚' },
  { value: 'AFRICAN', label: '非洲' },
  { value: 'EUROPEAN', label: '欧洲' },
  { value: 'MIXED', label: '混合 / 其他' },
];
// 脸特征 (faceTags) — category + value 配对输入
const faceTagCategoryOptions = [
  { value: 'FaceShape', label: '脸型', values: ['OVAL', 'FACE_ROUND', 'SQUARE', 'LONG', 'HEART', 'DIAMOND'] },
  { value: 'SkinTone', label: '肤色', values: ['PORCELAIN', 'FAIR', 'MEDIUM', 'OLIVE', 'TAN', 'DEEP'] },
  { value: 'HairStyle', label: '发型', values: ['LONG_STRAIGHT', 'LONG_CURLY', 'SHORT', 'BUZZCUT', 'BALD', 'PONYTAIL', 'TWINTAIL', 'BUN', 'BRAIDS'] },
  { value: 'HairColor', label: '发色', values: ['BLACK', 'BROWN', 'BLONDE', 'RED', 'GREY', 'WHITE', 'FANTASY'] },
  { value: 'EyeShape', label: '眼型', values: ['ALMOND', 'PHOENIX', 'PEACH', 'WILLOW', 'EYE_ROUND', 'MONOLID', 'DOUBLE'] },
  { value: 'Vibe', label: '气质', values: ['COOL', 'WARM', 'HEROIC', 'SEDUCTIVE', 'QUIET', 'FIERCE', 'CUTE'] },
];
const faceTagCategoryLabel: Record<string, string> = Object.fromEntries(faceTagCategoryOptions.map((c) => [c.value, c.label]));
// #32 脸特征 value → 中文 label (前缀避免跨 category 同名冲突: ROUND 在脸型/眼型都有)
const faceTagValueLabel: Record<string, string> = {
  // FaceShape
  OVAL: '鹅蛋', FACE_ROUND: '圆脸', SQUARE: '方脸', LONG: '长脸', HEART: '心形', DIAMOND: '菱形',
  // SkinTone
  PORCELAIN: '瓷白', FAIR: '白皙', MEDIUM: '自然', OLIVE: '橄榄', TAN: '小麦', DEEP: '深棕',
  // HairStyle
  LONG_STRAIGHT: '长直发', LONG_CURLY: '长卷发', SHORT: '短发', BUZZCUT: '寸头', BALD: '光头',
  PONYTAIL: '马尾', TWINTAIL: '双马尾', BUN: '盘发', BRAIDS: '辫子',
  // HairColor
  BLACK: '黑色', BROWN: '棕色', BLONDE: '金色', RED: '红色', GREY: '灰色', WHITE: '白色', FANTASY: '梦幻',
  // EyeShape
  ALMOND: '杏眼', PHOENIX: '丹凤眼', PEACH: '桃花眼', WILLOW: '柳叶眼', EYE_ROUND: '圆眼', MONOLID: '单眼皮', DOUBLE: '双眼皮',
  // Vibe
  COOL: '清冷', WARM: '温暖', HEROIC: '英气', SEDUCTIVE: '妩媚', QUIET: '文静', FIERCE: '飒爽', CUTE: '可爱',
};

// #33 创作过程证据 — processStep 中文 label (value 是 const list, 与后端 1:1)
const processStepOptions = [
  { value: 'TRAINING_DATA_PREP', label: '数据准备 (清洗/打标)' },
  { value: 'TRAINING',           label: '模型训练 (LoRA 跑 epoch)' },
  { value: 'GENERATION',         label: '出图 (prompt + sampling)' },
  { value: 'POST_PROCESSING',    label: '后期 (PS / 调色 / 修复)' },
  { value: 'OTHER',              label: '其他工作流' },
];
const processStepLabel: Record<string, string> = Object.fromEntries(processStepOptions.map((o) => [o.value, o.label]));
// 单 IP 累计证据上限 600MB — 与后端 upload.service.PROCESS_EVIDENCE_TOTAL_MAX_BYTES 保持一致
const PROCESS_EVIDENCE_MAX_MB = 600;

const infoForm = ref({
  displayName: '',
  tagline: '',
  description: '',
  gender: 'FEMALE' as string,
  ageBucket: 'YOUNG' as string,
  ethnicity: '' as string, // 历史 IP 是 NULL, UI 提示必填
  styleTags: [] as string[],
  scenarioTags: [] as string[],
  faceTags: [] as Array<{ category: string; value: string }>,
  depositPriceFen: 19900,
  fullLicensePriceFen: 300000,
});
const customFaceTagCategory = ref('FaceShape');
const customFaceTagValue = ref('');
const infoError = ref('');
const customStyleInput = ref('');
const customScenarioInput = ref('');

// 4 个图片类必填 (含 面部特写 — 版权登记证据,见 #31);BIO_TXT 自动生成;LORA/RECIPE/VOICE/PACKAGE 选填
const requiredTypes = ['FACE_CLOSEUP', 'THREE_VIEW', 'EXPRESSION_GRID', 'TRANSPARENT_RENDER'];
const optionalTypes = ['LORA_FILE', 'RECIPE_TXT', 'VOICE_REF', 'PACKAGE_ZIP'];
const allAssetTypes = [...requiredTypes, 'BIO_TXT', ...optionalTypes];
const fileTypeLabel: Record<string, string> = {
  FACE_CLOSEUP: '面部特写 ⭐ (jpg/png/webp, ≥2048×2048, 100KB-30MB, 单一人物正面清晰人脸 — 版权登记核心证据)',
  THREE_VIEW: '三视图 (jpg/png/webp, ≥2048×2048, 100KB-30MB)',
  EXPRESSION_GRID: '表情矩阵 (jpg/png/webp, ≥2048×2048, 100KB-30MB)',
  TRANSPARENT_RENDER: '立绘 (PNG 带 alpha, ≥2048×2048, 100KB-30MB)',
  BIO_TXT: '人物小传 (从描述自动生成, 可手动覆盖)',
  LORA_FILE: 'LoRA 模型 (.safetensors, 1MB-300MB)',
  RECIPE_TXT: 'Prompt 说明书 (.txt/.md, ≤1MB)',
  VOICE_REF: '声音样本 (.wav/.mp3, 50KB-50MB)',
  PACKAGE_ZIP: '完整资产包 (.zip, 1KB-1GB)',
};
const fileTypeShort: Record<string, string> = {
  FACE_CLOSEUP: '面部特写',
  THREE_VIEW: '三视图',
  EXPRESSION_GRID: '表情',
  TRANSPARENT_RENDER: '立绘',
  BIO_TXT: '小传',
};
// 选填项的"为什么需要这个"简短说明 — 见 #21, 创作者不知道传这些有什么用
const optionalHints: Record<string, string> = {
  LORA_FILE: '让买家在 ComfyUI / SD WebUI 里直接复现你的风格,大幅提高成交率。',
  RECIPE_TXT: '正向/反向 prompt + 采样参数 + 推荐模型。买家不用猜怎么出图。',
  VOICE_REF: '短剧/直播/有声场景的买家会用,让你的形象"会说话"。',
  PACKAGE_ZIP: '一次性打包所有源文件(PSD/Blender 工程等),适合工作室买家。',
};
// 展开/折叠状态 (按 assetType)
const expandedHints = reactive<Record<string, boolean>>({});

const fileByType = computed(() => {
  const m: Record<string, any> = {};
  for (const f of files.value) m[f.assetType] = f;
  return m;
});

// #31: 所有上传过的 FACE_CLOSEUP 文件 (供多张管理 + ⭐ 切换版权图)
const faceCloseupFiles = computed(() =>
  files.value.filter((f) => f.assetType === 'FACE_CLOSEUP'),
);

// 设置某张面部特写为版权图 (调后端 /upload/ips/:id/face-closeup)
async function setAsFaceCloseup(fileId: string) {
  if (!ipId.value) return;
  try {
    await apiClient.post(`/upload/ips/${ipId.value}/face-closeup`, { fileId });
    toast.success('已设为版权图');
    await loadIp();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '设置失败');
  }
}

// #33 拉取该 IP 的全部 PROCESS_EVIDENCE 列表 + 累计用量
async function loadProcessEvidence() {
  if (!ipId.value) {
    processEvidence.value = [];
    processEvidenceTotal.value = 0;
    return;
  }
  processEvidenceLoading.value = true;
  try {
    const { data } = await apiClient.get(`/ips/${ipId.value}/process-evidence`);
    processEvidence.value = data.items || [];
    processEvidenceTotal.value = Number(data.totalBytes || 0);
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '加载创作证据失败');
    processEvidence.value = [];
    processEvidenceTotal.value = 0;
  } finally {
    processEvidenceLoading.value = false;
  }
}

// #33 添加单条创作证据 — policy → OSS 直传 → callback
async function addProcessEvidence() {
  if (!ipId.value || !newEvidenceFile.value) return;
  if (!newEvidenceDescription.value.trim()) {
    toast.error('请填写证据说明');
    return;
  }
  if (newEvidenceDescription.value.length > 500) {
    toast.error('证据说明最多 500 字');
    return;
  }
  // 前端预校验: 累计 + 本次 ≤ 600MB
  const fileSize = newEvidenceFile.value.size;
  if (processEvidenceTotal.value + fileSize > PROCESS_EVIDENCE_MAX_MB * 1024 * 1024) {
    toast.error(`累计将超 ${PROCESS_EVIDENCE_MAX_MB}MB, 请删除部分证据后再上传`);
    return;
  }
  processEvidenceUploading.value = true;
  processEvidenceUploadProgress.value = 0;
  try {
    // 1. 拿 policy
    const { data: policy } = await apiClient.post('/upload/policy', {
      ipId: ipId.value,
      assetType: 'PROCESS_EVIDENCE',
      filename: newEvidenceFile.value.name,
      size: newEvidenceFile.value.size,
      description: newEvidenceDescription.value.trim(),
      processStep: newEvidenceStep.value,
    });
    // 2. OSS 直传 (XHR 取进度)
    const fd = new FormData();
    fd.append('key', policy.key);
    fd.append('policy', policy.policy);
    fd.append('OSSAccessKeyId', policy.accessKeyId);
    fd.append('Signature', policy.signature);
    fd.append('file', newEvidenceFile.value);
    const etag = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          processEvidenceUploadProgress.value = Math.round((e.loaded / e.total) * 100);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve((xhr.getResponseHeader('ETag') || '').replace(/"/g, ''));
        } else {
          reject(new Error(`OSS 上传失败 HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('OSS 网络错误'));
      xhr.onabort = () => reject(new Error('上传已取消'));
      xhr.open('POST', policy.host + '/', true);
      xhr.send(fd);
    });
    // 3. 回调 — 走和普通资产相同的 /upload/oss-callback, 传 description + processStep
    const { data: callback } = await apiClient.post('/upload/oss-callback', {
      filename: newEvidenceFile.value.name,
      size: newEvidenceFile.value.size,
      etag,
      x: policy.key,
      description: newEvidenceDescription.value.trim(),
      processStep: newEvidenceStep.value,
    });
    if (callback?.Status !== 'OK') {
      throw new Error(callback?.Message || '上传校验失败');
    }
    toast.success('创作证据已上传');
    // 重置表单
    newEvidenceFile.value = null;
    newEvidenceFileName.value = '';
    newEvidenceDescription.value = '';
    await loadProcessEvidence();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || e?.message || '上传失败');
  } finally {
    processEvidenceUploading.value = false;
    processEvidenceUploadProgress.value = 0;
  }
}

// #33 删除单条证据 — 释放累计空间
async function deleteProcessEvidence(fileId: string) {
  if (!ipId.value) return;
  if (!confirm('确认删除此证据? 释放后无法恢复。')) return;
  try {
    await apiClient.delete(`/ips/${ipId.value}/process-evidence/${fileId}`);
    toast.success('证据已删除');
    await loadProcessEvidence();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '删除失败');
  }
}

// 文件选择回调 — 存到 ref (用于后续 addProcessEvidence)
function onNewEvidenceFileChange(e: Event) {
  const inp = e.target as HTMLInputElement;
  const f = inp.files?.[0] || null;
  newEvidenceFile.value = f;
  newEvidenceFileName.value = f?.name || '';
  inp.value = ''; // 重置,允许重选同名文件
}

function fmtMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

const completion = computed(() => {
  // 4 个图片必填 (含 FACE_CLOSEUP, 见 #31) + BIO_TXT 视为已生成 (因为步骤 1 保存时会自动创建)
  const present = new Set(files.value.filter((f) => f.validated).map((f) => f.assetType));
  const imageCount = requiredTypes.filter(t => present.has(t)).length;
  const bioAuto = present.has('BIO_TXT') ? 1 : 0; // 通常步骤 1 后就有
  return Math.round(((imageCount + bioAuto) / 5) * 100);
});

const infoValid = computed(() =>
  infoForm.value.displayName.trim().length > 0 &&
  infoForm.value.description.trim().length > 0 &&
  infoForm.value.gender.length > 0 &&
  infoForm.value.ageBucket.length > 0 &&
  infoForm.value.ethnicity.length > 0 && // #32 历史 IP 是 NULL, 新上传必填
  infoForm.value.styleTags.length > 0 &&
  infoForm.value.scenarioTags.length > 0
);

const step1Done = computed(() => !!ip.value);
const step2Done = computed(() => completion.value === 100);
const canSubmit = computed(() =>
  step1Done.value &&
  step2Done.value &&
  ip.value?.status === 'PENDING_REVIEW' &&
  !!ip.value?.faceCloseupFileId && // #31: 版权图必须指定才能上架
  agreedToTerms.value,
);

function toggle(arr: string[], v: string) {
  const i = arr.indexOf(v);
  if (i === -1) arr.push(v); else arr.splice(i, 1);
}

/**
 * 把 Prisma 的逗号分隔 String (或已经是数组) 规范化为 string[]
 * 兼容 null / undefined / 空字符串
 */
function splitTags(v: any): string[] {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

function addCustomTag(field: 'styleTags' | 'scenarioTags', value: string) {
  const v = value.trim();
  if (!v) return;
  if (v.length > 20) {
    toast.error('标签最多 20 字');
    return;
  }
  if (!infoForm.value[field].includes(v)) {
    infoForm.value[field].push(v);
  }
}

// #32 添加一个脸特征 (category + value 配对, 避免重复)
function addFaceTag() {
  if (!customFaceTagValue.value) return;
  const exists = infoForm.value.faceTags.some(
    (t) => t.category === customFaceTagCategory.value && t.value === customFaceTagValue.value,
  );
  if (exists) return;
  infoForm.value.faceTags.push({
    category: customFaceTagCategory.value,
    value: customFaceTagValue.value,
  });
  customFaceTagValue.value = '';
}

function onCustomInputKeydown(field: 'styleTags' | 'scenarioTags', e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const target = e.target as HTMLInputElement;
    addCustomTag(field, target.value);
    target.value = '';
  }
}

function jumpTo(target: number) {
  if (target === 1) return step.value = 1;
  if (target === 2 && step1Done.value) return step.value = 2;
  if (target === 3 && step2Done.value) return step.value = 3;
}

async function loadIp() {
  if (isNew.value) return;
  loading.value = true;
  try {
    const list = await apiClient.get('/ips/mine/list');
    const found = list.data.items.find((x: any) => x.id === ipId.value);
    if (!found) {
      toast.error('未找到 IP');
      router.replace('/creator');
      return;
    }
    ip.value = found;
    files.value = found.files || [];
    // 拉 cert: PUBLIC_INTENT (待审) / OFFICIAL_REGISTERED (已通过,展示下载按钮)
    // PENDING_REVIEW 也拉 (cert 拒后 IP 回退到这里,展示"上次被拒原因")
    if (
      found.status === 'PUBLIC_INTENT' ||
      found.status === 'OFFICIAL_REGISTERED' ||
      found.status === 'PENDING_REVIEW'
    ) {
      try {
        const certRes = await apiClient.get(`/ips/${ipId.value}/cert`);
        cert.value = certRes.data.cert;
      } catch {
        cert.value = null;
      }
    } else {
      cert.value = null;
    }
    // Prisma schema 把 styleTags/scenarioTags 存为逗号分隔 String,
    // 加载时统一转 string[], 模板 / 表单 / 预览都用数组 (避免 .join / .filter 抛 TypeError)
    ip.value.styleTags = splitTags(found.styleTags);
    ip.value.scenarioTags = splitTags(found.scenarioTags);
    infoForm.value = {
      displayName: found.displayName,
      tagline: found.tagline || '',
      description: found.description || '',
      gender: found.gender,
      ageBucket: found.ageBucket ?? 'YOUNG',
      ethnicity: found.ethnicity ?? '', // 历史 IP 是 NULL, UI 提示必填
      styleTags: [...ip.value.styleTags],
      scenarioTags: [...ip.value.scenarioTags],
      faceTags: Array.isArray(found.faceTags) ? [...found.faceTags] : [],
      depositPriceFen: Number(found.depositPriceFen),
      fullLicensePriceFen: Number(found.fullLicensePriceFen),
    };
    // #33 拉取创作过程证据 (并行, 不阻塞主流程)
    loadProcessEvidence();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '加载 IP 失败');
  } finally {
    loading.value = false;
  }
}

/**
 * 自动从 description 生成 BIO_TXT, 避免创作者写两遍
 * - 新建 IP 后立即调用
 * - 编辑 IP 后, 如果 description 变了, 调用覆盖
 */
async function syncBioFromDescription(ipId: string, description: string) {
  try {
    await apiClient.post(`/upload/ips/${ipId}/auto-files`, {
      assetType: 'BIO_TXT',
      content: description,
    });
  } catch (e: any) {
    // 不阻塞流程, 但提示用户
    toast.error(`自动生成小传失败: ${e?.response?.data?.message || e?.message}, 步骤 ② 可手动上传`);
  }
}

async function saveInfo() {
  infoError.value = '';
  if (!infoValid.value) {
    infoError.value = '请填写名称、简介,并至少选择 1 个风格 + 1 个场景';
    return;
  }
  savingInfo.value = true;
  try {
    let targetIpId: string;
    if (isNew.value) {
      // #30 接单提交: 携带 taskId, 后端会写 origin=TASK + taskId 关联
      const payload: any = { ...infoForm.value };
      if (taskId.value) payload.taskId = taskId.value;
      const { data } = await apiClient.post('/ips', payload);
      targetIpId = data.ip.id;
      toast.success('IP 创建成功');
      // 路由跳转前先同步 BIO_TXT, 避免 step 2 看到空状态
      await syncBioFromDescription(targetIpId, infoForm.value.description);
      router.replace(`/creator/ips/${targetIpId}`);
    } else {
      await apiClient.patch(`/ips/${ipId.value}`, infoForm.value);
      toast.success('基础信息已更新');
      await syncBioFromDescription(ipId.value!, infoForm.value.description);
      await loadIp();
    }
    step.value = 2;
  } catch (e: any) {
    const msg = e?.response?.data?.message;
    infoError.value = Array.isArray(msg) ? msg.join('; ') : (msg || '保存失败');
    toast.error(infoError.value);
  } finally {
    savingInfo.value = false;
  }
}

/**
 * 步骤 ② 重新生成 BIO_TXT 按钮
 */
async function regenerateBio() {
  if (!ipId.value || !infoForm.value.description.trim()) {
    toast.error('描述不能为空');
    return;
  }
  regeneratingBio.value = true;
  try {
    await apiClient.post(`/upload/ips/${ipId.value}/auto-files`, {
      assetType: 'BIO_TXT',
      content: infoForm.value.description,
    });
    toast.success('人物小传已重新生成');
    await loadIp();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '重新生成失败');
  } finally {
    regeneratingBio.value = false;
  }
}

async function requestUploadPolicy(assetType: string, file: File) {
  uploadingTypes[assetType] = true;
  uploadProgress[assetType] = 0;
  try {
    const { data: policy } = await apiClient.post('/upload/policy', {
      ipId: ipId.value,
      assetType,
      filename: file.name,
      size: file.size,
    });
    const fd = new FormData();
    fd.append('key', policy.key);
    fd.append('policy', policy.policy);
    fd.append('OSSAccessKeyId', policy.accessKeyId);
    fd.append('Signature', policy.signature);
    fd.append('file', file);

    // 用 XHR 走 OSS 直传,可以监听 upload.onprogress (fetch 拿不到)
    const etag = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          uploadProgress[assetType] = Math.round((e.loaded / e.total) * 100);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve((xhr.getResponseHeader('ETag') || '').replace(/"/g, ''));
        } else {
          reject(new Error(`OSS 上传失败 HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('OSS 网络错误'));
      xhr.onabort = () => reject(new Error('上传已取消'));
      xhr.open('POST', policy.host + '/', true);
      xhr.send(fd);
    });

    // callback 触发后端 deepValidate, 失败时回 FAIL + 详细原因
    const { data: callback } = await apiClient.post('/upload/oss-callback', {
      filename: file.name,
      size: file.size,
      etag,
      x: policy.key,
    });
    if (callback?.Status !== 'OK') {
      throw new Error(callback?.Message || '上传校验失败');
    }
    toast.success(`${fileTypeLabel[assetType].split('(')[0].trim()} 上传成功`);
    await loadIp();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || e?.message || '上传失败');
    throw e;
  } finally {
    uploadingTypes[assetType] = false;
    uploadProgress[assetType] = 0;
  }
}

async function submitForReview() {
  submitting.value = true;
  try {
    await apiClient.post(`/ips/${ipId.value}/submit`);
    toast.success('已提交审核');
    router.push('/creator');
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '提交失败');
  } finally {
    submitting.value = false;
  }
}

/**
 * 下载版权证书 (OFFICIAL_REGISTERED 状态可用)
 * - 后端 /ips/:id/cert/file 流式返回,带 Content-Disposition: attachment; filename*=RFC5987
 * - 前端拿到 blob 后用 URL.createObjectURL + a.click 触发浏览器下载
 * - 不用 <a href> 直接下载:浏览器不会带 Bearer,会 401
 */
async function downloadCert() {
  if (!ipId.value) return;
  downloadingCert.value = true;
  try {
    const res = await apiClient.get(`/ips/${ipId.value}/cert/file`, { responseType: 'blob' });
    // 从响应头尝试取后端给的 filename,失败回退到 cert.certFileName
    const dispo = res.headers['content-disposition'] as string | undefined;
    let filename = cert.value?.certFileName || '版权证书';
    if (dispo) {
      const m = /filename\*=UTF-8''([^;]+)/.exec(dispo) || /filename="?([^";]+)"?/.exec(dispo);
      if (m) {
        try { filename = decodeURIComponent(m[1]); } catch { /* keep original */ }
      }
    }
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 100ms 后 revoke,确保浏览器开始下载
    setTimeout(() => URL.revokeObjectURL(url), 100);
    toast.success('证书已下载');
  } catch (e: any) {
    toast.error('下载失败: ' + (e?.response?.data?.message || e?.message || '未知错误'));
  } finally {
    downloadingCert.value = false;
  }
}

function statusLabel(s: string): string {
  return {
    PENDING_REVIEW: '待提交',
    REVIEWED_PROOFING: '审核中',
    PUBLIC_INTENT: '公示中',
    OFFICIAL_REGISTERED: '已登记',
    REJECTED: '已拒绝',
    ARCHIVED: '已归档',
  }[s] || s;
}

/**
 * 状态 banner 文案 — 解释每个非 PENDING 状态的含义
 * - REJECTED case 会从 ip.rejectionReason 取具体原因
 * - 模板里用 detail 字段做单独高亮展示
 */
function statusBanner(s: string): {
  type: 'info' | 'warn' | 'success' | 'danger';
  title: string;
  body: string;
  detail?: string;
} | null {
  if (s === 'PUBLIC_INTENT') {
    return {
      type: 'info',
      title: '⏳ 等待版权证书登记中',
      body: '你的 IP 已通过平台审核, 正在公示中。公示期通过后, 平台会代为申请国家或省级作品著作权登记证书, 通常 1-3 周完成, 具体时间取决于版权局。',
    };
  }
  if (s === 'REVIEWED_PROOFING') {
    return {
      type: 'info',
      title: '🔍 平台审核中',
      body: '正在核验资产完整度 + 区块链存证, 通常 1-3 个工作日完成。',
    };
  }
  if (s === 'OFFICIAL_REGISTERED') {
    return {
      type: 'success',
      title: '✓ 已登记',
      body: '已完成国家或省级作品著作权登记, 可在下方下载版权证书副本。',
    };
  }
  if (s === 'REJECTED') {
    const reason = ip.value?.rejectionReason;
    return {
      type: 'danger',
      title: '✕ 审核未通过',
      body: reason
        ? '平台审核未通过, 具体原因见下方:'
        : '平台审核未通过, 请联系平台管理员了解详情。',
      detail: reason || undefined,
    };
  }
  return null;
}

onMounted(async () => {
  if (taskId.value) {
    await loadTask();
  }
  loadIp();
});
watch(() => route.params.id, loadIp);

/**
 * #30 加载接单任务上下文 — 简版 wizard 模式
 * 接单后进入, 任务规格预填, 创作者只填素材即可
 */
async function loadTask() {
  if (!taskId.value) return;
  try {
    const { data } = await apiClient.get('/tasks');
    const tasks = Array.isArray(data) ? data : data?.items || [];
    const t = tasks.find((x: any) => x.id === taskId.value);
    if (!t) {
      toast.error('未找到该任务 (可能已关闭)');
      return;
    }
    if (!t.acceptedByMe) {
      toast.error('请先接单再提交');
      router.replace('/creator/tasks');
      return;
    }
    taskContext.value = t;
    // 预填 spec
    const spec = t.spec || {};
    infoForm.value.gender = spec.gender || 'FEMALE';
    if (spec.ageBuckets?.length) infoForm.value.ageBucket = spec.ageBuckets[0];
    if (spec.ethnicities?.length) infoForm.value.ethnicity = spec.ethnicities[0];
    if (spec.styleTags?.length) infoForm.value.styleTags = [...spec.styleTags];
    if (spec.scenarioTags?.length) infoForm.value.scenarioTags = [...spec.scenarioTags];
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '加载任务失败');
  }
}

const stepMeta = [
  { num: 1, label: '基础信息', short: '①' },
  { num: 2, label: '资产包', short: '②' },
  { num: 3, label: '预览提交', short: '③' },
];
</script>

<template>
  <!-- 加载骨架 -->
  <div v-if="loading" class="max-w-4xl mx-auto px-6 py-10 space-y-6">
    <Skeleton shape="line" width="40%" height-class="h-6" />
    <Skeleton shape="line" width="60%" height-class="h-3" />
    <Skeleton shape="block" aspect="16/3" width-class="w-full rounded-2xl" />
    <Skeleton shape="line" :lines="5" />
  </div>

  <div v-else class="max-w-4xl mx-auto px-6 py-10">
    <RouterLink to="/creator" class="text-xs text-ink/50 hover:text-ink mb-4 inline-block">← 返回创作者中心</RouterLink>
    <div v-if="ip" class="flex items-baseline justify-between mb-2">
      <h1 class="font-display text-3xl">{{ ip.displayName }}</h1>
      <span class="font-mono text-xs text-ink/40">{{ ip.code }}</span>
    </div>
    <div v-else class="mb-2">
      <h1 class="font-display text-3xl">创建新 IP</h1>
      <p class="text-sm text-ink/60 mt-1">填写基础信息后,下一步上传资产包,完整度 100% 即可提交审核</p>
    </div>
    <div v-if="ip" class="flex items-center gap-3 mb-6 flex-wrap">
      <span class="text-xs px-2 py-0.5 bg-cream border border-line rounded-full">状态: {{ statusLabel(ip.status) }}</span>
      <span class="text-xs text-ink/60">资产完整度 {{ completion }}%</span>
      <span v-if="ip.tagline" class="text-xs text-ink/50">· {{ ip.tagline }}</span>
    </div>

    <!-- 状态 banner (解释非 PENDING 状态) -->
    <div
      v-if="ip && statusBanner(ip.status)"
      :class="[
        'mb-6 p-4 rounded-2xl border text-sm',
        statusBanner(ip.status)!.type === 'info' ? 'bg-gold/10 border-gold/30' :
        statusBanner(ip.status)!.type === 'success' ? 'bg-success/10 border-success/30' :
        statusBanner(ip.status)!.type === 'danger' ? 'bg-danger/10 border-danger/30' :
        'bg-ink/5 border-ink/10',
      ]"
    >
      <div class="font-medium mb-1">{{ statusBanner(ip.status)!.title }}</div>
      <div class="text-ink/70 leading-relaxed">{{ statusBanner(ip.status)!.body }}</div>
      <div
        v-if="statusBanner(ip.status)!.detail"
        class="mt-2 p-2.5 bg-danger/15 border border-danger/30 rounded-lg text-danger text-sm whitespace-pre-line"
      >
        <span class="font-medium">原因:</span> {{ statusBanner(ip.status)!.detail }}
      </div>
    </div>

    <!-- 步骤进度条 (sticky) -->
    <div class="sticky top-16 z-20 bg-cream/90 backdrop-blur -mx-6 px-6 py-4 mb-6 border-b border-line">
      <div class="flex items-center gap-3">
        <template v-for="(s, idx) in stepMeta" :key="s.num">
          <button
            type="button"
            @click="jumpTo(s.num)"
            :disabled="s.num > 1 && !(s.num === 2 ? step1Done : step2Done)"
            :class="[
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition',
              step === s.num
                ? 'bg-ink text-cream'
                : (s.num === 1 ? step1Done : s.num === 2 ? step1Done : step2Done)
                  ? 'bg-success/15 text-success hover:bg-success/25'
                  : 'bg-line/60 text-ink/40 cursor-not-allowed',
            ]"
          >
            <span :class="[
              'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono',
              step === s.num ? 'bg-cream text-ink' : 'bg-white/60 text-current',
            ]">{{ (s.num === 1 ? step1Done : s.num === 2 ? step1Done : step2Done) && step !== s.num ? '✓' : s.num }}</span>
            <span class="font-medium">{{ s.label }}</span>
          </button>
          <div v-if="idx < stepMeta.length - 1" class="flex-1 h-px bg-line" />
        </template>
      </div>
    </div>

    <!-- 步骤 1: 基础信息 -->
    <section v-show="step === 1" class="bg-surface rounded-2xl border border-line p-6 space-y-5">
      <h2 class="font-display text-lg">① 基础信息</h2>
      <!-- #30 任务接单模式 banner — 预填 spec + 提示"版权归平台" -->
      <div v-if="taskContext" class="p-4 bg-gold/10 border border-gold/30 rounded-xl space-y-2">
        <div class="flex items-center gap-2 text-sm font-medium text-ink">
          <span>📋 任务接单模式</span>
          <span class="text-xs text-ink/50">· {{ taskContext.title }}</span>
        </div>
        <div class="text-xs text-ink/70 leading-relaxed">
          任务规格已预填, 你只需填写名称/小传和上传素材。
          <span class="text-danger font-medium">本任务 IP 版权归平台所有, 通过审核后获得 ¥{{ ((taskContext.perIpFen || 0) / 100).toFixed(0) }} 报酬。</span>
        </div>
        <div v-if="taskContext.spec" class="text-[10px] text-ink/50 font-mono">
          规格: {{ (taskContext.spec.gender || '不限') }} ·
          {{ (taskContext.spec.ageBuckets || []).join('/') || '不限' }} ·
          {{ (taskContext.spec.ethnicities || []).join('/') || '不限' }} ·
          风格 [{{ (taskContext.spec.styleTags || []).join('·') }}] ·
          场景 [{{ (taskContext.spec.scenarioTags || []).join('·') }}]
        </div>
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-1">IP 名称 <span class="text-danger">*</span></label>
        <input v-model="infoForm.displayName" required class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" placeholder="如:林知夏" />
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-1">一句话简介</label>
        <input v-model="infoForm.tagline" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold" placeholder="如:都市冷感御姐,平面/短剧双栖" />
      </div>
      <div>
        <label class="text-xs text-ink/60 block mb-1">
          人物小传 (Markdown) <span class="text-danger">*</span>
          <span class="text-ink/40 text-[10px] ml-2">保存后会自动生成 .txt 资产, 步骤 ② 可重新生成或手动覆盖</span>
        </label>
        <textarea v-model="infoForm.description" rows="6" class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold font-mono text-sm" placeholder="姓名 / 年龄 / 性格 / 背景故事..."></textarea>
      </div>

      <div class="grid grid-cols-3 gap-4">
        <div>
          <label class="text-xs text-ink/60 block mb-1">性别 <span class="text-danger">*</span></label>
          <select v-model="infoForm.gender" class="w-full px-3 py-2 border border-line rounded-lg bg-cream">
            <option v-for="o in genderOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-ink/60 block mb-1">视觉年龄 <span class="text-danger">*</span></label>
          <select v-model="infoForm.ageBucket" class="w-full px-3 py-2 border border-line rounded-lg bg-cream">
            <option v-for="o in ageBucketOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-ink/60 block mb-1">
            种族 <span class="text-danger">*</span>
            <span class="text-ink/40 text-[10px] ml-1">(#32 决定丰富度评分)</span>
          </label>
          <select v-model="infoForm.ethnicity" class="w-full px-3 py-2 border border-line rounded-lg bg-cream">
            <option value="">— 请选择 —</option>
            <option v-for="o in ethnicityOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
      </div>

      <!-- #32 脸特征 (faceTags) — 多选, 决定检索匹配度, 不进覆盖度 -->
      <div>
        <label class="text-xs text-ink/60 block mb-2">
          脸特征 (可选)
          <span class="text-ink/40 text-[10px] ml-1">用于买家按脸特征检索 — 脸型 / 肤色 / 发型 / 发色 / 眼型 / 气质</span>
        </label>
        <div class="flex flex-wrap gap-1.5 mb-2">
          <span
            v-for="(t, i) in infoForm.faceTags"
            :key="`ft-${i}`"
            class="px-2.5 py-1 text-xs rounded-full bg-ink text-cream flex items-center gap-1.5"
            :title="`${faceTagCategoryLabel[t.category] || t.category}: ${faceTagValueLabel[t.value] || t.value}`"
          >
            <span class="opacity-60">{{ faceTagCategoryLabel[t.category] || t.category }}:</span>
            {{ faceTagValueLabel[t.value] || t.value }}
            <button type="button" @click="infoForm.faceTags.splice(i, 1)" class="hover:text-gold">×</button>
          </span>
        </div>
        <div class="flex items-center gap-2">
          <select v-model="customFaceTagCategory" class="px-2 py-1.5 border border-line rounded-lg bg-cream text-xs">
            <option v-for="c in faceTagCategoryOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
          <select v-model="customFaceTagValue" class="flex-1 px-2 py-1.5 border border-line rounded-lg bg-cream text-xs">
            <option value="">— 选值 —</option>
            <option
              v-for="v in (faceTagCategoryOptions.find(c => c.value === customFaceTagCategory)?.values || [])"
              :key="v"
              :value="v"
            >{{ faceTagValueLabel[v] || v }}</option>
          </select>
          <button
            type="button"
            @click="addFaceTag()"
            :disabled="!customFaceTagValue"
            class="px-3 py-1.5 text-xs bg-ink text-cream rounded-lg disabled:opacity-30"
          >+ 添加</button>
        </div>
      </div>

      <div>
        <label class="text-xs text-ink/60 block mb-2">风格 (至少 1 个) <span class="text-danger">*</span></label>
        <div class="flex flex-wrap gap-2 mb-2">
          <button
            v-for="s in styleOptions"
            :key="s"
            type="button"
            @click="toggle(infoForm.styleTags, s)"
            :class="infoForm.styleTags.includes(s) ? 'bg-ink text-cream' : 'bg-cream text-ink/60 border border-line'"
            class="px-3 py-1.5 text-xs rounded-full"
          >{{ s }}</button>
          <!-- 自定义标签 chip (可移除) -->
          <span
            v-for="(tag, i) in infoForm.styleTags.filter(t => !styleOptions.includes(t))"
            :key="`custom-${i}`"
            class="px-3 py-1.5 text-xs rounded-full bg-ink text-cream flex items-center gap-1"
          >
            {{ tag }}
            <button type="button" @click="infoForm.styleTags.splice(infoForm.styleTags.indexOf(tag), 1)" class="hover:text-gold">×</button>
          </span>
        </div>
        <input
          v-model="customStyleInput"
          @keydown="(e) => onCustomInputKeydown('styleTags', e)"
          class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold text-xs"
          :placeholder="customTagPlaceholder"
        />
      </div>

      <div>
        <label class="text-xs text-ink/60 block mb-2">应用场景 (至少 1 个) <span class="text-danger">*</span></label>
        <div class="flex flex-wrap gap-2 mb-2">
          <button
            v-for="s in scenarioOptions"
            :key="s"
            type="button"
            @click="toggle(infoForm.scenarioTags, s)"
            :class="infoForm.scenarioTags.includes(s) ? 'bg-ink text-cream' : 'bg-cream text-ink/60 border border-line'"
            class="px-3 py-1.5 text-xs rounded-full"
          >{{ s }}</button>
          <span
            v-for="(tag, i) in infoForm.scenarioTags.filter(t => !scenarioOptions.includes(t))"
            :key="`custom-${i}`"
            class="px-3 py-1.5 text-xs rounded-full bg-ink text-cream flex items-center gap-1"
          >
            {{ tag }}
            <button type="button" @click="infoForm.scenarioTags.splice(infoForm.scenarioTags.indexOf(tag), 1)" class="hover:text-gold">×</button>
          </span>
        </div>
        <input
          v-model="customScenarioInput"
          @keydown="(e) => onCustomInputKeydown('scenarioTags', e)"
          class="w-full px-3 py-2 border border-line rounded-lg bg-cream focus:outline-none focus:border-gold text-xs"
          :placeholder="customTagPlaceholder"
        />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-ink/60 block mb-1">
            意向金 (元)
            <span class="text-ink/40 text-[10px] ml-1" title="买家付 199 元锁定 IP 30 天, 期间不能被别人买; 平台 0 抽成, 后续转全额授权时抵扣">?</span>
          </label>
          <input v-model.number="infoForm.depositPriceFen" type="number" min="0" step="100" class="w-full px-3 py-2 border border-line rounded-lg bg-cream" />
          <div class="text-[10px] text-ink/40 mt-1">默认 199 元 = 19900 分</div>
        </div>
        <div>
          <label class="text-xs text-ink/60 block mb-1">
            正式授权起价 (元)
            <span class="text-ink/40 text-[10px] ml-1" title="全额买断 / 多年授权 / 短剧单集 等不同 scope 的起步价, 平台抽 15%">?</span>
          </label>
          <input v-model.number="infoForm.fullLicensePriceFen" type="number" min="0" step="100" class="w-full px-3 py-2 border border-line rounded-lg bg-cream" />
        </div>
      </div>

      <div v-if="infoError" class="p-3 bg-danger/10 text-danger text-sm rounded-lg">{{ infoError }}</div>

      <div class="flex justify-end gap-3 pt-2">
        <button
          v-if="!isNew"
          type="button"
          @click="step = 2"
          class="px-6 py-2 text-sm text-ink/60 hover:text-ink"
        >跳过</button>
        <button
          type="button"
          @click="saveInfo"
          :disabled="savingInfo || !infoValid"
          class="px-8 py-2.5 bg-ink text-cream rounded-full text-sm font-medium hover:bg-gold transition disabled:opacity-50"
        >
          {{ savingInfo ? '保存中...' : (isNew ? '创建并上传资产包 →' : '保存并继续 →') }}
        </button>
      </div>
    </section>

    <!-- 步骤 2: 资产包 -->
    <section v-show="step === 2" class="bg-surface rounded-2xl border border-line p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-display text-lg">② 资产包</h2>
        <div class="text-xs text-ink/60">
          必填 3 图 + 小传自动 / 选填 4 项 · 当前完成度
          <span class="font-mono ml-1" :class="completion === 100 ? 'text-success' : 'text-gold'">{{ completion }}%</span>
        </div>
      </div>
      <div class="h-1 bg-cream rounded-full overflow-hidden mb-6">
        <div class="h-full bg-gold transition-all" :style="{ width: completion + '%' }" />
      </div>
      <div v-if="!ip" class="p-6 bg-cream/60 rounded-xl text-center text-sm text-ink/60">
        请先完成步骤 ① 基础信息后再上传资产包
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="t in allAssetTypes"
          :key="t"
          class="p-4 border border-line rounded-xl flex items-center justify-between gap-3"
        >
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium flex items-center gap-2 flex-wrap">
              <span>{{ fileTypeLabel[t] }}</span>
              <span v-if="requiredTypes.includes(t)" class="text-danger text-[10px]">必填</span>
              <span v-else-if="t === 'BIO_TXT'" class="text-success text-[10px]">自动</span>
              <span v-else class="text-ink/40 text-[10px]">选填</span>
              <span v-if="t === 'BIO_TXT' && fileByType[t]?.originalName?.includes('_auto_')" class="text-[10px] px-1.5 py-0.5 bg-success/15 text-success rounded">从描述自动生成</span>
              <!-- 选填项: 为什么需要这个? (可展开) -->
              <button
                v-if="optionalHints[t]"
                type="button"
                @click="expandedHints[t] = !expandedHints[t]"
                class="text-[10px] text-ink/40 hover:text-ink underline"
              >
                {{ expandedHints[t] ? '收起' : '为什么需要这个?' }}
              </button>
            </div>
            <div v-if="expandedHints[t] && optionalHints[t]" class="mt-1 p-2 bg-cream/60 rounded text-xs text-ink/70 leading-relaxed">
              💡 {{ optionalHints[t] }}
            </div>
            <div v-if="fileByType[t]" class="text-xs text-success mt-1 truncate">✓ {{ fileByType[t].originalName }}</div>
            <div v-else-if="requiredTypes.includes(t)" class="text-xs text-danger mt-1">必填, 尚未上传</div>
            <div v-else-if="t === 'BIO_TXT'" class="text-xs text-ink/50 mt-1">未生成 (步骤 ① 保存后会自动生成)</div>
            <div v-else class="text-xs text-ink/40 mt-1">选填</div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="t === 'BIO_TXT'"
              type="button"
              @click="regenerateBio"
              :disabled="regeneratingBio || isUploading"
              class="px-3 py-2 border border-line rounded-full text-xs hover:bg-ink hover:text-cream transition disabled:opacity-50"
            >
              {{ regeneratingBio ? '生成中…' : (fileByType[t] ? '重新生成' : '生成小传') }}
            </button>
            <label
              :class="[
                'px-4 py-2 border rounded-full text-xs transition cursor-pointer',
                uploadingTypes[t]
                  ? 'bg-line text-ink/40 border-line cursor-wait'
                  : 'bg-cream border-line hover:bg-ink hover:text-cream',
              ]"
            >
              {{ uploadingTypes[t] ? `上传中 ${uploadProgress[t] ?? 0}%` : (fileByType[t] ? '替换' : '上传') }}
              <input
                type="file"
                class="hidden"
                :multiple="t === 'FACE_CLOSEUP'"
                :disabled="!!uploadingTypes[t]"
                :accept="t === 'LORA_FILE' ? '.safetensors' : t === 'BIO_TXT' || t === 'RECIPE_TXT' ? '.txt,.md' : t === 'VOICE_REF' ? '.wav,.mp3' : t === 'PACKAGE_ZIP' ? '.zip' : t === 'TRANSPARENT_RENDER' ? 'image/png' : 'image/*'"
                @change="(e) => {
                  const inp = e.target as HTMLInputElement;
                  const list = inp.files ? Array.from(inp.files) : [];
                  if (t === 'FACE_CLOSEUP') {
                    // 逐张上传 (避免并发覆盖 uploadingTypes 状态)
                    (async () => {
                      for (const f of list) {
                        await requestUploadPolicy(t, f);
                      }
                    })();
                  } else if (list[0]) {
                    requestUploadPolicy(t, list[0]);
                  }
                  inp.value = '';
                }"
              />
            </label>
          </div>
          <!-- 进度条:该 assetType 上传中时显示 -->
          <div
            v-if="uploadingTypes[t]"
            class="mt-2 w-full h-1 bg-line rounded-full overflow-hidden"
          >
            <div
              class="h-full bg-gold transition-all duration-150"
              :style="{ width: (uploadProgress[t] ?? 0) + '%' }"
            />
          </div>
          <!-- #31: FACE_CLOSEUP 专属 — 多张管理 + ⭐ 切换版权图 -->
          <div
            v-if="t === 'FACE_CLOSEUP' && faceCloseupFiles.length > 0"
            class="mt-3 space-y-1.5"
          >
            <div class="text-xs text-ink/60 font-medium">
              已上传 {{ faceCloseupFiles.length }} 张面部特写 ·
              <span class="text-gold">⭐ 标记的为版权登记图</span>
            </div>
            <div
              v-for="ff in faceCloseupFiles"
              :key="ff.id"
              class="flex items-center gap-2 p-2 bg-cream/40 rounded-lg text-xs"
            >
              <span class="truncate flex-1">{{ ff.displayName || ff.originalName }}</span>
              <span v-if="ip?.faceCloseupFileId === ff.id" class="text-gold text-sm" title="当前版权图">⭐</span>
              <button
                v-else
                type="button"
                class="text-ink/40 hover:text-gold text-sm"
                title="设为版权图"
                @click="setAsFaceCloseup(ff.id)"
              >
                ☆
              </button>
            </div>
            <div v-if="!ip?.faceCloseupFileId" class="text-xs text-danger">
              ⚠️ 请点击 ⭐ 指定其中一张作为版权登记图(平台将以此为依据与公众人物面部库做 1:1 比对)
            </div>
          </div>
        </div>

        <!-- #33 创作过程证据 — 多文件列表 + 累计 ≤600MB -->
        <div class="p-4 border border-line rounded-xl bg-cream/20">
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div class="flex items-baseline gap-2">
              <h3 class="font-medium text-sm">📂 创作过程证据</h3>
              <span class="text-[10px] text-ink/40">(选填 · 帮助平台加速审核 + 提升版权登记证据强度)</span>
            </div>
            <div class="text-xs font-mono">
              <span :class="processEvidenceTotal > PROCESS_EVIDENCE_MAX_MB * 1024 * 1024 * 0.9 ? 'text-danger' : 'text-ink/60'">
                {{ fmtMB(processEvidenceTotal) }} / {{ PROCESS_EVIDENCE_MAX_MB }} MB
              </span>
            </div>
          </div>
          <!-- 累计进度条 -->
          <div class="h-1 bg-line/60 rounded-full overflow-hidden mb-3">
            <div
              :class="processEvidenceTotal > PROCESS_EVIDENCE_MAX_MB * 1024 * 1024 * 0.9 ? 'bg-danger' : 'bg-gold'"
              class="h-full transition-all duration-300"
              :style="{ width: Math.min(100, (processEvidenceTotal / (PROCESS_EVIDENCE_MAX_MB * 1024 * 1024)) * 100) + '%' }"
            />
          </div>

          <!-- 已有证据列表 -->
          <div v-if="processEvidenceLoading" class="text-xs text-ink/50 py-2">加载中…</div>
          <div v-else-if="processEvidence.length === 0" class="text-xs text-ink/40 py-2">
            暂无证据 (下方表单添加 — 推荐传: 训练截图 / 工作流截图 / 出图对比 / 关键 prompt)
          </div>
          <div v-else class="space-y-1.5 mb-3">
            <div
              v-for="ev in processEvidence"
              :key="ev.id"
              class="flex items-center gap-2 p-2 bg-surface border border-line rounded-lg text-xs"
            >
              <span class="px-1.5 py-0.5 bg-gold/20 text-gold rounded text-[10px] font-mono shrink-0">
                {{ processStepLabel[ev.processStep || ''] || ev.processStep || '?' }}
              </span>
              <div class="flex-1 min-w-0">
                <div class="truncate text-ink/80">{{ ev.description || '(无说明)' }}</div>
                <div class="text-[10px] text-ink/40 mt-0.5 flex items-center gap-2">
                  <span class="truncate">{{ ev.originalName }}</span>
                  <span>·</span>
                  <span class="font-mono">{{ fmtMB(Number(ev.sizeBytes)) }}MB</span>
                  <span>·</span>
                  <span>{{ new Date(ev.uploadedAt).toLocaleString() }}</span>
                </div>
              </div>
              <button
                type="button"
                @click="deleteProcessEvidence(ev.id)"
                class="text-ink/30 hover:text-danger text-base shrink-0"
                title="删除"
              >×</button>
            </div>
          </div>

          <!-- 添加证据表单 -->
          <div class="space-y-2 p-3 bg-surface border border-dashed border-line rounded-lg">
            <div class="grid grid-cols-2 gap-2">
              <select
                v-model="newEvidenceStep"
                class="px-2 py-1.5 border border-line rounded-lg bg-cream text-xs"
                :disabled="processEvidenceUploading"
              >
                <option v-for="o in processStepOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <label
                :class="[
                  'px-3 py-1.5 border rounded-lg text-xs text-center cursor-pointer transition',
                  processEvidenceUploading
                    ? 'bg-line text-ink/30 border-line cursor-wait'
                    : 'bg-cream border-line hover:bg-ink hover:text-cream',
                ]"
              >
                <input
                  type="file"
                  class="hidden"
                  accept=".jpg,.jpeg,.png,.webp,.pdf,.mp4,.zip"
                  :disabled="processEvidenceUploading"
                  @change="onNewEvidenceFileChange"
                />
                {{ newEvidenceFileName || '📎 选择文件 (≤200MB)' }}
              </label>
            </div>
            <input
              v-model="newEvidenceDescription"
              type="text"
              maxlength="500"
              placeholder="说明: 数据集来源 / 训练时长 / 关键参数 等 (≤500字)"
              class="w-full px-2.5 py-1.5 border border-line rounded-lg bg-cream text-xs"
              :disabled="processEvidenceUploading"
            />
            <!-- 上传中进度条 -->
            <div v-if="processEvidenceUploading" class="h-1 bg-line rounded-full overflow-hidden">
              <div
                class="h-full bg-gold transition-all duration-150"
                :style="{ width: processEvidenceUploadProgress + '%' }"
              />
            </div>
            <div class="flex items-center justify-between gap-2">
              <div class="text-[10px] text-ink/40">
                接受: jpg/png/webp/pdf/mp4/zip, 单文件 ≤200MB, 单 IP 累计 ≤{{ PROCESS_EVIDENCE_MAX_MB }}MB
              </div>
              <button
                type="button"
                @click="addProcessEvidence"
                :disabled="processEvidenceUploading || !newEvidenceFile || !newEvidenceDescription.trim()"
                class="px-4 py-1.5 text-xs bg-ink text-cream rounded-full font-medium hover:bg-gold transition disabled:opacity-30 shrink-0"
              >
                {{ processEvidenceUploading ? `上传中 ${processEvidenceUploadProgress}%` : '+ 上传证据' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-8 p-4 bg-cream/60 rounded-xl text-sm text-ink/70 leading-relaxed">
        <strong class="text-ink">合规承诺</strong>:上传素材即视为您确认拥有该 AI 形象的完整知识产权,
        并同意承担《作品原创性及自主承担侵权责任承诺书》的法律责任。平台保留因肖像权、版权争议而下架 IP 的权利。
      </div>

      <div class="flex justify-between mt-6">
        <button
          type="button"
          @click="step = 1"
          class="px-6 py-2 text-sm text-ink/60 hover:text-ink"
        >← 返回基础信息</button>
        <button
          type="button"
          @click="step = 3"
          :disabled="!ip || completion < 100"
          class="px-8 py-2.5 bg-ink text-cream rounded-full text-sm font-medium hover:bg-gold transition disabled:opacity-40"
        >下一步:预览提交 →</button>
      </div>
    </section>

    <!-- 步骤 3: 预览提交 -->
    <section v-show="step === 3" class="bg-surface rounded-2xl border border-line p-6">
      <h2 class="font-display text-lg mb-4">③ 预览提交</h2>
      <div v-if="!ip" class="p-6 bg-cream/60 rounded-xl text-center text-sm text-ink/60">
        请先完成步骤 ① + ②
      </div>
      <div v-else class="space-y-4">
        <div class="grid grid-cols-2 gap-y-3 text-sm">
          <span class="text-ink/60">IP 名称</span><span class="font-medium">{{ ip.displayName }}</span>
          <span class="text-ink/60">编号</span><span class="font-mono text-xs">{{ ip.code }}</span>
          <span class="text-ink/60">性别 / 年龄</span><span>{{ ip.gender }} / {{ ip.visualAgeBucket }}</span>
          <span class="text-ink/60">风格</span><span>{{ (ip.styleTags || []).join(' · ') || '—' }}</span>
          <span class="text-ink/60">应用场景</span><span>{{ (ip.scenarioTags || []).join(' · ') || '—' }}</span>
          <span class="text-ink/60">意向金</span><span class="font-mono">¥{{ (Number(ip.depositPriceFen) / 100).toFixed(0) }}</span>
          <span class="text-ink/60">正式授权起价</span><span class="font-mono">¥{{ (Number(ip.fullLicensePriceFen) / 100).toFixed(0) }}</span>
          <span class="text-ink/60">资产完整度</span><span :class="completion === 100 ? 'text-success' : 'text-gold'">{{ completion }}%</span>
        </div>
        <div class="p-4 bg-cream/60 rounded-xl">
          <div class="text-xs text-ink/60 mb-2">已上传素材 ({{ files.length }})</div>
          <div class="space-y-1 text-sm">
            <div v-for="f in files" :key="f.id" class="flex justify-between gap-2">
              <span class="truncate">{{ fileTypeLabel[f.assetType]?.split('(')[0]?.trim() || f.assetType }}</span>
              <span class="text-ink/50 text-xs shrink-0">{{ f.originalName }}</span>
            </div>
          </div>
        </div>

        <div v-if="ip.status !== 'PENDING_REVIEW'" class="p-4 bg-ink/5 border border-ink/10 rounded-xl text-sm">
          当前状态: <span class="font-medium">{{ statusLabel(ip.status) }}</span>。
          <span v-if="ip.status === 'REJECTED'">如需重新提交,请联系平台管理员。</span>
        </div>

        <!-- 版权证书区: PUBLIC_INTENT/OFFICIAL_REGISTERED 始终显示;
             PENDING_REVIEW + cert REJECTED 时也显示 (cert 被拒后退到此状态,让创作者看到原因 + 重提) -->
        <div v-if="ip.status === 'PUBLIC_INTENT' || ip.status === 'OFFICIAL_REGISTERED' || (cert && cert.status === 'REJECTED')" class="p-5 bg-cream/40 border border-gold/30 rounded-2xl space-y-3">
          <div class="flex items-baseline justify-between">
            <h3 class="font-display text-base">📜 版权证书登记</h3>
            <span v-if="ip.status === 'OFFICIAL_REGISTERED'" class="text-xs text-success">已登记</span>
          </div>
          <p v-if="ip.status === 'PUBLIC_INTENT'" class="text-xs text-ink/60">
            平台已通过基础审核, 请提交版权证书 (PDF / JPG / PNG 扫描件) 以完成国家或省级作品著作权登记。
          </p>
          <CertSubmitSection :ipId="ip.id" :existingCert="cert" :ip="ip" @submitted="loadIp" />
        </div>

        <!-- OFFICIAL_REGISTERED 时显示下载证书按钮 (创作者需要拿到证书副本) -->
        <div v-if="ip.status === 'OFFICIAL_REGISTERED' && cert?.status === 'APPROVED'" class="p-5 bg-success/5 border border-success/30 rounded-2xl space-y-3">
          <h3 class="font-display text-base text-success">📄 下载版权证书</h3>
          <div class="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              @click="downloadCert"
              :disabled="downloadingCert"
              class="px-5 py-2 bg-ink text-cream rounded-full text-sm hover:bg-gold transition disabled:opacity-50"
            >
              {{ downloadingCert ? '下载中…' : '📄 下载证书 PDF' }}
            </button>
            <div class="text-xs text-ink/60 space-y-0.5">
              <div v-if="cert.certNo">证书编号: <span class="font-mono text-ink">{{ cert.certNo }}</span></div>
              <div v-if="cert.certIssuedAt">登记日期: {{ new Date(cert.certIssuedAt).toLocaleDateString() }}</div>
              <div v-if="cert.certFileName" class="text-ink/40">原始文件: {{ cert.certFileName }}</div>
            </div>
          </div>
        </div>

        <!-- 提交审核合规模块 — 必须勾选才能提交 -->
        <div v-if="ip.status === 'PENDING_REVIEW'" class="p-4 bg-cream/60 border border-line rounded-xl">
          <label class="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              v-model="agreedToTerms"
              class="mt-0.5 w-4 h-4 accent-ink cursor-pointer"
            />
            <span class="text-xs text-ink/70 leading-relaxed select-none">
              我已阅读并同意
              <a
                href="/legal/originality-commitment"
                target="_blank"
                class="text-gold underline hover:text-ink"
                @click.stop
              >《作品原创性及自主承担侵权责任承诺书》</a>
              ,确认上传的素材 (图片 / 模型 / 声音 / 文字) 系本人原创或已获合法授权,
              自主承担一切因侵权引发的法律责任。
            </span>
          </label>
        </div>

        <div class="flex justify-between mt-6">
          <button
            type="button"
            @click="step = 2"
            class="px-6 py-2 text-sm text-ink/60 hover:text-ink"
          >← 返回资产包</button>
          <button
            v-if="canSubmit"
            type="button"
            @click="submitForReview"
            :disabled="submitting"
            class="px-8 py-2.5 bg-ink text-cream rounded-full text-sm font-medium hover:bg-gold transition disabled:opacity-50"
          >
            {{ submitting ? '提交中...' : '提交审核' }}
          </button>
          <p v-else-if="!step2Done" class="text-sm text-ink/50">资产完整度需达到 100% 才能提交</p>
          <p v-else-if="ip.status === 'PENDING_REVIEW' && !agreedToTerms" class="text-sm text-ink/50">
            需勾选合规承诺才能提交
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
