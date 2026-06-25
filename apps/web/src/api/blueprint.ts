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

// ===================== L1 骨骼 (8 项 + gender) =====================

export type CraniumShape = 'long' | 'medium' | 'round' | 'flat';
export type JawAngle = 'sharp' | 'medium' | 'soft';
// Phase C Beta 加 (Q3 拍板):SchematicFace 需要性别驱动轮廓差异(下颌/眉弓/喉结)
export type Gender = 'male' | 'female';

export interface L1Skeleton {
  gender?: Gender; // 可选,旧数据无值时 fallback 到 female
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
  { key: 'faceIndex', label: '脸型指数 (脸长/脸宽)', min: 1.0, max: 1.6, step: 0.01, hint: '1.0=圆脸,1.2=标准椭圆,1.4+=长脸' },
  { key: 'cheekboneWidth', label: '颧骨宽 (相对头宽)', min: 0, max: 1, step: 0.01, hint: '0.4~0.5=窄,0.6~0.7=标准,0.8+=宽颧' },
  { key: 'cheekboneProminence', label: '颧骨突出度', min: 0, max: 1, step: 0.01, hint: '0=平颧,0.5=标准,1=高颧骨' },
  { key: 'jawWidth', label: '下颌宽 (相对头宽)', min: 0, max: 1, step: 0.01, hint: '0.3~0.4=尖下巴,0.5=标准,0.7+=方下颌' },
  { key: 'upperThirdRatio', label: '上停比例 (额高)', min: 0, max: 1, step: 0.01, hint: '三停之和=1,理想值~0.33' },
  { key: 'midThirdRatio', label: '中停比例 (眉心到鼻底)', min: 0, max: 1, step: 0.01, hint: '三停之和=1,理想值~0.33' },
];

export const L1_SELECT_FIELDS: SelectFieldDef<CraniumShape | JawAngle | Gender>[] = [
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
  // Phase C Beta 加 (Q3):性别决定 SchematicFace 整体轮廓
  { key: 'gender', label: '性别', options: [
    { value: 'female', label: '女性' },
    { value: 'male', label: '男性' },
  ]},
];

export const L2_SLIDER_FIELDS: SliderFieldDef[] = [
  { key: 'subcutaneousFat', label: '皮下脂肪', min: 0, max: 1, step: 0.01, hint: '0=瘦削,0.5=标准,1=饱满' },
  { key: 'masseter', label: '咬肌', min: 0, max: 1, step: 0.01, hint: '0=无咬肌(瓜子脸),1=咬肌发达(国字脸)' },
  { key: 'buccalFat', label: '颊脂垫 (苹果肌)', min: 0, max: 1, step: 0.01, hint: '0=凹陷,0.6=饱满苹果肌,1=过度饱满' },
  { key: 'eyeSocketDepth', label: '眼窝深度', min: 0, max: 1, step: 0.01, hint: '0=平眼窝(亚洲常见),1=深眼窝(欧美常见)' },
  { key: 'browRidge', label: '眉弓突出度', min: 0, max: 1, step: 0.01, hint: '0=平眉弓,0.5=标准,1=高眉弓(欧美感)' },
  { key: 'nasolabialFold', label: '法令纹深度', min: 0, max: 1, step: 0.01, hint: '0=无,0.3=微显,0.6+=明显 (适合成熟/熟女)' },
];

// 默认值 — 创作者首次进入有占位,而不是空白
export const L1_DEFAULTS: L1Skeleton = {
  gender: 'female',
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
  { key: 'eyeDistance', label: '眼距', min: 0, max: 1, step: 0.01, hint: '0=近(聚眼),0.5=标准一眼距,1=远(宽眼距)' },
  { key: 'eyeApertureHeight', label: '眼裂高度', min: 0, max: 1, step: 0.01, hint: '0=细长眼(丹凤),0.5=标准,1=大圆眼' },
  { key: 'noseLength', label: '鼻长', min: 0, max: 1, step: 0.01, hint: '0=短鼻(少女感),0.5=标准,1=长鼻(成熟感)' },
  { key: 'noseWidth', label: '鼻宽', min: 0, max: 1, step: 0.01, hint: '0=窄鼻(精致),0.4=标准,0.7+=宽鼻(圆润)' },
  { key: 'lipWidth', label: '唇宽', min: 0, max: 1, step: 0.01, hint: '0=薄窄,0.5=标准,0.8+=宽唇' },
  { key: 'lipThickness', label: '唇厚', min: 0, max: 1, step: 0.01, hint: '0=薄唇(冷淡感),0.5=标准,1=厚唇(丰唇)' },
  { key: 'earPosition', label: '耳位', min: 0, max: 1, step: 0.01, hint: '0=低位耳,0.5=标准(与眉齐),1=高位耳' },
  { key: 'earSize', label: '耳大小', min: 0, max: 1, step: 0.01, hint: '0=小耳,0.4=标准,0.7+=大耳(精灵感)' },
  { key: 'philtrumLength', label: '人中长度', min: 0, max: 1, step: 0.01, hint: '0=短人中(幼态),0.5=标准,1=长人中(成熟)' },
  { key: 'chinProtrusion', label: '下巴突出度', min: 0, max: 1, step: 0.01, hint: '0=后缩,0.5=标准,1=前凸(国字/女王)' },
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
  { key: 'browDensity', label: '眉密度', min: 0, max: 1, step: 0.01, hint: '0=稀疏(韩式),0.5=标准,1=浓密(欧美)' },
  { key: 'sideburns', label: '鬓角', min: 0, max: 1, step: 0.01, hint: '0=无鬓角,0.3=短鬓角,0.7+=长鬓角(注意与光头矛盾)' },
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
  { key: 'freckles', label: '雀斑', min: 0, max: 1, step: 0.01, hint: '0=无,0.2=隐约(欧美风),0.5+=明显(精灵/可爱)' },
  { key: 'moles', label: '痣', min: 0, max: 1, step: 0.01, hint: '0=无,0.1=1~2颗点缀,0.3+=多痣' },
  { key: 'wrinkles', label: '皱纹/细纹', min: 0, max: 1, step: 0.01, hint: '0=无(少女),0.2=微细纹,0.6+=明显(成熟)' },
  { key: 'pores', label: '毛孔', min: 0, max: 1, step: 0.01, hint: '0=无毛孔(瓷肌),0.3=细腻,0.7+=粗大' },
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
  { key: 'blush', label: '腮红', min: 0, max: 1, step: 0.01, hint: '0=无,0.3=微红(自然),0.7+=明显(元气)' },
  { key: 'eyeshadow', label: '眼影', min: 0, max: 1, step: 0.01, hint: '0=无,0.3=裸色(日常),0.7+=烟熏(派对)' },
  { key: 'facePaint', label: '面部彩绘', min: 0, max: 1, step: 0.01, hint: '0=无,0.5=戏曲/Cos 风格,1=浓重(角色向)' },
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

// ===================== 5 个快速预设 (Q4 拍板) =====================
// 给创作者一个起点,而不是空白。点击任一按钮 → 批量覆盖 L1-L6 默认值。
// 所有 46 字段必须填齐,前端不做 fallback。

export interface PresetDef {
  id: string;
  label: string;
  description: string;
  layers: {
    L1_skeleton: L1Skeleton;
    L2_softTissue: L2SoftTissue;
    L3_features: L3Features;
    L4_skin: L4Skin;
    L5_hair: L5Hair;
    L6_decoration: L6Decoration;
  };
}

export const PRESETS: PresetDef[] = [
  {
    id: 'asian_female',
    label: '亚洲女性',
    description: '25 岁左右,自然白皙,双眼皮,中长发',
    layers: {
      L1_skeleton: {
        gender: 'female',
        craniumShape: 'medium', faceIndex: 1.30,
        cheekboneWidth: 0.50, cheekboneProminence: 0.35,
        jawWidth: 0.40, jawAngle: 'soft',
        upperThirdRatio: 0.33, midThirdRatio: 0.34,
      },
      L2_softTissue: {
        subcutaneousFat: 0.50, masseter: 0.30, buccalFat: 0.55,
        eyeSocketDepth: 0.25, browRidge: 0.50, nasolabialFold: 0.05,
      },
      L3_features: {
        eyeDistance: 0.55, eyeShape: 'double', eyeApertureHeight: 0.60,
        noseLength: 0.40, noseWidth: 0.35, noseBridge: 'low',
        lipWidth: 0.50, lipThickness: 0.50,
        earPosition: 0.50, earSize: 0.40,
        philtrumLength: 0.40, chinProtrusion: 0.40,
      },
      L4_skin: {
        skinTone: 'light', skinTexture: 'smooth',
        freckles: 0.0, moles: 0.05, wrinkles: 0.0, pores: 0.10,
      },
      L5_hair: {
        hairStyle: 'straight_long', hairColor: 'black', hairline: 'medium',
        browShape: 'arched', browColor: 'same_as_hair', browDensity: 0.60,
        lashes: 'long_dense', sideburns: 0.0,
      },
      L6_decoration: {
        makeup: 'natural', lipColor: 'natural',
        blush: 0.20, eyeshadow: 0.10,
        accessory: 'none', facePaint: 0.0,
      },
    },
  },
  {
    id: 'european_male',
    label: '欧洲男性',
    description: '30 岁左右,深邃眼窝,方下颌,短棕发',
    layers: {
      L1_skeleton: {
        gender: 'male',
        craniumShape: 'medium', faceIndex: 1.30,
        cheekboneWidth: 0.65, cheekboneProminence: 0.55,
        jawWidth: 0.70, jawAngle: 'sharp',
        upperThirdRatio: 0.32, midThirdRatio: 0.35,
      },
      L2_softTissue: {
        subcutaneousFat: 0.30, masseter: 0.70, buccalFat: 0.35,
        eyeSocketDepth: 0.75, browRidge: 0.80, nasolabialFold: 0.20,
      },
      L3_features: {
        eyeDistance: 0.50, eyeShape: 'double', eyeApertureHeight: 0.55,
        noseLength: 0.65, noseWidth: 0.45, noseBridge: 'high',
        lipWidth: 0.45, lipThickness: 0.50,
        earPosition: 0.55, earSize: 0.50,
        philtrumLength: 0.55, chinProtrusion: 0.60,
      },
      L4_skin: {
        skinTone: 'light', skinTexture: 'normal',
        freckles: 0.20, moles: 0.05, wrinkles: 0.10, pores: 0.30,
      },
      L5_hair: {
        hairStyle: 'straight_short', hairColor: 'brown', hairline: 'medium',
        browShape: 'straight', browColor: 'same_as_hair', browDensity: 0.80,
        lashes: 'short_dense', sideburns: 0.40,
      },
      L6_decoration: {
        makeup: 'none', lipColor: 'natural',
        blush: 0.0, eyeshadow: 0.0,
        accessory: 'none', facePaint: 0.0,
      },
    },
  },
  {
    id: 'androgynous_youth',
    label: '中性少年',
    description: '18 岁左右,清秀稚气,大眼齐耳短发',
    layers: {
      L1_skeleton: {
        gender: 'female',
        craniumShape: 'round', faceIndex: 1.10,
        cheekboneWidth: 0.45, cheekboneProminence: 0.30,
        jawWidth: 0.35, jawAngle: 'soft',
        upperThirdRatio: 0.35, midThirdRatio: 0.32,
      },
      L2_softTissue: {
        subcutaneousFat: 0.40, masseter: 0.25, buccalFat: 0.60,
        eyeSocketDepth: 0.20, browRidge: 0.40, nasolabialFold: 0.0,
      },
      L3_features: {
        eyeDistance: 0.60, eyeShape: 'round', eyeApertureHeight: 0.75,
        noseLength: 0.35, noseWidth: 0.30, noseBridge: 'low',
        lipWidth: 0.45, lipThickness: 0.55,
        earPosition: 0.50, earSize: 0.40,
        philtrumLength: 0.35, chinProtrusion: 0.35,
      },
      L4_skin: {
        skinTone: 'fair', skinTexture: 'smooth',
        freckles: 0.0, moles: 0.0, wrinkles: 0.0, pores: 0.05,
      },
      L5_hair: {
        hairStyle: 'bob', hairColor: 'black', hairline: 'low',
        browShape: 'straight', browColor: 'same_as_hair', browDensity: 0.50,
        lashes: 'long_dense', sideburns: 0.0,
      },
      L6_decoration: {
        makeup: 'none', lipColor: 'natural',
        blush: 0.05, eyeshadow: 0.0,
        accessory: 'none', facePaint: 0.0,
      },
    },
  },
  {
    id: 'african_female',
    label: '非洲女性',
    description: '25 岁左右,深棕肤色,丰满厚唇,自然卷发',
    layers: {
      L1_skeleton: {
        gender: 'female',
        craniumShape: 'long', faceIndex: 1.35,
        cheekboneWidth: 0.70, cheekboneProminence: 0.50,
        jawWidth: 0.55, jawAngle: 'medium',
        upperThirdRatio: 0.34, midThirdRatio: 0.36,
      },
      L2_softTissue: {
        subcutaneousFat: 0.40, masseter: 0.50, buccalFat: 0.50,
        eyeSocketDepth: 0.45, browRidge: 0.55, nasolabialFold: 0.10,
      },
      L3_features: {
        eyeDistance: 0.50, eyeShape: 'round', eyeApertureHeight: 0.70,
        noseLength: 0.60, noseWidth: 0.65, noseBridge: 'medium',
        lipWidth: 0.65, lipThickness: 0.75,
        earPosition: 0.50, earSize: 0.45,
        philtrumLength: 0.50, chinProtrusion: 0.45,
      },
      L4_skin: {
        skinTone: 'dark', skinTexture: 'normal',
        freckles: 0.0, moles: 0.10, wrinkles: 0.05, pores: 0.30,
      },
      L5_hair: {
        hairStyle: 'curly', hairColor: 'black', hairline: 'medium',
        browShape: 'arched', browColor: 'same_as_hair', browDensity: 0.75,
        lashes: 'long_dense', sideburns: 0.0,
      },
      L6_decoration: {
        makeup: 'natural', lipColor: 'red',
        blush: 0.30, eyeshadow: 0.20,
        accessory: 'earrings', facePaint: 0.0,
      },
    },
  },
  {
    id: 'latino_male',
    label: '拉丁男性',
    description: '30 岁左右,古铜肤色,浓郁五官,波浪卷黑发',
    layers: {
      L1_skeleton: {
        gender: 'male',
        craniumShape: 'medium', faceIndex: 1.30,
        cheekboneWidth: 0.60, cheekboneProminence: 0.50,
        jawWidth: 0.60, jawAngle: 'medium',
        upperThirdRatio: 0.33, midThirdRatio: 0.34,
      },
      L2_softTissue: {
        subcutaneousFat: 0.40, masseter: 0.60, buccalFat: 0.45,
        eyeSocketDepth: 0.55, browRidge: 0.70, nasolabialFold: 0.15,
      },
      L3_features: {
        eyeDistance: 0.50, eyeShape: 'double', eyeApertureHeight: 0.60,
        noseLength: 0.60, noseWidth: 0.50, noseBridge: 'high',
        lipWidth: 0.50, lipThickness: 0.65,
        earPosition: 0.50, earSize: 0.45,
        philtrumLength: 0.50, chinProtrusion: 0.50,
      },
      L4_skin: {
        skinTone: 'tan', skinTexture: 'normal',
        freckles: 0.0, moles: 0.10, wrinkles: 0.05, pores: 0.25,
      },
      L5_hair: {
        hairStyle: 'wavy', hairColor: 'black', hairline: 'medium',
        browShape: 'arched', browColor: 'same_as_hair', browDensity: 0.80,
        lashes: 'long_dense', sideburns: 0.30,
      },
      L6_decoration: {
        makeup: 'none', lipColor: 'natural',
        blush: 0.0, eyeshadow: 0.0,
        accessory: 'none', facePaint: 0.0,
      },
    },
  },
];