// FaceBlueprint API client — Phase 1 Layered Prompt Generator
// 后端实现在 apps/api/src/blueprint/(stub,Phase B 换 Prisma)
//
// L1/L2/L7/L8 typed schemas 与后端 dto/blueprint.dto.ts 同步
// L3~L6 暂无 zod,留 Record<string, unknown>

import { apiClient } from './client';

export const BLUEPRINT_LAYERS = [
  'L1_skeleton',
  'L2_softTissue',
  'L3_features',
  'L4_skin',
  'L5_hair',
  'L6_decoration',
  'L7_render',
  'L8_evaluation',
] as const;

export type LayerKey = (typeof BLUEPRINT_LAYERS)[number];

export interface Blueprint {
  id: string;
  ownerId: string;
  ipId: string | null;
  title: string | null;
  description: string | null;
  tags: string;
  version: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  layers: Record<LayerKey, Record<string, unknown> | null>;
}

// ===================== L1 骨骼 (8 项) =====================

export type CraniumShape = 'long' | 'medium' | 'round' | 'flat';
export type JawAngle = 'sharp' | 'medium' | 'soft';

export interface L1Skeleton {
  craniumShape: CraniumShape;
  faceIndex: number; // 1.0~1.6
  cheekboneWidth: number; // 0~1
  cheekboneProminence: number; // 0~1
  jawWidth: number; // 0~1
  jawAngle: JawAngle;
  upperThirdRatio: number; // 0~1
  midThirdRatio: number; // 0~1
}

// ===================== L2 软组织 (6 项) =====================

export interface L2SoftTissue {
  subcutaneousFat: number; // 0~1
  masseter: number; // 0~1
  buccalFat: number; // 0~1
  eyeSocketDepth: number; // 0~1
  browRidge: number; // 0~1
  nasolabialFold: number; // 0~1
}

// ===================== L3 五官定位 (12 项) =====================

export type EyeShape = 'single' | 'inner' | 'double' | 'phoenix' | 'round' | 'narrow';
export type NoseBridge = 'high' | 'medium' | 'low';

export interface L3Features {
  eyeDistance: number; // 0~1
  eyeShape: EyeShape;
  eyeApertureHeight: number; // 0~1
  noseLength: number; // 0~1
  noseWidth: number; // 0~1
  noseBridge: NoseBridge;
  lipWidth: number; // 0~1
  lipThickness: number; // 0~1
  earPosition: number; // 0~1
  earSize: number; // 0~1
  philtrumLength: number; // 0~1
  chinProtrusion: number; // 0~1
}

// ===================== L5 毛发 (8 项) =====================

export type HairStyle = 'straight_long' | 'straight_short' | 'wavy' | 'curly' | 'ponytail' | 'bob' | 'bald';
export type HairColor = 'black' | 'brown' | 'blonde' | 'red' | 'silver' | 'gray' | 'highlight';
export type Hairline = 'high' | 'medium' | 'low' | 'm_shape';
export type BrowShape = 'straight' | 'arched' | 'upward' | 'downward' | 'thick' | 'thin';
export type BrowColor = 'black' | 'brown' | 'gray' | 'same_as_hair';
export type LashStyle = 'long_dense' | 'short_dense' | 'long_sparse' | 'short_sparse';

export interface L5Hair {
  hairStyle: HairStyle;
  hairColor: HairColor;
  hairline: Hairline;
  browShape: BrowShape;
  browColor: BrowColor;
  browDensity: number; // 0~1
  lashes: LashStyle;
  sideburns: number; // 0~1
}

// ===================== L4 皮肤 (6 项) =====================

export type SkinTone = 'fair' | 'light' | 'medium' | 'olive' | 'tan' | 'brown' | 'dark';
export type SkinTexture = 'smooth' | 'normal' | 'rough' | 'matte' | 'oily';

export interface L4Skin {
  skinTone: SkinTone;
  skinTexture: SkinTexture;
  freckles: number; // 0~1
  moles: number; // 0~1
  wrinkles: number; // 0~1
  pores: number; // 0~1
}

// ===================== L6 修饰 (6 项) =====================

export type MakeupLevel = 'none' | 'natural' | 'light' | 'heavy' | 'costume';
export type LipColor = 'natural' | 'red' | 'pink' | 'orange' | 'nude' | 'dark';
export type Accessory = 'none' | 'earrings' | 'necklace' | 'headband' | 'mask' | 'glasses';

export interface L6Decoration {
  makeup: MakeupLevel;
  lipColor: LipColor;
  blush: number; // 0~1
  eyeshadow: number; // 0~1
  accessory: Accessory;
  facePaint: number; // 0~1
}

// ===================== L7 渲染 prompt (R6 计算层) =====================

export type Platform = 'mj' | 'sd' | 'jimeng' | 'doubao';

export interface L7Render {
  promptZh?: string;
  promptEn?: string;
  platforms?: Platform[];
  variants?: string[]; // ['mj:...', 'sd:...', ...]
}

// ===================== L8 评估 (R7 详) =====================

export interface L8SubScores {
  L1_complexity: number;
  L2_expressiveness: number;
  L3_distinctiveness: number;
  L4_skin_realism: number;
  L5_hair_coverage: number;
  L6_decoration_completeness: number;
  L7_prompt_quality: number;
  L8_contradiction_bonus: number;
}

export interface L8Evaluation {
  originality?: number;
  consistency?: number;
  aesthetics?: number;
  subScores?: L8SubScores;
  evaluatedAt?: string;
}

export interface EvaluationScores {
  originality: number;
  consistency: number;
  aesthetics: number;
}

export interface EvaluationResult {
  id: string;
  scores: EvaluationScores;
  evaluated_at: string;
  contradictions: Contradiction[];
  sub_scores?: L8SubScores;
}

export interface Contradiction {
  id: string;
  layer: 'L3' | 'L5' | 'L1+L5';
  title: string;
  description: string;
  severity: 'warning' | 'info';
}

// 字段元数据 — 供前端 Step 表单渲染 slider/select
export interface SliderFieldDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
}

export interface SelectFieldDef<T extends string> {
  key: string;
  label: string;
  options: { value: T; label: string }[];
}

export const L1_SLIDER_FIELDS: SliderFieldDef[] = [
  { key: 'faceIndex', label: '脸型指数 (脸长/脸宽)', min: 1.0, max: 1.6, step: 0.01, hint: '1.0=圆脸,1.4+=长脸' },
  { key: 'cheekboneWidth', label: '颧骨宽 (相对头宽)', min: 0, max: 1, step: 0.01 },
  { key: 'cheekboneProminence', label: '颧骨突出度', min: 0, max: 1, step: 0.01 },
  { key: 'jawWidth', label: '下颌宽 (相对头宽)', min: 0, max: 1, step: 0.01 },
  { key: 'upperThirdRatio', label: '上停比例 (额高)', min: 0, max: 1, step: 0.01 },
  { key: 'midThirdRatio', label: '中停比例 (眉心到鼻底)', min: 0, max: 1, step: 0.01 },
];

export const L1_SELECT_FIELDS: SelectFieldDef<CraniumShape | JawAngle>[] = [
  { key: 'craniumShape', label: '颅型', options: [
    { value: 'long', label: '长颅' },
    { value: 'medium', label: '中颅' },
    { value: 'round', label: '圆颅' },
    { value: 'flat', label: '扁颅' },
  ]},
  { key: 'jawAngle', label: '下颌角', options: [
    { value: 'sharp', label: '锐角' },
    { value: 'medium', label: '中等' },
    { value: 'soft', label: '钝角' },
  ]},
];

export const L2_SLIDER_FIELDS: SliderFieldDef[] = [
  { key: 'subcutaneousFat', label: '皮下脂肪', min: 0, max: 1, step: 0.01, hint: '0=瘦削,1=饱满' },
  { key: 'masseter', label: '咬肌', min: 0, max: 1, step: 0.01 },
  { key: 'buccalFat', label: '颊脂垫 (苹果肌)', min: 0, max: 1, step: 0.01 },
  { key: 'eyeSocketDepth', label: '眼窝深度', min: 0, max: 1, step: 0.01 },
  { key: 'browRidge', label: '眉弓突出度', min: 0, max: 1, step: 0.01 },
  { key: 'nasolabialFold', label: '法令纹深度', min: 0, max: 1, step: 0.01 },
];

// 默认值 — 创作者首次进入有占位,而不是空白
export const L1_DEFAULTS: L1Skeleton = {
  craniumShape: 'medium',
  faceIndex: 1.35,
  cheekboneWidth: 0.55,
  cheekboneProminence: 0.4,
  jawWidth: 0.5,
  jawAngle: 'medium',
  upperThirdRatio: 0.33,
  midThirdRatio: 0.34,
};

export const L2_DEFAULTS: L2SoftTissue = {
  subcutaneousFat: 0.45,
  masseter: 0.5,
  buccalFat: 0.55,
  eyeSocketDepth: 0.3,
  browRidge: 0.6,
  nasolabialFold: 0.1,
};

export const L3_DEFAULTS: L3Features = {
  eyeDistance: 0.5,
  eyeShape: 'double',
  eyeApertureHeight: 0.6,
  noseLength: 0.5,
  noseWidth: 0.4,
  noseBridge: 'medium',
  lipWidth: 0.5,
  lipThickness: 0.45,
  earPosition: 0.5,
  earSize: 0.4,
  philtrumLength: 0.5,
  chinProtrusion: 0.5,
};

export const L5_DEFAULTS: L5Hair = {
  hairStyle: 'straight_long',
  hairColor: 'black',
  hairline: 'medium',
  browShape: 'arched',
  browColor: 'same_as_hair',
  browDensity: 0.7,
  lashes: 'long_dense',
  sideburns: 0.2,
};

export const L4_DEFAULTS: L4Skin = {
  skinTone: 'medium',
  skinTexture: 'normal',
  freckles: 0.1,
  moles: 0.05,
  wrinkles: 0.05,
  pores: 0.2,
};

export const L6_DEFAULTS: L6Decoration = {
  makeup: 'natural',
  lipColor: 'natural',
  blush: 0.2,
  eyeshadow: 0.1,
  accessory: 'none',
  facePaint: 0.0,
};

export const L7_DEFAULTS: L7Render = {
  platforms: ['mj', 'sd', 'jimeng', 'doubao'],
};

export const L3_SLIDER_FIELDS: SliderFieldDef[] = [
  { key: 'eyeDistance', label: '眼距', min: 0, max: 1, step: 0.01, hint: '0=近,1=远' },
  { key: 'eyeApertureHeight', label: '眼裂高度', min: 0, max: 1, step: 0.01 },
  { key: 'noseLength', label: '鼻长', min: 0, max: 1, step: 0.01 },
  { key: 'noseWidth', label: '鼻宽', min: 0, max: 1, step: 0.01 },
  { key: 'lipWidth', label: '唇宽', min: 0, max: 1, step: 0.01 },
  { key: 'lipThickness', label: '唇厚', min: 0, max: 1, step: 0.01, hint: '0=薄唇,1=厚唇' },
  { key: 'earPosition', label: '耳位', min: 0, max: 1, step: 0.01 },
  { key: 'earSize', label: '耳大小', min: 0, max: 1, step: 0.01 },
  { key: 'philtrumLength', label: '人中长度', min: 0, max: 1, step: 0.01 },
  { key: 'chinProtrusion', label: '下巴突出度', min: 0, max: 1, step: 0.01, hint: '0=后缩,1=前凸' },
];

export const L3_SELECT_FIELDS: SelectFieldDef<EyeShape | NoseBridge>[] = [
  { key: 'eyeShape', label: '眼型', options: [
    { value: 'single', label: '单眼皮' },
    { value: 'inner', label: '内双' },
    { value: 'double', label: '双眼皮' },
    { value: 'phoenix', label: '丹凤眼' },
    { value: 'round', label: '圆眼' },
    { value: 'narrow', label: '细长眼' },
  ]},
  { key: 'noseBridge', label: '鼻梁', options: [
    { value: 'high', label: '高' },
    { value: 'medium', label: '中' },
    { value: 'low', label: '低' },
  ]},
];

export const L5_SLIDER_FIELDS: SliderFieldDef[] = [
  { key: 'browDensity', label: '眉密度', min: 0, max: 1, step: 0.01, hint: '0=稀疏,1=浓密' },
  { key: 'sideburns', label: '鬓角', min: 0, max: 1, step: 0.01 },
];

export const L5_SELECT_FIELDS: SelectFieldDef<HairStyle | HairColor | Hairline | BrowShape | BrowColor | LashStyle>[] = [
  { key: 'hairStyle', label: '发型', options: [
    { value: 'straight_long', label: '直长发' },
    { value: 'straight_short', label: '直短发' },
    { value: 'wavy', label: '大波浪' },
    { value: 'curly', label: '卷发' },
    { value: 'ponytail', label: '马尾' },
    { value: 'bob', label: '齐肩短发' },
    { value: 'bald', label: '光头' },
  ]},
  { key: 'hairColor', label: '发色', options: [
    { value: 'black', label: '黑' },
    { value: 'brown', label: '棕' },
    { value: 'blonde', label: '金' },
    { value: 'red', label: '红' },
    { value: 'silver', label: '银' },
    { value: 'gray', label: '灰' },
    { value: 'highlight', label: '挑染' },
  ]},
  { key: 'hairline', label: '发际线', options: [
    { value: 'high', label: '高' },
    { value: 'medium', label: '中' },
    { value: 'low', label: '低' },
    { value: 'm_shape', label: 'M 型' },
  ]},
  { key: 'browShape', label: '眉形', options: [
    { value: 'straight', label: '平直' },
    { value: 'arched', label: '弓形' },
    { value: 'upward', label: '上挑' },
    { value: 'downward', label: '下垂' },
    { value: 'thick', label: '粗浓' },
    { value: 'thin', label: '细' },
  ]},
  { key: 'browColor', label: '眉色', options: [
    { value: 'black', label: '黑' },
    { value: 'brown', label: '棕' },
    { value: 'gray', label: '灰' },
    { value: 'same_as_hair', label: '与发色同' },
  ]},
  { key: 'lashes', label: '睫毛', options: [
    { value: 'long_dense', label: '长密' },
    { value: 'short_dense', label: '短密' },
    { value: 'long_sparse', label: '长疏' },
    { value: 'short_sparse', label: '短疏' },
  ]},
];

export const L4_SLIDER_FIELDS: SliderFieldDef[] = [
  { key: 'freckles', label: '雀斑', min: 0, max: 1, step: 0.01, hint: '0=无,1=满脸' },
  { key: 'moles', label: '痣', min: 0, max: 1, step: 0.01 },
  { key: 'wrinkles', label: '皱纹/细纹', min: 0, max: 1, step: 0.01 },
  { key: 'pores', label: '毛孔', min: 0, max: 1, step: 0.01 },
];

export const L4_SELECT_FIELDS: SelectFieldDef<SkinTone | SkinTexture>[] = [
  { key: 'skinTone', label: '肤色 (Fitzpatrick)', options: [
    { value: 'fair', label: '瓷白 (1型)' },
    { value: 'light', label: '自然白 (2型)' },
    { value: 'medium', label: '自然色 (3型)' },
    { value: 'olive', label: '黄调 (3.5型)' },
    { value: 'tan', label: '小麦 (4型)' },
    { value: 'brown', label: '古铜 (5型)' },
    { value: 'dark', label: '深棕 (6型)' },
  ]},
  { key: 'skinTexture', label: '肤质', options: [
    { value: 'smooth', label: '光滑' },
    { value: 'normal', label: '标准' },
    { value: 'rough', label: '粗糙' },
    { value: 'matte', label: '哑光' },
    { value: 'oily', label: '油光' },
  ]},
];

export const L6_SLIDER_FIELDS: SliderFieldDef[] = [
  { key: 'blush', label: '腮红', min: 0, max: 1, step: 0.01, hint: '0=无,1=重' },
  { key: 'eyeshadow', label: '眼影', min: 0, max: 1, step: 0.01 },
  { key: 'facePaint', label: '面部彩绘', min: 0, max: 1, step: 0.01, hint: '戏曲/Cos 风格' },
];

export const L6_SELECT_FIELDS: SelectFieldDef<MakeupLevel | LipColor | Accessory>[] = [
  { key: 'makeup', label: '妆容', options: [
    { value: 'none', label: '素颜' },
    { value: 'natural', label: '素颜感' },
    { value: 'light', label: '淡妆' },
    { value: 'heavy', label: '浓妆' },
    { value: 'costume', label: '戏妆' },
  ]},
  { key: 'lipColor', label: '唇色', options: [
    { value: 'natural', label: '自然' },
    { value: 'red', label: '正红' },
    { value: 'pink', label: '粉' },
    { value: 'orange', label: '橘' },
    { value: 'nude', label: '裸' },
    { value: 'dark', label: '暗红' },
  ]},
  { key: 'accessory', label: '装饰', options: [
    { value: 'none', label: '无' },
    { value: 'earrings', label: '耳环' },
    { value: 'necklace', label: '项链' },
    { value: 'headband', label: '发箍' },
    { value: 'mask', label: '面具' },
    { value: 'glasses', label: '眼镜' },
  ]},
];

export const blueprintApi = {
  create(body?: { title?: string; description?: string; tags?: string; ownerId?: string }) {
    return apiClient.post<Blueprint>('/blueprint', body ?? {}).then((r) => r.data);
  },
  get(id: string) {
    return apiClient.get<Blueprint>(`/blueprint/${id}`).then((r) => r.data);
  },
  updateLayer(id: string, step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, data: Record<string, unknown>) {
    return apiClient
      .patch<Blueprint>(`/blueprint/${id}/step/${step}`, { data })
      .then((r) => r.data);
  },
  evaluate(id: string) {
    return apiClient
      .post<EvaluationResult>(`/blueprint/${id}/evaluate`)
      .then((r) => r.data);
  },
};

// 步骤号 → 层 key(前后端共用一套规则,跟后端 blueprint.service.ts BLUEPRINT_LAYERS 对齐)
export function stepToLayer(step: number): LayerKey | null {
  if (step < 1 || step > BLUEPRINT_LAYERS.length) return null;
  return BLUEPRINT_LAYERS[step - 1];
}