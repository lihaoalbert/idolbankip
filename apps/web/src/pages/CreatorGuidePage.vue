<script setup lang="ts">
/**
 * 捏者使用手册 — 公开 onboarding 文档
 * 给内部同事 / 试用创作者看,完整覆盖注册 → KYC → 上传 → 提交 → 公示 全流程
 *
 * 内容 100% 反映当前实现:
 * - KYC 流程见 apps/web/src/pages/creator/OnboardPage.vue
 * - 资产 spec 见 apps/web/src/pages/creator/IpWizard.vue (fileTypeLabel L164-174)
 * - 状态机见 apps/api/src/ips/ips.service.ts TRANSITIONS L17-26
 * - AI 快速通道见 IpWizard.vue L389 (quickFaceUploading)
 */
const lastUpdated = '2026-06-22';
const version = 'v1.0';

const overview = [
  { no: '01', title: '注册账号', time: '~1 分钟', summary: '邮箱 + 密码,默认拿 BUYER 角色' },
  { no: '02', title: 'KYC 实名升级', time: '1-2 工作日', summary: '填身份证号 → 阿里云实人认证 → 自动开通 CREATOR 角色' },
  { no: '03', title: '创建 IP', time: '~30 分钟', summary: '3 步 wizard:基础信息 → 资产包 → 预览提交' },
  { no: '04', title: '上传资产', time: '视文件大小', summary: '4 必传(自传三视图)+ 4 选传(LoRA / Prompt / 声音 / 资产包)' },
  { no: '05', title: '提交审核', time: '1-3 工作日', summary: '平台人工审核 + 区块链时间戳存证' },
  { no: '06', title: '公示期', time: '1-3 周', summary: 'IP 进入公开形象库,可被采购方浏览' },
  { no: '07', title: '登记版权', time: '同 06', summary: '平台代为申请国家或省级作品著作权登记证书' },
];

const kycFields = [
  { name: 'realName', label: '真实姓名', required: true, note: '身份证上的姓名,审核员会核对' },
  { name: 'idNumber', label: '身份证号', required: true, note: '18 位,国密 SM2 加密,仅版权登记机构可见' },
  { name: 'phone', label: '手机号', required: false, note: '选填,用于紧急联系 / 短信通知' },
];

const step1Fields = [
  { name: 'displayName', label: '形象名', required: true, note: '对外展示的主标题, 2-30 字' },
  { name: 'tagline', label: '副标', required: false, note: '一句话定位, ≤60 字' },
  { name: 'description', label: '人物小传', required: true, note: '300-1500 字,会自动生成 BIO_TXT 资产' },
  { name: 'gender / ageBucket / ethnicity', label: '基础属性', required: true, note: '性别 / 年龄段(童/青/中/银)/ 种族(东亚/东南亚/南亚/非洲/欧洲/混合)' },
  { name: 'styleTags / scenarioTags', label: '风格/场景标签', required: true, note: '各 2-5 个,逗号分隔' },
  { name: 'faceTags', label: '脸特征', required: false, note: 'FaceShape / HairColor / Vibe 等多选分类' },
  { name: 'depositPriceFen', label: '意向金 (分)', required: false, note: '公示前可下定的测试价' },
  { name: 'fullLicensePriceFen', label: '正式授权起价 (分)', required: true, note: '整数,100 分 = 1 元' },
];

const requiredAssets = [
  {
    key: 'FACE_CLOSEUP',
    name: '面部特写 ⭐',
    shortName: '面部',
    format: 'jpg / png / webp',
    size: '≥2048×2048, 100KB - 30MB',
    must: true,
    self: '必须自传',
    spec: '版权登记核心证据 · 单一人物 · 正面 · 清晰人脸 · 无遮挡 · 光线均匀',
    whySelf: '版权登记员要看到清晰可辨识的人脸作为权属判定依据;AI 补全容易出现五官飘移、左右不对称、表情僵硬等问题,被审核员判为"不清晰"概率高。',
  },
  {
    key: 'THREE_VIEW',
    name: '三视图',
    shortName: '三视图',
    format: 'jpg / png / webp',
    size: '≥2048×2048, 100KB - 30MB',
    must: true,
    self: '推荐自传',
    spec: '正视图 / 侧视图 / 后视图 同一角色 · 比例尺参考 · 同一光线',
    whySelf: 'AI 出图难控制三个角度的比例一致(头身比、身高比例、服饰位置),审核员会肉眼对比三视图是否同一角色;自传三视图是 1 次过审的关键。',
  },
  {
    key: 'EXPRESSION_GRID',
    name: '表情矩阵',
    shortName: '表情',
    format: 'jpg / png / webp',
    size: '≥2048×2048, 100KB - 30MB',
    must: true,
    self: 'AI 可用',
    spec: '6 / 8 / 9 宫格 · 至少包含 喜/怒/哀/惊/中性/思考 6 表情',
    whySelf: '同一 LoRA 出多表情相对稳定,AI 可用;但建议至少留 1-2 个自己手画/精修的关键表情(尤其是"中性"),审核时辨识度更高。',
  },
  {
    key: 'TRANSPARENT_RENDER',
    name: '立绘',
    shortName: '立绘',
    format: 'PNG 带 alpha 通道',
    size: '≥2048×2048, 100KB - 30MB',
    must: true,
    self: 'AI 可用',
    spec: '角色全身立绘 · 背景透明 · 完整可见(头顶到脚底)',
    whySelf: 'AI 用 controlnet 出立绘较稳;唯一坑点是 alpha 通道裁剪要把脚下阴影也裁掉,导出后用 PS 检查一下。',
  },
];

const optionalAssets = [
  { key: 'BIO_TXT', name: '人物小传', spec: '从 description 自动生成, 可在 wizard 步骤②手动覆盖' },
  { key: 'LORA_FILE', name: 'LoRA 模型', spec: '.safetensors · 1MB-300MB · 让买家在 ComfyUI / SD WebUI 直接复现你的风格,大幅提高成交率' },
  { key: 'RECIPE_TXT', name: 'Prompt 说明书', spec: '.txt / .md · ≤1MB · 正向/反向 prompt + 采样参数 + 推荐模型;买家不用猜怎么出图' },
  { key: 'VOICE_REF', name: '声音样本', spec: '.wav / .mp3 · 50KB-50MB · 短剧/直播/有声场景的买家会用,让你的形象"会说话"' },
  { key: 'PACKAGE_ZIP', name: '完整资产包', spec: '.zip · 1KB-1GB · 一次性打包所有源文件(PSD/Blender 工程等),适合工作室买家' },
];

const stateMachine = [
  { status: 'PENDING_REVIEW', label: '待审核', user: '可编辑,可上传文件,可批量提交', admin: '审核队列中,1-3 工作日内处理' },
  { status: 'REVIEWED_PROOFING', label: '存证中', user: '不可编辑', admin: '区块链时间戳存证中(自动,通常 1-2 分钟)' },
  { status: 'PUBLIC_INTENT', label: '公示中', user: '不可编辑,但 IP 已公开,采购方可下定', admin: '等平台代为申请作品著作权登记证书,完成后 admin 写入登记号' },
  { status: 'OFFICIAL_REGISTERED', label: '已登记', user: '不可编辑,可下载证书,可被采购方正式授权', admin: '终态之一,可归档' },
  { status: 'REJECTED', label: '已拒绝', user: '可看拒绝原因,可修改后重新提交,可归档', admin: '常见原因:资产不清晰 / 缺必传 / 涉嫌抄袭 / 重复 IP' },
  { status: 'ARCHIVED', label: '已归档', user: '完全隐藏,不可见', admin: '终态,需联系客服恢复' },
];

const faqs = [
  {
    q: '审核一般要多久?',
    a: 'PENDING_REVIEW 提交后,平台 1-3 工作日内人工审核;审核通过后自动进入 PUBLIC_INTENT(公示期),平台代为申请作品著作权登记证书,整个流程 1-3 周。',
  },
  {
    q: '审核被拒怎么办?',
    a: '在 /creator 可看到"已拒绝"状态 + 拒绝原因(例:三视图比例不一致)。点击进入 wizard 修改资产 → 重新提交。注意:重新提交会重新计算区块链 hash,旧 hash 在 AuditLog 留底。',
  },
  {
    q: '公示中(IP 已公开)还能改吗?',
    a: '不能直接改。需要联系管理员(admin@ibi.ren)使用"回退补料"功能,IP 状态回退到 PENDING_REVIEW,创作者端会显示回退原因;改完后重提交会重新计算区块链 hash。',
  },
  {
    q: 'AI 快速通道是啥?',
    a: '进 wizard 不填任何字段,直接传一张面部特写 → 平台自动用默认值建 IP(展示名"未命名 IP",描述"待 AI 补全")→ 调 /ai/recognize-face 识别后自动填入 9 个元数据字段(displayName / description / gender / ageBucket / ethnicity / faceTags / styleTags / scenarioTags)。适合快速出 demo,正式 IP 仍建议手动精调。',
  },
  {
    q: 'AI 自动生成的三视图可靠吗?',
    a: '表情矩阵 / 立绘相对稳定(同 LoRA + 多 seed);三视图 3 个角度比例一致是难点,AI 出图经常正视图和侧视图头身比不一致,自传三视图 1 次过审概率远高于 AI。',
  },
  {
    q: '我可以上传别人的 IP 吗?',
    a: '不可以。平台要求所有素材为原创或已取得合法授权,提交时需勾选"原创性承诺书"(/legal/originality-commitment)。如发现抄袭,平台将下架作品,情节严重者封号。',
  },
  {
    q: '我能在两个账号之间转移 IP 吗?',
    a: '目前不支持 IP 跨账号转移。如有特殊需求(公司变更、账号合并),联系 admin@ibi.ren。',
  },
  {
    q: '怎么接平台发布的官方任务?',
    a: '在 /creator/tasks 任务板接 OPEN 任务 → 确认接单后会自动跳转到 /creator/ips/new 并预填 spec(性别/年龄段/风格)。这种 IP 版权归平台,审核通过后获得报酬。',
  },
  {
    q: '怎么导出我的 IP 数据?',
    a: '目前无自助导出。联系 admin@ibi.ren 申请,我们会打包你的 IP 元数据 + 文件清单(JSON 格式)发到注册邮箱。',
  },
  {
    q: 'KYC 被拒了怎么办?',
    a: 'KYC 状态在 /creator/onboard 可看到。常见被拒原因:身份证号位数不对 / 姓名与身份证不一致 / 实人认证照片质量低。修正后重新提交。',
  },
];
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <!-- 顶部条 -->
    <header class="hairline-b border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div class="catalog-no text-ink/50">ibi.ren · CREATOR MANUAL</div>
        <div class="catalog-no text-ink/40">VOL. I — ONBOARDING</div>
        <div class="catalog-no text-ink/30">VERSION {{ version }}</div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-6 lg:px-10 py-14 md:py-20">

      <!-- HERO -->
      <header class="mb-12 md:mb-16">
        <div class="flex items-center justify-between mb-6">
          <div class="catalog-no text-ink/50">№ 100 · CREATOR'S MANUAL</div>
          <div class="catalog-no text-ink/30">HANGZHOU · CN</div>
        </div>

        <h1 class="font-display text-4xl md:text-6xl text-ink leading-[0.95]">
          捏者<span class="font-display-italic text-gold">使用</span>手册
        </h1>

        <p class="mt-6 font-display-italic text-lg text-ink/70 leading-relaxed max-w-2xl">
          从注册账号到登记版权的完整操作流程 ·
          给准备在 ibi.ren 平台创作并上架 IP 的捏脸师看。
        </p>

        <div class="mt-8 flex flex-wrap items-center gap-6 text-sm text-ink/60">
          <div>
            <span class="catalog-no text-ink/40 mr-2">VERSION</span>
            <span class="font-mono">{{ version }}</span>
          </div>
          <div class="w-px h-4 bg-line"></div>
          <div>
            <span class="catalog-no text-ink/40 mr-2">LAST UPDATED</span>
            <span class="font-mono">{{ lastUpdated }}</span>
          </div>
          <div class="w-px h-4 bg-line"></div>
          <div>
            <span class="catalog-no text-ink/40 mr-2">预计总耗时</span>
            <span class="font-mono">注册 1min + KYC 1-2 工作日 + 资产准备 1-2 小时 + 审核 1-3 周</span>
          </div>
        </div>
      </header>

      <!-- § 0 速览 -->
      <section class="mb-12 md:mb-16">
        <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
          § 0 — OVERVIEW · 速览
        </div>
        <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
          <span class="font-display-italic text-gold">7 步</span>完成从注册到登记
        </h2>
        <div class="bg-surface border-0.5 border-ink p-6 md:p-8 space-y-4">
          <div
            v-for="step in overview"
            :key="step.no"
            class="grid md:grid-cols-12 gap-3 items-baseline hairline-b border-line last:border-b-0 pb-3 last:pb-0"
          >
            <div class="md:col-span-1 catalog-no text-gold font-medium">{{ step.no }}</div>
            <div class="md:col-span-3 font-display text-lg text-ink">{{ step.title }}</div>
            <div class="md:col-span-2 catalog-no text-ink/50 text-xs">{{ step.time }}</div>
            <div class="md:col-span-6 text-sm text-ink/70 leading-relaxed">{{ step.summary }}</div>
          </div>
        </div>
      </section>

      <!-- § 1 注册 + KYC -->
      <section class="mb-12 md:mb-16">
        <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
          § 1 — REGISTRATION & KYC · 注册 + 实名
        </div>
        <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
          <span class="font-display-italic text-gold">2 步</span>拿到捏者身份
        </h2>

        <article class="bg-surface border-0.5 border-ink p-8 md:p-12 relative space-y-8">
          <div class="absolute top-6 right-6 stamp text-gold border-gold hidden md:block">§ 1</div>

          <!-- 步骤 1.1 -->
          <section>
            <div class="catalog-no text-gold mb-2">STEP 1.1</div>
            <h3 class="font-display text-xl text-ink mb-3">邮箱注册 → 默认拿 BUYER 角色</h3>
            <ol class="space-y-2 text-sm leading-relaxed text-ink/80 ml-4 list-decimal">
              <li>打开 <code class="font-mono text-gold">https://ibi.ren/register</code></li>
              <li>填邮箱 + 密码 (≥8 位) → 提交</li>
              <li>注册成功后默认拿到 <strong>BUYER 角色</strong>(可浏览形象库、下单)</li>
            </ol>
          </section>

          <!-- 步骤 1.2 -->
          <section class="pt-6 hairline-t border-line">
            <div class="catalog-no text-gold mb-2">STEP 1.2</div>
            <h3 class="font-display text-xl text-ink mb-3">KYC 实名升级 → 自动拿 CREATOR 角色</h3>
            <p class="text-sm text-ink/70 leading-relaxed mb-4">
              入口:<code class="font-mono text-gold">/creator/onboard</code>。
              系统会调用<strong>阿里云实人认证</strong> + 营业执照 OCR。
              审核通过后<strong>自动</strong>开通 CREATOR 角色(无需商务手动操作)。
            </p>

            <h4 class="catalog-no text-ink/50 mb-2 text-xs">KYC 字段清单</h4>
            <table class="w-full text-sm">
              <thead class="bg-cream">
                <tr>
                  <th class="table-th text-left">字段</th>
                  <th class="table-th text-left">必填</th>
                  <th class="table-th text-left">备注</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in kycFields" :key="f.name" class="border-t border-line">
                  <td class="table-td font-mono text-xs">{{ f.name }}</td>
                  <td class="table-td">
                    <span v-if="f.required" class="text-danger">* 必填</span>
                    <span v-else class="text-ink/40">选填</span>
                  </td>
                  <td class="table-td text-xs text-ink/70">{{ f.note }}</td>
                </tr>
              </tbody>
            </table>

            <div class="mt-6 p-4 bg-gold/5 border-0.5 border-gold/30 text-sm text-ink/70 leading-relaxed">
              <strong class="text-ink">⏱ 审核 SLA:</strong>
              通常 1-2 个工作日;超过 3 个工作日请联系
              <a href="mailto:kyc@ibi.ren" class="text-gold hover:underline font-mono">kyc@ibi.ren</a>。
            </div>
          </section>
        </article>
      </section>

      <!-- § 2 创建 IP 3 步 wizard -->
      <section class="mb-12 md:mb-16">
        <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
          § 2 — IP CREATION · 创建 IP (3 步 wizard)
        </div>
        <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
          <span class="font-display-italic text-gold">3 步</span>填完一个 IP
        </h2>

        <article class="bg-surface border-0.5 border-ink p-8 md:p-12 relative space-y-8">
          <div class="absolute top-6 right-6 stamp text-gold border-gold hidden md:block">§ 2</div>

          <!-- 步骤① -->
          <section>
            <div class="catalog-no text-gold mb-2">STEP ①</div>
            <h3 class="font-display text-xl text-ink mb-3">基础信息</h3>
            <p class="text-sm text-ink/70 leading-relaxed mb-4">
              入口:<code class="font-mono text-gold">/creator/ips/new</code>。
              填完点"下一步"会自动 POST /ips 建 IP,顺便用 description 自动生成 BIO_TXT 资产。
            </p>
            <table class="w-full text-sm">
              <thead class="bg-cream">
                <tr>
                  <th class="table-th text-left">字段</th>
                  <th class="table-th text-left">必填</th>
                  <th class="table-th text-left">说明</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in step1Fields" :key="f.name" class="border-t border-line">
                  <td class="table-td font-mono text-xs">{{ f.name }}</td>
                  <td class="table-td">
                    <span v-if="f.required" class="text-danger">*</span>
                    <span v-else class="text-ink/40">—</span>
                  </td>
                  <td class="table-td text-xs text-ink/70">
                    <div class="font-medium text-ink/80">{{ f.label }}</div>
                    <div class="mt-0.5">{{ f.note }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- 步骤② -->
          <section class="pt-6 hairline-t border-line">
            <div class="catalog-no text-gold mb-2">STEP ②</div>
            <h3 class="font-display text-xl text-ink mb-3">资产包上传</h3>
            <p class="text-sm text-ink/70 leading-relaxed mb-4">
              4 必传 + 1 自动生成小传 + 4 选传。完整度 100% 才能进步骤③。
            </p>
            <ul class="space-y-2 text-sm text-ink/80">
              <li v-for="a in requiredAssets" :key="a.key" class="flex items-baseline gap-2">
                <span class="font-mono text-gold text-xs shrink-0 w-32">{{ a.key }}</span>
                <span>{{ a.name }} · <code class="text-xs">{{ a.format }}</code> · {{ a.size }}</span>
              </li>
            </ul>
            <p class="mt-3 text-xs text-ink/50">详见 <a href="#assets" class="text-gold hover:underline">§ 3 必传资产最佳实践</a></p>
          </section>

          <!-- 步骤③ -->
          <section class="pt-6 hairline-t border-line">
            <div class="catalog-no text-gold mb-2">STEP ③</div>
            <h3 class="font-display text-xl text-ink mb-3">预览 + 提交</h3>
            <ol class="space-y-2 text-sm leading-relaxed text-ink/80 ml-4 list-decimal">
              <li>系统生成预览卡片,看 IP 在形象库的展示效果</li>
              <li>勾选 <RouterLink to="/legal/originality-commitment" target="_blank" class="text-gold hover:underline">《原创性承诺书》</RouterLink> 复选框</li>
              <li>点"提交审核"→ 状态变为 <code class="font-mono text-xs">PENDING_REVIEW</code></li>
            </ol>
            <div class="mt-4 p-4 bg-warn/5 border-0.5 border-warn/30 text-sm text-ink/70 leading-relaxed">
              <strong class="text-ink">⚠ 注意事项:</strong>
              提交后无法直接编辑;如需改东西,要等审核结果(通过则不能改,被拒才能改)。
              想反悔提交,先别点。
            </div>
          </section>
        </article>
      </section>

      <!-- § 3 必传资产最佳实践 (重点) -->
      <section id="assets" class="mb-12 md:mb-16 scroll-mt-20">
        <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
          § 3 — ASSET BEST PRACTICES · 必传资产最佳实践 ⭐
        </div>
        <h2 class="font-display text-2xl md:text-3xl text-ink mb-3">
          <span class="font-display-italic text-gold">4 张图</span>的传法
        </h2>
        <p class="text-sm text-ink/60 leading-relaxed mb-6 max-w-2xl">
          4 张必传图是审核重点。下面按"建议自传 / AI 可用"分两档,
          以及为什么这么传 — 看过一遍再开始画,能少走 1-2 轮修改。
        </p>

        <div class="space-y-6">
          <article
            v-for="a in requiredAssets"
            :key="a.key"
            class="bg-surface border-0.5 border-ink p-6 md:p-8 relative"
          >
            <div class="absolute top-4 right-4 catalog-no text-[10px] text-ink/40">№ {{ a.key }}</div>

            <div class="flex items-baseline gap-3 mb-2 flex-wrap">
              <h3 class="font-display text-xl text-ink">{{ a.name }}</h3>
              <span :class="a.self === '必须自传' ? 'badge bg-danger/15 text-danger' : a.self === '推荐自传' ? 'badge bg-warn/15 text-warn' : 'badge bg-success/15 text-success'">
                {{ a.self }}
              </span>
            </div>

            <div class="catalog-no text-ink/50 mb-4 text-xs">
              {{ a.format }} · {{ a.size }}
            </div>

            <div class="space-y-3 text-sm leading-relaxed">
              <div>
                <div class="catalog-no text-ink/50 text-xs mb-1">SPEC · 规格</div>
                <p class="text-ink/80">{{ a.spec }}</p>
              </div>
              <div>
                <div class="catalog-no text-ink/50 text-xs mb-1">WHY SELF · 为什么要自己传</div>
                <p class="text-ink/80">{{ a.whySelf }}</p>
              </div>
            </div>
          </article>
        </div>

        <!-- 选传资产 -->
        <div class="mt-10">
          <h3 class="font-display text-xl text-ink mb-4">选传资产(5 项,不影响审核)</h3>
          <div class="bg-surface border-0.5 border-ink p-6 space-y-3">
            <div
              v-for="a in optionalAssets"
              :key="a.key"
              class="grid md:grid-cols-12 gap-2 hairline-b border-line last:border-b-0 pb-3 last:pb-0"
            >
              <div class="md:col-span-3 font-mono text-xs text-gold">{{ a.key }}</div>
              <div class="md:col-span-9 text-sm text-ink/80 leading-relaxed">
                <strong class="text-ink">{{ a.name }}</strong> · {{ a.spec }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- § 4 AI 快速通道 -->
      <section class="mb-12 md:mb-16">
        <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
          § 4 — AI FAST-TRACK · 快速通道
        </div>
        <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
          <span class="font-display-italic text-gold">传 1 张图</span>补全 9 字段
        </h2>

        <article class="bg-surface border-0.5 border-ink p-8 md:p-12 relative">
          <div class="absolute top-6 right-6 stamp text-gold border-gold hidden md:block">FAST</div>

          <p class="font-display-italic text-lg text-ink/80 leading-relaxed mb-6">
            进 <code class="font-mono text-gold">/creator/ips/new</code> 啥都不填,
            先传一张面部特写,平台会自动建 IP + 调
            <code class="font-mono text-gold">/ai/recognize-face</code>
            识别并填入 displayName / description / gender / ageBucket / ethnicity / faceTags / styleTags / scenarioTags。
          </p>

          <div class="grid md:grid-cols-2 gap-6">
            <div class="p-5 bg-success/5 border-0.5 border-success/30">
              <div class="catalog-no text-success text-xs mb-2">✓ 适合</div>
              <ul class="space-y-2 text-sm text-ink/80">
                <li>· 还没想好怎么定位,想先看 AI 怎么描述</li>
                <li>· 快速出 demo,后期再精调元数据</li>
                <li>· 大量生产 IP(用同一角色换表情/换装)</li>
              </ul>
            </div>
            <div class="p-5 bg-warn/5 border-0.5 border-warn/30">
              <div class="catalog-no text-warn text-xs mb-2">⚠ 不适合</div>
              <ul class="space-y-2 text-sm text-ink/80">
                <li>· 角色已有 IP 备案,需要元数据精确一致</li>
                <li>· 准备申报重要赛事/奖项,AI 描述太泛</li>
                <li>· 想传达特定情绪/背景设定,AI 抓不到</li>
              </ul>
            </div>
          </div>

          <div class="mt-6 p-4 bg-ink/5 text-sm text-ink/70 leading-relaxed">
            <strong class="text-ink">📌 注意:</strong>
            快速通道建的 IP 默认 displayName 是"未命名 IP"、description 是"待 AI 补全"。
            后续 AI 识别会覆盖这些占位值,AuditLog 留底原始值,可恢复。
          </div>
        </article>
      </section>

      <!-- § 5 状态机 -->
      <section class="mb-12 md:mb-16">
        <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
          § 5 — REVIEW & PUBLICITY · 审核 → 公示 → 登记
        </div>
        <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
          <span class="font-display-italic text-gold">状态机</span>对照表
        </h2>

        <article class="bg-surface border-0.5 border-ink p-6 md:p-8">
          <table class="w-full text-sm">
            <thead class="bg-cream">
              <tr>
                <th class="table-th text-left">STATUS</th>
                <th class="table-th text-left">中文</th>
                <th class="table-th text-left">你能做什么</th>
                <th class="table-th text-left">平台做什么</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in stateMachine" :key="s.status" class="border-t border-line">
                <td class="table-td font-mono text-xs text-ink/80">{{ s.status }}</td>
                <td class="table-td font-medium text-ink">{{ s.label }}</td>
                <td class="table-td text-xs text-ink/70">{{ s.user }}</td>
                <td class="table-td text-xs text-ink/70">{{ s.admin }}</td>
              </tr>
            </tbody>
          </table>

          <div class="mt-6 p-4 bg-gold/5 border-0.5 border-gold/30 text-sm leading-relaxed text-ink/70">
            <strong class="text-ink">⏱ 关键时间承诺:</strong>
            <ul class="mt-2 space-y-1 ml-4 list-disc">
              <li>提交审核 → 审核结果: <strong>1-3 工作日</strong></li>
              <li>审核通过 → IP 进入公示 + 平台代为申请作品著作权登记证书: <strong>1-3 周</strong>(含公示期)</li>
              <li>回退补料(公示中): 创作者改完后重提交会重新计算区块链 hash,旧 hash 在 AuditLog 留底</li>
            </ul>
          </div>
        </article>
      </section>

      <!-- § 6 任务板接单 -->
      <section class="mb-12 md:mb-16">
        <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
          § 6 — TASK BOARD · 接单
        </div>
        <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
          <span class="font-display-italic text-gold">官方任务</span>怎么接
        </h2>

        <article class="bg-surface border-0.5 border-ink p-8 md:p-12 relative">
          <div class="absolute top-6 right-6 stamp text-gold border-gold hidden md:block">§ 6</div>

          <p class="text-sm text-ink/70 leading-relaxed mb-4">
            平台会不定期发布官方形象征集任务(类似<strong>接单</strong>)。
            入口:<code class="font-mono text-gold">/creator/tasks</code>。
            接单后会自动跳转到 wizard 并<strong>预填 spec</strong>(性别/年龄段/风格),
            这种 IP 版权归平台,审核通过后获得报酬。
          </p>

          <ol class="space-y-2 text-sm leading-relaxed text-ink/80 ml-4 list-decimal">
            <li>在 <code class="font-mono text-gold">/creator/tasks</code> 浏览 OPEN 状态的任务</li>
            <li>点"接单" → 确认 → 跳转 <code class="font-mono text-gold">/creator/ips/new?taskId=...</code></li>
            <li>按 spec 创作资产(其余流程跟正常 IP 一样)</li>
            <li>审核通过后,平台根据任务预设的 <code class="font-mono text-xs">perIpFen</code> 自动结算</li>
          </ol>
        </article>
      </section>

      <!-- § 7 FAQ -->
      <section class="mb-12 md:mb-16">
        <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
          § 7 — FAQ · 常见问题
        </div>
        <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
          <span class="font-display-italic text-gold">10 个</span>高频问题
        </h2>

        <div class="bg-surface border-0.5 border-ink p-6 md:p-8 space-y-5">
          <details
            v-for="(item, idx) in faqs"
            :key="idx"
            class="group hairline-b border-line last:border-b-0 pb-4 last:pb-0"
          >
            <summary class="cursor-pointer list-none flex items-baseline gap-3 hover:text-gold transition">
              <span class="catalog-no text-ink/40 text-xs shrink-0 w-8">Q{{ String(idx + 1).padStart(2, '0') }}</span>
              <span class="font-medium text-ink flex-1">{{ item.q }}</span>
              <span class="font-display-italic text-ink/30 group-open:rotate-45 transition">+</span>
            </summary>
            <p class="mt-3 ml-11 text-sm text-ink/70 leading-relaxed">{{ item.a }}</p>
          </details>
        </div>
      </section>

      <!-- 底部操作 -->
      <div class="mt-14 grid md:grid-cols-12 gap-6 items-center">
        <div class="md:col-span-7">
          <p class="font-display-italic text-ink/60 leading-relaxed">
            看完就可以开始了 ·
            内部同事优先用 <code class="font-mono text-xs">Focus_2026!</code> 测试账号体验
            (seed 用户)。
          </p>
        </div>
        <div class="md:col-span-5 md:text-right space-y-3">
          <RouterLink
            to="/register"
            class="inline-flex items-center gap-3 px-6 py-3 bg-ink text-cream hover:bg-gold transition group"
          >
            <span class="catalog-no text-cream/70 group-hover:text-ink/70 text-[10px]">REGISTER</span>
            <span class="font-display">立即注册</span>
            <span class="font-display-italic">→</span>
          </RouterLink>
          <br />
          <RouterLink
            to="/creator/onboard"
            class="inline-flex items-center gap-3 px-6 py-3 border-0.5 border-ink text-ink hover:bg-ink hover:text-cream transition text-sm"
          >
            <span>已注册,去做 KYC</span>
            <span class="font-display-italic">→</span>
          </RouterLink>
        </div>
      </div>
    </main>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. GUIDE-100</span>
        <span>SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>
