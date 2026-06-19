/**
 * #30.6 字段元数据 — 前端 UI 版本
 *
 * 与 apps/api/src/ai/field-meta.ts 保持同构 (但只暴露给人看的部分: label/description/examples/control)。
 * llmPrompt 不下发前端 — 后端自己持有。
 *
 * 为什么前端也存一份: 避免每次渲染 FieldHint 都打 API 拿 metadata。
 * 改字段名时必须同步 apps/api/src/ai/field-meta.ts。
 */

export type FieldControl = 'input' | 'textarea' | 'select' | 'chips';

export interface FieldMeta {
  label: string;
  description: string;
  examples: string[];
  control: FieldControl;
}

export const ipWizardFields: Record<string, FieldMeta> = {
  displayName: {
    label: 'IP 名称',
    description: '给这个形象起一个名字, 简短易记, 不超过 12 字',
    examples: ['林知夏', '苏白', '陈默', 'Mika'],
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
    control: 'textarea',
  },
  gender: {
    label: '性别',
    description: 'IP 的生理性别, 用于买家筛选',
    examples: [],
    control: 'select',
  },
  ageBucket: {
    label: '年龄段',
    description: '童颜(<18) / 青年(18-35) / 中年(36-55) / 银发(56+) — 买家筛选高频条件',
    examples: [],
    control: 'select',
  },
  ethnicity: {
    label: '种族 / 地区特征',
    description: '东亚 / 东南亚 / 南亚 / 非洲 / 欧洲 / 混合, 用于跨文化买家检索',
    examples: [],
    control: 'select',
  },
  faceTags: {
    label: '脸部特征',
    description: '脸型 / 肤色 / 发型 / 发色 / 眼型 / 气质 — 决定检索匹配度, 越多越好',
    examples: [
      '脸型: 鹅蛋 · 肤色: 自然 · 发型: 长直发 · 发色: 黑色 · 眼型: 杏眼 · 气质: 温暖',
    ],
    control: 'chips',
  },
  styleTags: {
    label: '风格',
    description: '视觉风格标签, 决定在哪些风格库中曝光',
    examples: ['现代 + 古风 + 国潮', '日系 + 二次元', '欧美 + 复古'],
    control: 'chips',
  },
  scenarioTags: {
    label: '适用场景',
    description: '短剧/广告/平面/直播/游戏等用途, 决定匹配的商业机会',
    examples: ['短剧(单集) + 广告', '平面拍摄 + 电商模特'],
    control: 'chips',
  },
  depositPriceFen: {
    label: '定金 (元)',
    description: '买家锁定 IP 30 天的费用 — 不能太低 (买家不认真) 也不能太高 (丧失意向)',
    examples: ['新人 IP: ¥99 - ¥199', '成熟 IP: ¥499 - ¥999', '头部 IP: ¥1999+'],
    control: 'input',
  },
  fullLicensePriceFen: {
    label: '全版权买断价 (元)',
    description: '买家全额买断后的永久授权费 — 通常是定金的 20-100 倍',
    examples: ['新人 IP: ¥9999 - ¥29999', '成熟 IP: ¥99999 - ¥299999'],
    control: 'input',
  },
};

export const adminTaskFields: Record<string, FieldMeta> = {
  title: {
    label: '任务标题',
    description: '简明扼要, 突出数量+特征+场景',
    examples: ['5 个藏族男青年', '36 个中国都市女性', '12 个国潮少年 IP'],
    control: 'input',
  },
  description: {
    label: '详细描述',
    description: '需求/风格/合同条款/报酬细则/交付要求 — 创作者接单前必看',
    examples: ['需 5 个藏族男青年形象, 高原特征明显, 现代都市风, 适合短剧单集。版权归平台, 单 IP 报酬 ¥100, 提交截止 14 天。'],
    control: 'textarea',
  },
  count: {
    label: '期望产出数',
    description: '本次任务预期交付的 IP 数量, 影响预算',
    examples: ['5', '12', '36'],
    control: 'input',
  },
  gender: {
    label: '性别',
    description: '限制接单创作者提交的 IP 性别',
    examples: [],
    control: 'select',
  },
  ageBuckets: {
    label: '年龄段',
    description: '限制接单 IP 的年龄段, 多选',
    examples: [],
    control: 'chips',
  },
  ethnicities: {
    label: '种族',
    description: '限制 IP 种族, 多选',
    examples: [],
    control: 'chips',
  },
  styleTags: {
    label: '风格',
    description: '期望风格, 多选, 至少 1 个',
    examples: [],
    control: 'chips',
  },
  scenarioTags: {
    label: '场景',
    description: '期望应用场景, 多选, 至少 1 个',
    examples: [],
    control: 'chips',
  },
  budgetFen: {
    label: '总预算',
    description: '本次任务的预算上限, 元',
    examples: [],
    control: 'input',
  },
  perIpFen: {
    label: '单 IP 报酬',
    description: '每个合格 IP 的报酬, 元',
    examples: [],
    control: 'input',
  },
  maxAccepts: {
    label: '最多接单',
    description: '限制接单创作者数量',
    examples: [],
    control: 'input',
  },
  deadlineAt: {
    label: '截止日期',
    description: '提交截止时间',
    examples: [],
    control: 'input',
  },
};