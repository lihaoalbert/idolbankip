<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient, publicOssBase } from '@/api/client';

const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id as string);

const ip = ref<any>(null);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const success = ref('');

const rejectReason = ref('');
const certNo = ref('');
// #30.6.22 公示中回退补料 — admin 触发 PUBLIC_INTENT → PENDING_REVIEW,创作者改完重提(重 proofing)
const demoteReason = ref('');

const fileTypeLabel: Record<string, string> = {
  THREE_VIEW: '三视图',
  EXPRESSION_GRID: '表情矩阵',
  TRANSPARENT_RENDER: '立绘图',
  LORA_FILE: 'LoRA 模型',
  RECIPE_TXT: 'Prompt 说明书',
  BIO_TXT: '人物小传',
  VOICE_REF: '声音样本',
  PACKAGE_ZIP: '完整资产包',
  LEGAL_PROOF: '训练流程截图',
  TEST_SAMPLE: '示例输出',
  FACE_CLOSEUP: '面部特写',
  PROCESS_EVIDENCE: '创作过程证据',
};

// #30.6.22 后台审核 — 文件预览/下载
// 图片走 OSS 签名 URL inline 渲染;文字/二进制走下载
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const TEXT_MIMES = new Set(['text/plain', 'text/markdown']);
const AUDIO_MIMES = new Set(['audio/wav', 'audio/mpeg', 'audio/mp3']);
const VIDEO_MIMES = new Set(['video/mp4']);

const lightboxFile = ref<any | null>(null);
const lightboxUrl = ref<string>('');
const lightboxLoading = ref(false);
const downloadingId = ref<string | null>(null);
const textPreviewMap = ref<Record<string, string>>({});
const textLoadingId = ref<string | null>(null);

function isImage(f: any) { return IMAGE_MIMES.has(f.mimeType || ''); }
function isText(f: any) { return TEXT_MIMES.has(f.mimeType || ''); }
function isAudio(f: any) { return AUDIO_MIMES.has(f.mimeType || ''); }
function isVideo(f: any) { return VIDEO_MIMES.has(f.mimeType || ''); }

async function openLightbox(f: any) {
  if (!isImage(f)) return;
  lightboxFile.value = f;
  lightboxUrl.value = '';
  lightboxLoading.value = true;
  try {
    const { data } = await apiClient.get(`/admin/ips/${id.value}/files/${f.id}/url`, { params: { mode: 'preview' } });
    lightboxUrl.value = data.url;
  } catch (e: any) {
    error.value = e?.response?.data?.message || '预览链接获取失败';
  } finally {
    lightboxLoading.value = false;
  }
}

function closeLightbox() {
  lightboxFile.value = null;
  lightboxUrl.value = '';
}

async function loadTextPreview(f: any) {
  if (textPreviewMap.value[f.id] || textLoadingId.value === f.id) return;
  textLoadingId.value = f.id;
  try {
    const { data } = await apiClient.get(`/admin/ips/${id.value}/files/${f.id}/url`, { params: { mode: 'preview' } });
    const res = await fetch(data.url);
    const txt = await res.text();
    textPreviewMap.value[f.id] = txt.length > 8000 ? txt.slice(0, 8000) + '\n\n… (已截断,完整内容请下载查看)' : txt;
  } catch (e: any) {
    error.value = e?.response?.data?.message || '文本预览失败';
  } finally {
    textLoadingId.value = null;
  }
}

async function downloadFile(f: any) {
  if (downloadingId.value) return;
  downloadingId.value = f.id;
  try {
    const { data } = await apiClient.get(`/admin/ips/${id.value}/files/${f.id}/url`, { params: { mode: 'download' } });
    const a = document.createElement('a');
    a.href = data.url;
    a.download = data.filename || f.originalName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (e: any) {
    error.value = e?.response?.data?.message || '下载链接获取失败';
  } finally {
    downloadingId.value = null;
  }
}

function onLightboxBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) closeLightbox();
}

// #30.6.22 全局 Escape 监听 — Teleport 后 lightbox 自身 focus 不稳,
//   挂 document 上更稳,关掉时清理
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && lightboxFile.value) closeLightbox();
}
import { onUnmounted, watch } from 'vue';
watch(lightboxFile, (v) => {
  if (v) document.addEventListener('keydown', onDocKeydown);
  else document.removeEventListener('keydown', onDocKeydown);
});
onUnmounted(() => document.removeEventListener('keydown', onDocKeydown));
// #33 创作过程证据 — 步骤中文 label
const processStepLabel: Record<string, string> = {
  TRAINING_DATA_PREP: '数据准备',
  TRAINING: '模型训练',
  GENERATION: '出图',
  POST_PROCESSING: '后期处理',
  OTHER: '其他',
};

// #32 enum 值 → 中文 label
const genderLabel: Record<string, string> = { FEMALE: '女', MALE: '男', NONBINARY: '无性别' };
const ageLabel: Record<string, string> = { CHILD: '童颜', YOUNG: '青年', MIDDLE: '中年', ELDERLY: '银发' };
const ethnicityLabel: Record<string, string> = {
  EAST_ASIAN: '东亚', SOUTHEAST_ASIAN: '东南亚', SOUTH_ASIAN: '南亚',
  AFRICAN: '非洲', EUROPEAN: '欧洲', MIXED: '混合/其他',
};

// 与前端/后端一致: 4 个核心必填;LORA/RECIPE 选填
const requiredTypes = ['THREE_VIEW', 'EXPRESSION_GRID', 'TRANSPARENT_RENDER', 'BIO_TXT'];

const fileByType = computed(() => {
  const m: Record<string, any> = {};
  for (const f of ip.value?.files || []) m[f.assetType] = f;
  return m;
});

const packComplete = computed(() => requiredTypes.every((t) => fileByType.value[t]?.validated));

async function load() {
  loading.value = true;
  try {
    // 后端 admin 端: /admin/ips/:id 拿完整信息 (返回 { ip, files, creator })
    const { data } = await apiClient.get(`/admin/ips/${id.value}`);
    ip.value = { ...(data.ip || {}), files: data.files || [], creator: data.creator || null };
  } catch (e: any) {
    // fallback: 从公开接口按 id 查不到(只有 code),暂时显示错误
    error.value = e?.response?.data?.message || '加载失败';
  } finally { loading.value = false; }
}

async function approve() {
  if (!confirm('确认审核通过?系统将进入区块链存证流程,完成存证后自动转为 PUBLIC_INTENT。')) return;
  submitting.value = true;
  error.value = ''; success.value = '';
  try {
    const { data } = await apiClient.post(`/admin/ips/${id.value}/approve`);
    ip.value = data.ip;
    success.value = '审核已提交,正在执行存证...请稍后刷新';
  } catch (e: any) {
    error.value = e?.response?.data?.message || '操作失败';
  } finally { submitting.value = false; }
}

async function reject() {
  if (!rejectReason.value.trim()) { error.value = '请填写拒绝原因'; return; }
  if (!confirm('确认拒绝?该 IP 将进入 REJECTED 状态,创作者可见。')) return;
  submitting.value = true;
  error.value = ''; success.value = '';
  try {
    const { data } = await apiClient.post(`/admin/ips/${id.value}/reject`, { reason: rejectReason.value });
    ip.value = data.ip;
    success.value = '已拒绝';
    rejectReason.value = '';
  } catch (e: any) {
    error.value = e?.response?.data?.message || '操作失败';
  } finally { submitting.value = false; }
}

async function registerCert() {
  if (!certNo.value.trim()) { error.value = '请填写国家版权局登记号'; return; }
  if (!confirm(`确认登记号: ${certNo.value} ?该操作将 IP 转为 OFFICIAL_REGISTERED 状态。`)) return;
  submitting.value = true;
  error.value = ''; success.value = '';
  try {
    const { data } = await apiClient.post(`/admin/ips/${id.value}/register-cert`, { certNo: certNo.value });
    ip.value = data.ip;
    success.value = '登记号已写入,IP 已转为 OFFICIAL_REGISTERED';
    certNo.value = '';
  } catch (e: any) {
    error.value = e?.response?.data?.message || '操作失败';
  } finally { submitting.value = false; }
}

// #30.6.22 公示中回退补料 — PUBLIC_INTENT → PENDING_REVIEW
// 注意: 旧 blockchain hash/tx 留底 (proofing 重提交时会覆盖),AuditLog IP_TRANSITION_PENDING_REVIEW 有痕迹
async function demote() {
  const reason = demoteReason.value.trim();
  if (reason.length < 5) { error.value = '请填写回退原因 (≥5 字),创作者端会直接显示'; return; }
  if (!confirm(`确认回退补料?\n\n该操作将 ${ip.value.code} 从公示中回退到待审核状态,创作者可见原因,改完后需要重新走存证流程(新 hash)。\n\n原因: ${reason}`)) return;
  submitting.value = true;
  error.value = ''; success.value = '';
  try {
    const { data } = await apiClient.post(`/admin/ips/${id.value}/demote`, { reason });
    ip.value = data.ip;
    success.value = '已回退至待审核,创作者会收到通知。旧链上 hash 由 AuditLog 留底。';
    demoteReason.value = '';
  } catch (e: any) {
    error.value = e?.response?.data?.message || '操作失败';
  } finally { submitting.value = false; }
}

function statusLabel(s: string) {
  return { PENDING_REVIEW: '待审核', REVIEWED_PROOFING: '存证中', PUBLIC_INTENT: '公示中', OFFICIAL_REGISTERED: '已登记', REJECTED: '已拒绝', ARCHIVED: '已归档' }[s] || s;
}

// #30.6.22 KYC 状态中文 label — Prisma enum 有 NOT_SUBMITTED (空) 和 NONE (空字段) 两种
const kycLabel: Record<string, string> = { APPROVED: '已通过', PENDING: '审核中', REJECTED: '已拒绝', NONE: '未提交', NOT_SUBMITTED: '未提交' };

function thumbnailUrl(key: string) { return `${publicOssBase}/${key}`; }

// #30.6.22 缩略图 — 拿 OSS 签名 URL 后用 <img> 渲染
// 简单做法: 把映射存到 ref,模板里直接读;load() 时一次性批量预拉
const thumbUrls = ref<Record<string, string>>({});
async function loadThumb(fileId: string) {
  if (thumbUrls.value[fileId] !== undefined) return;
  try {
    const { data } = await apiClient.get(`/admin/ips/${id.value}/files/${fileId}/url`, { params: { mode: 'preview' } });
    thumbUrls.value[fileId] = data.url;
  } catch (e) {
    thumbUrls.value[fileId] = ''; // 标记为已尝试
  }
}
function getThumb(fileId: string) { return thumbUrls.value[fileId]; }

// 在 load() 拿到 ip.files 后, 一次性预拉所有图片的缩略图签名 URL
const _origLoad = load;
async function loadWithThumbs() {
  await _origLoad();
  // 等 ip.value 有 files 后, 给每个图片类型预拉
  for (const f of ip.value?.files || []) {
    if (isImage(f)) loadThumb(f.id);
  }
}

onMounted(loadWithThumbs);
</script>

<template>
  <div v-if="loading" class="text-center py-20 text-ink/40">加载中...</div>

  <div v-else-if="ip" class="max-w-5xl mx-auto px-6 py-8">
    <button @click="router.back()" class="text-xs text-ink/50 hover:text-ink mb-4">← 返回</button>

    <!-- Header -->
    <div class="card-base mb-6">
      <div class="flex items-start gap-6">
        <img v-if="ip.thumbnailKey" :src="thumbnailUrl(ip.thumbnailKey)" class="w-32 h-32 rounded-xl object-cover border border-line" />
        <div class="flex-1">
          <div class="flex items-baseline gap-3">
            <h1 class="font-display text-2xl">{{ ip.displayName }}</h1>
            <span class="font-mono text-xs text-ink/40">{{ ip.code }}</span>
          </div>
          <p v-if="ip.tagline" class="text-sm text-ink/60 mt-1">{{ ip.tagline }}</p>
          <div class="flex flex-wrap items-center gap-2 mt-3 text-xs">
            <span class="badge bg-ink/10 text-ink/70">{{ genderLabel[ip.gender] || ip.gender }} · {{ ageLabel[ip.ageBucket] || ip.ageBucket }}{{ ip.ethnicity ? ' · ' + ethnicityLabel[ip.ethnicity] : ' · ⚠️未标注种族' }}</span>
          <span v-if="Array.isArray(ip.faceTags) && ip.faceTags.length" class="badge bg-gold/15 text-ink/70">
            脸特征 {{ ip.faceTags.length }} 个
          </span>
            <span v-for="t in (ip.styleTags || '').split(',').filter(Boolean)" :key="t" class="badge bg-cream border border-line">{{ t }}</span>
            <span class="badge bg-warn/15 text-warn">{{ statusLabel(ip.status) }}</span>
          </div>
          <div class="mt-3 text-xs text-ink/50 space-y-1">
            <!-- #30.6.22 作者信息卡 — 头像 / 邮箱 / 昵称 / KYC / 链到公开主页 -->
            <div class="flex items-center gap-3 py-2 px-3 bg-cream/60 border border-line rounded-lg">
              <img
                v-if="ip.creator?.avatarUrl"
                :src="ip.creator.avatarUrl"
                :alt="ip.creator?.displayName || ''"
                class="w-9 h-9 rounded-full object-cover border border-line shrink-0"
                referrerpolicy="no-referrer"
              />
              <div v-else class="w-9 h-9 rounded-full bg-ink/10 flex items-center justify-center text-ink/50 text-sm shrink-0">👤</div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-ink font-medium">{{ ip.creator?.displayName || '—' }}</span>
                  <span
                    :class="[
                      'text-[10px] px-1.5 py-0.5 rounded',
                      (ip.creator?.kycStatus === 'APPROVED' || ip.creator?.kycStatus === 'APPROVED_AUTO') ? 'bg-success/15 text-success'
                      : ip.creator?.kycStatus === 'PENDING' ? 'bg-warn/15 text-warn'
                      : ip.creator?.kycStatus === 'REJECTED' ? 'bg-danger/10 text-danger'
                      : 'bg-ink/10 text-ink/50'
                    ]"
                  >
                    KYC: {{ kycLabel[ip.creator?.kycStatus || 'NONE'] || '未提交' }}
                  </span>
                </div>
                <div class="text-ink/60 font-mono text-[11px] mt-0.5">{{ ip.creator?.email }}</div>
              </div>
              <a
                v-if="ip.creator?.id"
                :href="`https://ibi.ren/u/${ip.creator.id}`"
                target="_blank"
                rel="noopener"
                class="text-[11px] text-gold hover:underline shrink-0"
              >公开主页 →</a>
            </div>
            <div>意向金: ¥{{ (ip.depositPriceFen / 100).toFixed(2) }} · 正式授权起价: ¥{{ (ip.fullLicensePriceFen / 100).toFixed(2) }}</div>
            <div v-if="ip.blockchainTxId">区块链存证: <span class="font-mono">{{ ip.blockchainTxId }}</span> · 哈希 <span class="font-mono">{{ ip.blockchainHash?.slice(0, 16) }}…</span></div>
            <div v-if="ip.officialCertNo">版权登记号: <span class="font-mono">{{ ip.officialCertNo }}</span></div>
            <div v-if="ip.rejectionReason" class="text-danger">拒绝原因: {{ ip.rejectionReason }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="mb-4 p-3 bg-danger/10 text-danger text-sm rounded-lg">{{ error }}</div>
    <div v-if="success" class="mb-4 p-3 bg-success/10 text-success text-sm rounded-lg">{{ success }}</div>

    <!-- 资产包完整度 -->
    <section class="card-base mb-6">
      <h2 class="font-medium mb-4">资产包完整度</h2>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
        <div
          v-for="t in requiredTypes"
          :key="t"
          :class="['p-3 rounded-xl border text-sm', fileByType[t]?.validated ? 'border-success/30 bg-success/5' : 'border-warn/30 bg-warn/5']"
        >
          <div class="font-medium">{{ fileTypeLabel[t] }}</div>
          <div v-if="fileByType[t]?.validated" class="text-xs text-success mt-1">✓ {{ fileByType[t].originalName }}</div>
          <div v-else class="text-xs text-warn mt-1">⚠ 缺失</div>
        </div>
      </div>
    </section>

    <!-- 人物小传 -->
    <section v-if="ip.description" class="card-base mb-6">
      <h2 class="font-medium mb-2">人物小传</h2>
      <pre class="whitespace-pre-wrap text-sm text-ink/80 font-mono">{{ ip.description }}</pre>
    </section>

    <!-- 全部文件 — #30.6.22 加缩略图/预览/下载 -->
    <section class="card-base mb-6">
      <h2 class="font-medium mb-3">全部已上传文件 ({{ ip.files?.length || 0 }})</h2>
      <div v-if="!ip.files?.length" class="text-sm text-ink/50 py-8 text-center">该 IP 还没有文件</div>
      <ul v-else class="divide-y divide-line">
        <li v-for="f in ip.files" :key="f.id" class="py-4 first:pt-0 last:pb-0">
          <div class="flex items-start gap-4">
            <!-- 缩略图 / 类型图标 -->
            <div class="shrink-0">
              <button
                v-if="isImage(f)"
                type="button"
                @click="openLightbox(f)"
                :title="`点击预览 ${f.originalName}`"
                class="block w-20 h-20 rounded-lg overflow-hidden border border-line hover:border-gold transition bg-cream relative"
              >
                <img
                  v-if="getThumb(f.id)"
                  :src="getThumb(f.id)"
                  :alt="f.originalName"
                  class="w-full h-full object-cover"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-[10px] text-ink/40">加载中…</div>
              </button>
              <div
                v-else
                class="w-20 h-20 rounded-lg border border-line bg-cream flex flex-col items-center justify-center text-[10px] text-ink/50 text-center px-1"
              >
                <span class="text-lg mb-0.5">
                  {{ isText(f) ? '📄' : isAudio(f) ? '🎵' : isVideo(f) ? '🎬' : '📦' }}
                </span>
                <span class="leading-tight">{{ (f.mimeType || '').split('/')[1] || f.assetType }}</span>
              </div>
            </div>

            <!-- 中间:文件名 + 元数据 -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium text-ink truncate">{{ f.originalName }}</span>
                <span class="text-[10px] px-1.5 py-0.5 bg-cream border border-line text-ink/60 rounded">{{ fileTypeLabel[f.assetType] || f.assetType }}</span>
                <span v-if="f.validated" class="text-[10px] px-1.5 py-0.5 bg-success/15 text-success rounded">✓ 校验通过</span>
                <span v-else class="text-[10px] px-1.5 py-0.5 bg-warn/15 text-warn rounded">⚠ 待校验</span>
                <span v-if="f.id === ip.faceCloseupFileId" class="text-[10px] px-1.5 py-0.5 bg-gold/20 text-gold rounded">⭐ 版权图</span>
              </div>
              <div class="mt-1 text-[11px] text-ink/50 flex items-center gap-3 flex-wrap font-mono">
                <span>{{ (Number(f.sizeBytes) / 1024 / 1024).toFixed(2) }} MB</span>
                <span>SHA-256: {{ f.checksumSha256?.slice(0, 12) }}…</span>
                <span>{{ f.mimeType || 'application/octet-stream' }}</span>
              </div>
              <div v-if="f.processStep" class="mt-1 text-[11px] text-gold">
                步骤: {{ processStepLabel[f.processStep] || f.processStep }}
              </div>
              <div v-if="f.description" class="mt-1 text-[11px] text-ink/70 whitespace-pre-wrap break-words">
                {{ f.description }}
              </div>

              <!-- 文字文件内联预览 -->
              <div v-if="isText(f)" class="mt-2">
                <button
                  type="button"
                  @click="loadTextPreview(f)"
                  :disabled="textLoadingId === f.id"
                  class="text-[11px] text-gold hover:underline"
                >
                  {{ textPreviewMap[f.id] ? '刷新' : '展开预览' }}
                </button>
                <pre
                  v-if="textPreviewMap[f.id]"
                  class="mt-2 p-3 bg-cream border border-line rounded text-[11px] leading-relaxed text-ink/80 max-h-60 overflow-auto whitespace-pre-wrap break-words"
                >{{ textPreviewMap[f.id] }}</pre>
              </div>
            </div>

            <!-- 右侧:操作按钮 -->
            <div class="shrink-0 flex flex-col gap-2">
              <button
                v-if="isImage(f)"
                type="button"
                @click="openLightbox(f)"
                class="btn-secondary text-xs"
              >查看大图</button>
              <button
                type="button"
                @click="downloadFile(f)"
                :disabled="downloadingId === f.id"
                class="btn-secondary text-xs"
              >{{ downloadingId === f.id ? '下载中…' : '⬇ 下载' }}</button>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- 操作面板 -->
    <section v-if="ip.status === 'PENDING_REVIEW'" class="card-base border-gold/30 bg-gold/5">
      <h2 class="font-medium mb-3">审核操作</h2>
      <div v-if="!packComplete" class="p-3 bg-warn/10 text-warn text-sm rounded-lg mb-4">
        ⚠ 资产包不完整 (缺 {{ requiredTypes.filter(t => !fileByType[t]?.validated).length }} 项),无法通过审核。
      </div>
      <div class="space-y-3">
        <button @click="approve" :disabled="submitting || !packComplete" class="btn-primary">
          ✓ 审核通过 · 进入区块链存证
        </button>
        <div class="flex gap-2">
          <input v-model="rejectReason" placeholder="拒绝原因 (必填)" class="input-base flex-1" />
          <button @click="reject" :disabled="submitting" class="btn-danger">✗ 拒绝</button>
        </div>
      </div>
    </section>

    <section v-else-if="ip.status === 'PUBLIC_INTENT'" class="card-base border-success/30 bg-success/5">
      <h2 class="font-medium mb-3">登记版权</h2>
      <p class="text-xs text-ink/60 mb-3">IP 状态为公示中,需要登记国家版权局号后转为 OFFICIAL_REGISTERED,届时所有意向金订单自动生效。</p>
      <div class="flex gap-2">
        <input v-model="certNo" placeholder="国家版权局登记号 (如:2026-F-1234567)" class="input-base flex-1 font-mono" />
        <button @click="registerCert" :disabled="submitting" class="btn-primary">登记</button>
      </div>

      <!-- #30.6.22 回退补料 — 仅公示中可触发,创作者改完后重提交会重跑 proofing 出新 hash -->
      <div class="mt-6 pt-4 border-t border-success/20">
        <h3 class="font-medium text-sm mb-2">回退补料 (公示中 → 待审核)</h3>
        <p class="text-xs text-ink/60 mb-2">用于: 创作者漏传资产 / 元数据需修订等。重提交会重新计算区块链 hash,旧 hash 在 AuditLog 留底。</p>
        <div class="flex gap-2">
          <input v-model="demoteReason" placeholder="回退原因 (≥5 字,创作者可见)" class="input-base flex-1" />
          <button @click="demote" :disabled="submitting" class="btn-secondary">↩ 回退补料</button>
        </div>
      </div>
    </section>

    <section v-else class="card-base">
      <div class="text-sm text-ink/60">该 IP 当前状态 ({{ statusLabel(ip.status) }}) 不需要运营操作。</div>
    </section>

    <!-- #30.6.22 图片预览灯箱 — Teleport 到 body, 避免被父级 overflow/transform 裁剪 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="lightboxFile"
          class="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6"
          @click="onLightboxBackdrop"
          tabindex="-1"
        >
          <div class="relative bg-surface rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl" @click.stop>
            <div class="flex items-center justify-between gap-3 px-5 py-3 border-b border-line shrink-0">
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium truncate">{{ lightboxFile.originalName }}</div>
                <div class="text-[11px] text-ink/50 mt-0.5">
                  {{ fileTypeLabel[lightboxFile.assetType] || lightboxFile.assetType }} · {{ lightboxFile.mimeType }} · {{ (Number(lightboxFile.sizeBytes) / 1024 / 1024).toFixed(2) }} MB
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button type="button" @click="downloadFile(lightboxFile)" :disabled="downloadingId === lightboxFile.id" class="px-3 py-1.5 text-xs border border-line rounded-full hover:bg-cream transition">
                  {{ downloadingId === lightboxFile.id ? '下载中…' : '⬇ 下载' }}
                </button>
                <button type="button" @click="closeLightbox" class="px-2.5 py-1.5 text-ink/50 hover:text-ink text-lg" title="关闭 (Esc)">×</button>
              </div>
            </div>
            <div class="flex-1 overflow-auto bg-ink/95 flex items-center justify-center min-h-[300px]">
              <img v-if="lightboxUrl" :src="lightboxUrl" :alt="lightboxFile.originalName" class="max-w-full max-h-[80vh] object-contain" referrerpolicy="no-referrer" />
              <div v-else-if="lightboxLoading" class="text-cream/60 text-sm">加载中…</div>
              <div v-else class="text-cream/40 text-sm">无法加载预览</div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
