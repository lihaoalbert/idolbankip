/**
 * #30.6 字段元数据 — IpWizard 11 字段 + admin 任务 13 字段
 *
 * 每字段结构:
 *   - label       显示名
 *   - description 一行说明 (给人看, UI <FieldHint> 渲染)
 *   - examples    2-3 个范例 (给人看, UI 折叠展示)
 *   - llmPrompt   给 LLM 的提示词 (仅后端 import)
 *   - control     UI 控件类型 — 'input' | 'textarea' | 'select' | 'chips'
 *
 * 隐私: API 不存图 (face closeup 仅用于推断, 不入训练)。MiniMax M3 端已确认。
 */

// --- 白名单: 所有 enum 值集中放这里,LLM 输出必须严格匹配 ---
export const GENDERS = ['FEMALE', 'MALE', 'NONBINARY'] as const;
export const AGE_BUCKETS = ['CHILD', 'YOUNG', 'MIDDLE', 'ELDERLY'] as const;
export const ETHNICITIES = ['EAST_ASIAN', 'SOUTHEAST_ASIAN', 'SOUTH_ASIAN', 'AFRICAN', 'EUROPEAN', 'MIXED'] as const;

export const FACE_TAG_CATEGORIES: Record<string, { label: string; values: readonly string[] }> = {
  FaceShape:  { label: '脸型', values: ['OVAL', 'FACE_ROUND', 'SQUARE', 'LONG', 'HEART', 'DIAMOND'] },
  SkinTone:   { label: '肤色', values: ['PORCELAIN', 'FAIR', 'MEDIUM', 'OLIVE', 'TAN', 'DEEP'] },
  HairStyle:  { label: '发型', values: ['LONG_STRAIGHT', 'LONG_CURLY', 'SHORT', 'BUZZCUT', 'BALD', 'PONYTAIL', 'TWINTAIL', 'BUN', 'BRAIDS'] },
  HairColor:  { label: '发色', values: ['BLACK', 'BROWN', 'BLONDE', 'RED', 'GREY', 'WHITE', 'FANTASY'] },
  EyeShape:   { label: '眼型', values: ['ALMOND', 'PHOENIX', 'PEACH', 'WILLOW', 'EYE_ROUND', 'MONOLID', 'DOUBLE'] },
  Vibe:       { label: '气质', values: ['COOL', 'WARM', 'HEROIC', 'SEDUCTIVE', 'QUIET', 'FIERCE', 'CUTE'] },
};

export const STYLE_TAGS = ['现代', '古风', '赛博', '二次元', '民国', '未来', '复古', '国潮', '日系', '韩系', '欧美', '港风'] as const;
export const SCENARIO_TAGS = ['短剧(单集)', '短剧(系列)', '品牌合作', '平面拍摄', '游戏角色', '直播', '广告', '电影角色', '电商模特', 'MV/短片'] as const;

export const STYLE_TAG_LLM_LINE = STYLE_TAGS.join('、');
export const SCENARIO_TAG_LLM_LINE = SCENARIO_TAGS.join('、');

// --- IpWizard 字段 (创作者填) ---
export const ipWizardFields = {
  displayName: {
    label: 'IP 名称',
    description: '给这个形象起一个名字, 简短易记, 不超过 12 字',
    examples: ['林知夏', '苏白', '陈默', 'Mika'],
    llmPrompt: '根据面部特写图, 起一个 2-4 字的中文人物名 (欧美面孔用英文名)。要求: 有记忆点、不与常见明星重名、不使用真实人名。',
    control: 'input',
  },
  tagline: {
    label: '一句话人设',
    description: '8-20 字概括这个 IP 的核心卖点。买家搜「冷面御姐」「甜系男友」会看到',
    examples: [
      '冷面热心建筑设计师 / 独立女性范本',
      '日系温柔学长 / 短剧校园男主人设',
      '港风复古辣妈 / 平面广告御用脸',
    ],
    llmPrompt: '根据面部特写 + description, 写一句 8-20 字的人设标签, 突出视觉+性格关键词。中文。',
    control: 'input',
  },
  description: {
    label: '人物小传',
    description: '姓名 / 年龄 / 性格 / 背景故事 / 典型场景。150-400 字, 是买家了解 IP 的第一段文字',
    examples: [
      '林知夏, 26 岁建筑设计师。短发, 常穿灰色西装。冷面热心, 母亲去年去世后变得不爱社交, 但对徒弟温柔。',
      '赵小满, 19 岁大二男生。学音乐, 弹吉他。爱吃辣, 总穿白 T 牛仔裤。性格大大咧咧, 是宿舍里的开心果。',
      'Mira Chen, 32 岁纽约华裔律师。中长卷发, 戴金丝眼镜。外表精英, 私下沉迷 BJD 手办, 口头禅 "It\'s fine"。',
    ],
    llmPrompt: '根据面部特写图, 写一段 150-400 字的人物小传, 包含: 姓名(自创, 不与名人重名)、年龄段、性格关键词、典型场景、视觉印象。中文输出。',
    control: 'textarea',
  },
  gender: {
    label: '性别',
    description: 'IP 的生理性别, 用于买家筛选',
    examples: [],
    llmPrompt: `识别图片人物的性别, 从 [${GENDERS.join(', ')}] 中选一个返回。`,
    control: 'select',
  },
  ageBucket: {
    label: '年龄段',
    description: '童颜(<18) / 青年(18-35) / 中年(36-55) / 银发(56+) — 买家筛选高频条件',
    examples: [],
    llmPrompt: `识别图片人物的年龄段, 从 [${AGE_BUCKETS.join(', ')}] 中选一个返回 (CHILD=童颜<18, YOUNG=青年18-35, MIDDLE=中年36-55, ELDERLY=银发56+)。`,
    control: 'select',
  },
  ethnicity: {
    label: '种族 / 地区特征',
    description: '东亚 / 东南亚 / 南亚 / 非洲 / 欧洲 / 混合, 用于跨文化买家检索',
    examples: [],
    llmPrompt: `识别图片人物的种族或地域特征, 从 [${ETHNICITIES.join(', ')}] 中选一个返回。如果混合难以判断, 返回 "MIXED"。`,
    control: 'select',
  },
  faceTags: {
    label: '脸部特征',
    description: '脸型 / 肤色 / 发型 / 发色 / 眼型 / 气质 — 决定检索匹配度, 越多越好',
    examples: [
      '脸型: 鹅蛋 · 肤色: 自然 · 发型: 长直发 · 发色: 黑色 · 眼型: 杏眼 · 气质: 温暖',
    ],
    llmPrompt: `识别图片人物的脸部特征, 从以下枚举中选最匹配的 (每类 1 个, 必返回):
${Object.entries(FACE_TAG_CATEGORIES).map(([cat, { label, values }]) => `- ${cat}(${label}): ${values.join(', ')}`).join('\n')}
返回格式: [{"category": "<类别>", "value": "<值>"}], 共 6 项。`,
    control: 'chips',
  },
  styleTags: {
    label: '风格',
    description: '视觉风格标签, 决定在哪些风格库中曝光',
    examples: ['现代 + 古风 + 国潮', '日系 + 二次元', '欧美 + 复古'],
    llmPrompt: `从 [${STYLE_TAG_LLM_LINE}] 中选 1-3 个最匹配的视觉风格标签返回。`,
    control: 'chips',
  },
  scenarioTags: {
    label: '适用场景',
    description: '短剧/广告/平面/直播/游戏等用途, 决定匹配的商业机会',
    examples: ['短剧(单集) + 广告', '平面拍摄 + 电商模特'],
    llmPrompt: `从 [${SCENARIO_TAG_LLM_LINE}] 中选 1-3 个最匹配的场景标签返回。`,
    control: 'chips',
  },
  depositPriceFen: {
    label: '定金 (元)',
    description: '买家锁定 IP 30 天的费用 — 不能太低 (买家不认真) 也不能太高 (丧失意向)',
    examples: ['新人 IP: ¥99 - ¥199', '成熟 IP: ¥499 - ¥999', '头部 IP: ¥1999+'],
    llmPrompt: '',  // 价格不需要 AI
    control: 'input',
  },
  fullLicensePriceFen: {
    label: '全版权买断价 (元)',
    description: '买家全额买断后的永久授权费 — 通常是定金的 20-100 倍',
    examples: ['新人 IP: ¥9999 - ¥29999', '成熟 IP: ¥99999 - ¥299999'],
    llmPrompt: '',  // 价格不需要 AI
    control: 'input',
  },
} as const;

// --- admin 任务发布 字段 ---
export const adminTaskFields = {
  title: {
    label: '任务标题',
    description: '简明扼要, 突出数量+特征+场景',
    examples: ['5 个藏族男青年', '36 个中国都市女性', '12 个国潮少年 IP'],
    llmPrompt: '根据用户描述, 起一个 6-15 字的任务标题, 突出数量+核心特征+目标场景。中文。',
    control: 'input',
  },
  description: {
    label: '详细描述',
    description: '需求/风格/合同条款/报酬细则/交付要求 — 创作者接单前必看',
    examples: ['需 5 个藏族男青年形象, 高原特征明显, 现代都市风, 适合短剧单集。版权归平台, 单 IP 报酬 ¥100, 提交截止 14 天。'],
    llmPrompt: '根据用户的需求描述, 生成一段 80-200 字的详细任务描述, 包含: 数量、风格、场景、交付要求、合同条款。中文。',
    control: 'textarea',
  },
  spec: {
    label: '任务规格',
    description: '平台对 IP 的结构化要求 — 性别 / 年龄 / 种族 / 风格 / 场景',
    examples: ['女 · 青年 · 东亚 · 现代 · 短剧(单集)'],
    llmPrompt: `根据用户描述, 输出 spec 对象:
- count: 期望产出数 (number)
- gender: ${GENDERS.join('|')} 或不填 (不限)
- ageBuckets: [${AGE_BUCKETS.join('|')}] 数组, 可空
- ethnicities: [${ETHNICITIES.join('|')}] 数组, 可空
- styleTags: [${STYLE_TAG_LLM_LINE}] 数组, 至少 1 个
- scenarioTags: [${SCENARIO_TAG_LLM_LINE}] 数组, 至少 1 个`,
    control: 'chips',
  },
  count: {
    label: '期望产出数',
    description: '本次任务预期交付的 IP 数量, 影响预算',
    examples: ['5', '12', '36'],
    llmPrompt: '根据用户描述, 推断期望产出的 IP 数量 (整数, 1-100)。',
    control: 'input',
  },
  gender: {
    label: '性别',
    description: '限制接单创作者提交的 IP 性别',
    examples: [],
    llmPrompt: `从 [${GENDERS.join('|')}] 中选一个, 若无要求返回 "ANY"。`,
    control: 'select',
  },
  ageBuckets: {
    label: '年龄段',
    description: '限制接单 IP 的年龄段, 多选',
    examples: [],
    llmPrompt: `从 [${AGE_BUCKETS.join(', ')}] 中选所有匹配的年龄段, 数组返回。无要求返回空数组。`,
    control: 'chips',
  },
  ethnicities: {
    label: '种族',
    description: '限制 IP 种族, 多选',
    examples: [],
    llmPrompt: `从 [${ETHNICITIES.join(', ')}] 中选所有匹配的种族, 数组返回。无要求返回空数组。`,
    control: 'chips',
  },
  styleTags: {
    label: '风格',
    description: '期望风格, 多选, 至少 1 个',
    examples: [],
    llmPrompt: `从 [${STYLE_TAG_LLM_LINE}] 中选所有匹配的风格, 数组返回。无要求返回空数组。`,
    control: 'chips',
  },
  scenarioTags: {
    label: '场景',
    description: '期望应用场景, 多选, 至少 1 个',
    examples: [],
    llmPrompt: `从 [${SCENARIO_TAG_LLM_LINE}] 中选所有匹配的场景, 数组返回。无要求返回空数组。`,
    control: 'chips',
  },
  budgetFen: {
    label: '总预算',
    description: '本次任务的预算上限, 元',
    examples: [],
    llmPrompt: '',
    control: 'input',
  },
  perIpFen: {
    label: '单 IP 报酬',
    description: '每个合格 IP 的报酬, 元',
    examples: [],
    llmPrompt: '',
    control: 'input',
  },
  maxAccepts: {
    label: '最多接单',
    description: '限制接单创作者数量',
    examples: [],
    llmPrompt: '',
    control: 'input',
  },
  deadlineAt: {
    label: '截止日期',
    description: '提交截止时间',
    examples: [],
    llmPrompt: '',
    control: 'input',
  },
} as const;

// --- 校验函数: 丢弃不在白名单的值 ---
export function validateIpWizardFields(input: any) {
  const out: any = {};
  if (typeof input.displayName === 'string' && input.displayName.length <= 30) out.displayName = input.displayName.trim();
  if (typeof input.tagline === 'string' && input.tagline.length <= 40) out.tagline = input.tagline.trim();
  if (typeof input.description === 'string' && input.description.length >= 30 && input.description.length <= 1500) out.description = input.description.trim();
  if (typeof input.gender === 'string' && (GENDERS as readonly string[]).includes(input.gender)) out.gender = input.gender;
  if (typeof input.ageBucket === 'string' && (AGE_BUCKETS as readonly string[]).includes(input.ageBucket)) out.ageBucket = input.ageBucket;
  if (typeof input.ethnicity === 'string' && (ETHNICITIES as readonly string[]).includes(input.ethnicity)) out.ethnicity = input.ethnicity;
  if (Array.isArray(input.faceTags)) {
    out.faceTags = input.faceTags
      .filter((t: any) => t && typeof t === 'object' && typeof t.category === 'string' && typeof t.value === 'string')
      .filter((t: any) => {
        const cat = FACE_TAG_CATEGORIES[t.category];
        return cat && cat.values.includes(t.value);
      })
      .slice(0, 6);  // 每类 1 个, 共 6 类, 上限 6
  }
  if (Array.isArray(input.styleTags)) {
    out.styleTags = input.styleTags.filter((s: any) => typeof s === 'string' && (STYLE_TAGS as readonly string[]).includes(s)).slice(0, 3);
  }
  if (Array.isArray(input.scenarioTags)) {
    out.scenarioTags = input.scenarioTags.filter((s: any) => typeof s === 'string' && (SCENARIO_TAGS as readonly string[]).includes(s)).slice(0, 3);
  }
  return out;
}

export function validateTaskSpec(input: any) {
  const out: any = {};
  if (typeof input.title === 'string' && input.title.length >= 3 && input.title.length <= 30) out.title = input.title.trim();
  if (typeof input.description === 'string' && input.description.length >= 30 && input.description.length <= 2000) out.description = input.description.trim();
  if (input.spec && typeof input.spec === 'object') {
    const spec: any = {};
    if (typeof input.spec.count === 'number' && input.spec.count >= 1 && input.spec.count <= 100) spec.count = input.spec.count;
    if (typeof input.spec.gender === 'string' && (GENDERS as readonly string[]).includes(input.spec.gender)) spec.gender = input.spec.gender;
    if (Array.isArray(input.spec.ageBuckets)) spec.ageBuckets = input.spec.ageBuckets.filter((s: any) => typeof s === 'string' && (AGE_BUCKETS as readonly string[]).includes(s)).slice(0, 4);
    if (Array.isArray(input.spec.ethnicities)) spec.ethnicities = input.spec.ethnicities.filter((s: any) => typeof s === 'string' && (ETHNICITIES as readonly string[]).includes(s)).slice(0, 6);
    if (Array.isArray(input.spec.styleTags)) spec.styleTags = input.spec.styleTags.filter((s: any) => typeof s === 'string' && (STYLE_TAGS as readonly string[]).includes(s)).slice(0, 3);
    if (Array.isArray(input.spec.scenarioTags)) spec.scenarioTags = input.spec.scenarioTags.filter((s: any) => typeof s === 'string' && (SCENARIO_TAGS as readonly string[]).includes(s)).slice(0, 3);
    if (Object.keys(spec).length > 0) out.spec = spec;
  }
  return out;
}