/**
 * #30.6 字段元数据 — admin UI 版本
 *
 * 与 apps/web/src/lib/fieldMeta.ts 保持同构 (但只暴露 admin 任务发布的字段)。
 * 与 apps/api/src/ai/field-meta.ts 字段名严格对齐。
 */

export type FieldControl = 'input' | 'textarea' | 'select' | 'chips';

export interface FieldMeta {
  label: string;
  description: string;
  examples: string[];
  control: FieldControl;
}

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