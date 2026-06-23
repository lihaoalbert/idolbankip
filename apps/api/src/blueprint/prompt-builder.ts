// L7 渲染 prompt 整合算法 — 从 L1~L6 拼中英 prompt,支持多平台变体
//
// 设计目标:
// 1. 纯函数:输入 layers,输出 prompt 字符串,易测(RC-2 老板审样本)
// 2. 多平台:MJ (Midjourney) / SD (Stable Diffusion) / 即梦 (jimeng) / doubao
//    各自有风格差异(MJ 偏关键词/风格词,SD 偏正向 prompt 句子,即梦/doubao 偏自然语言)
// 3. 确定性:相同 L1~L6 + 相同 platforms → 相同输出(便于单测快照 + 老板 RC-2 review)
//
// Phase 1 用模板字符串拼接,Phase 3 接真实 LLM 改写时,buildPrompts() 内部替换为 LLM 调用,
// 外部签名保持不变。
//
// 注意:中文 prompt 给即梦/doubao 优先,英文 prompt 给 MJ/SD 优先。

import type {
  L1SkeletonDto,
  L2SoftTissueDto,
  L3FeaturesDto,
  L4SkinDto,
  L5HairDto,
  L6DecorationDto,
} from './dto/blueprint.dto';
import type { CraniumShape, JawAngle, EyeShape, NoseBridge, SkinTone, SkinTexture, HairStyle, HairColor, Hairline, BrowShape, BrowColor, LashStyle, MakeupLevel, LipColor, Accessory } from './dto/blueprint.dto';

export const SUPPORTED_PLATFORMS = ['mj', 'sd', 'jimeng', 'doubao'] as const;
export type Platform = (typeof SUPPORTED_PLATFORMS)[number];

export interface BlueprintLayersForPrompt {
  L1_skeleton: L1SkeletonDto | null;
  L2_softTissue: L2SoftTissueDto | null;
  L3_features: L3FeaturesDto | null;
  L4_skin: L4SkinDto | null;
  L5_hair: L5HairDto | null;
  L6_decoration: L6DecorationDto | null;
}

export interface PromptResult {
  promptZh: string;
  promptEn: string;
  variants: { platform: Platform; prompt: string }[];
}

// ===== 字段 → 词条 字典 =====

const L1_ZH = {
  craniumShape: { long: '长颅', medium: '中颅', round: '圆颅', flat: '扁颅' } as Record<CraniumShape, string>,
  jawAngle: { sharp: '锐角下颌', medium: '中等下颌', soft: '钝角下颌' } as Record<JawAngle, string>,
};
const L1_EN = {
  craniumShape: { long: 'long skull', medium: 'medium skull', round: 'round skull', flat: 'flat skull' } as Record<CraniumShape, string>,
  jawAngle: { sharp: 'sharp jaw', medium: 'medium jaw', soft: 'soft jaw' } as Record<JawAngle, string>,
};

const L3_ZH = {
  eyeShape: {
    single: '单眼皮', inner: '内双', double: '双眼皮', phoenix: '丹凤眼', round: '圆眼', narrow: '细长眼',
  } as Record<EyeShape, string>,
  noseBridge: { high: '高鼻梁', medium: '中等鼻梁', low: '低鼻梁' } as Record<NoseBridge, string>,
};
const L3_EN = {
  eyeShape: {
    single: 'single eyelid', inner: 'inner double eyelid', double: 'double eyelid',
    phoenix: 'phoenix eyes', round: 'round eyes', narrow: 'narrow eyes',
  } as Record<EyeShape, string>,
  noseBridge: { high: 'high nose bridge', medium: 'medium nose bridge', low: 'low nose bridge' } as Record<NoseBridge, string>,
};

const L4_ZH = {
  skinTone: {
    fair: '瓷白肌', light: '自然白皙', medium: '自然色', olive: '黄调', tan: '小麦色', brown: '古铜', dark: '深棕',
  } as Record<SkinTone, string>,
  skinTexture: { smooth: '光滑肌肤', normal: '标准肤质', rough: '粗糙肌理', matte: '哑光肤质', oily: '油光肌' } as Record<SkinTexture, string>,
};
const L4_EN = {
  skinTone: {
    fair: 'fair porcelain skin', light: 'light skin', medium: 'medium skin', olive: 'olive skin',
    tan: 'tan skin', brown: 'brown skin', dark: 'dark skin',
  } as Record<SkinTone, string>,
  skinTexture: { smooth: 'smooth skin', normal: 'normal skin', rough: 'rough skin', matte: 'matte skin', oily: 'oily skin' } as Record<SkinTexture, string>,
};

const L5_ZH = {
  hairStyle: {
    straight_long: '黑色直长发', straight_short: '直短发', wavy: '大波浪卷发', curly: '卷发',
    ponytail: '马尾', bob: '波波头', bald: '光头',
  } as Record<HairStyle, string>,
  hairColor: { black: '黑色', brown: '棕色', blonde: '金色', red: '红色', silver: '银色', gray: '灰色', highlight: '挑染' } as Record<HairColor, string>,
  hairline: { high: '高发际线', medium: '中等发际线', low: '低发际线', m_shape: 'M 型发际线' } as Record<Hairline, string>,
  browShape: { straight: '平直眉', arched: '弓形眉', upward: '上挑眉', downward: '下垂眉', thick: '粗眉', thin: '细眉' } as Record<BrowShape, string>,
  browColor: { black: '黑色眉', brown: '棕色眉', gray: '灰色眉', same_as_hair: '与发色同' } as Record<BrowColor, string>,
  lashes: { long_dense: '长密睫毛', short_dense: '短密睫毛', long_sparse: '长疏睫毛', short_sparse: '短疏睫毛' } as Record<LashStyle, string>,
};
const L5_EN = {
  hairStyle: {
    straight_long: 'long straight hair', straight_short: 'short straight hair', wavy: 'wavy hair', curly: 'curly hair',
    ponytail: 'ponytail', bob: 'bob cut', bald: 'bald',
  } as Record<HairStyle, string>,
  hairColor: { black: 'black hair', brown: 'brown hair', blonde: 'blonde hair', red: 'red hair', silver: 'silver hair', gray: 'gray hair', highlight: 'highlighted hair' } as Record<HairColor, string>,
  hairline: { high: 'high hairline', medium: 'medium hairline', low: 'low hairline', m_shape: 'M-shaped hairline' } as Record<Hairline, string>,
  browShape: { straight: 'straight brows', arched: 'arched brows', upward: 'upward brows', downward: 'downward brows', thick: 'thick brows', thin: 'thin brows' } as Record<BrowShape, string>,
  browColor: { black: 'black brows', brown: 'brown brows', gray: 'gray brows', same_as_hair: 'brows same as hair' } as Record<BrowColor, string>,
  lashes: { long_dense: 'long dense lashes', short_dense: 'short dense lashes', long_sparse: 'long sparse lashes', short_sparse: 'short sparse lashes' } as Record<LashStyle, string>,
};

const L6_ZH = {
  makeup: { none: '素颜', natural: '素颜感妆容', light: '淡妆', heavy: '浓妆', costume: '戏妆' } as Record<MakeupLevel, string>,
  lipColor: { natural: '自然唇色', red: '正红唇', pink: '粉色唇', orange: '橘色唇', nude: '裸色唇', dark: '暗红唇' } as Record<LipColor, string>,
  accessory: { none: '无装饰', earrings: '耳环', necklace: '项链', headband: '发箍', mask: '面具', glasses: '眼镜' } as Record<Accessory, string>,
};
const L6_EN = {
  makeup: { none: 'bare face', natural: 'natural makeup', light: 'light makeup', heavy: 'heavy makeup', costume: 'costume makeup' } as Record<MakeupLevel, string>,
  lipColor: { natural: 'natural lips', red: 'red lips', pink: 'pink lips', orange: 'orange lips', nude: 'nude lips', dark: 'dark lips' } as Record<LipColor, string>,
  accessory: { none: 'no accessory', earrings: 'earrings', necklace: 'necklace', headband: 'headband', mask: 'face mask', glasses: 'glasses' } as Record<Accessory, string>,
};

// 数值 0~1 → 程度词
function levelZh(v: number, options: string[]): string {
  if (v < 0.2) return options[0]; // 极淡
  if (v < 0.5) return options[1]; // 适中
  if (v < 0.8) return options[2]; // 较重
  return options[3]; // 极重
}
function levelEn(v: number, options: string[]): string {
  if (v < 0.2) return options[0];
  if (v < 0.5) return options[1];
  if (v < 0.8) return options[2];
  return options[3];
}

// ===== 主拼装函数 =====

export function buildPrompts(
  layers: BlueprintLayersForPrompt,
  platforms: Platform[] = ['mj', 'sd', 'jimeng', 'doubao'],
): PromptResult {
  // ---- 中文 prompt ----
  const zhParts: string[] = [];

  if (layers.L1_skeleton) {
    const L1 = layers.L1_skeleton;
    zhParts.push(L1_ZH.craniumShape[L1.craniumShape]);
    zhParts.push(`脸型指数${L1.faceIndex.toFixed(2)}`);
    if (L1.cheekboneProminence > 0.5) zhParts.push('颧骨突出');
    if (L1.jawWidth > 0.6) zhParts.push('宽下颌');
  }
  if (layers.L2_softTissue) {
    const L2 = layers.L2_softTissue;
    if (L2.subcutaneousFat > 0.6) zhParts.push('饱满');
    if (L2.eyeSocketDepth > 0.5) zhParts.push('深眼窝');
    if (L2.browRidge > 0.5) zhParts.push('高眉骨');
  }
  if (layers.L3_features) {
    const L3 = layers.L3_features;
    zhParts.push(L3_ZH.eyeShape[L3.eyeShape]);
    if (L3.eyeApertureHeight > 0.7) zhParts.push('大眼');
    zhParts.push(L3_ZH.noseBridge[L3.noseBridge]);
    if (L3.lipThickness > 0.6) zhParts.push('厚唇');
    if (L3.chinProtrusion > 0.6) zhParts.push('前凸下巴');
  }
  if (layers.L4_skin) {
    const L4 = layers.L4_skin;
    zhParts.push(L4_ZH.skinTone[L4.skinTone]);
    if (L4.freckles > 0.3) zhParts.push(`雀斑${levelZh(L4.freckles, ['极少', '少许', '明显', '密集'])}`);
    if (L4.wrinkles > 0.3) zhParts.push(`细纹${levelZh(L4.wrinkles, ['极少', '轻微', '明显', '深纹'])}`);
  }
  if (layers.L5_hair) {
    const L5 = layers.L5_hair;
    zhParts.push(L5_ZH.hairColor[L5.hairColor]);
    zhParts.push(L5_ZH.hairStyle[L5.hairStyle]);
    zhParts.push(L5_ZH.browShape[L5.browShape]);
    zhParts.push(L5_ZH.lashes[L5.lashes]);
  }
  if (layers.L6_decoration) {
    const L6 = layers.L6_decoration;
    if (L6.makeup !== 'none') zhParts.push(L6_ZH.makeup[L6.makeup]);
    if (L6.lipColor !== 'natural') zhParts.push(L6_ZH.lipColor[L6.lipColor]);
    if (L6.accessory !== 'none') zhParts.push(L6_ZH.accessory[L6.accessory]);
  }

  const promptZh = `肖像特写,${zhParts.join('、')},半身像,自然光,胶片质感`;

  // ---- 英文 prompt (MJ/SD 优先) ----
  const enParts: string[] = ['portrait of a person'];
  if (layers.L5_hair) {
    enParts.push(`with ${L5_EN.hairColor[layers.L5_hair.hairColor]}`);
    enParts.push(`${L5_EN.hairStyle[layers.L5_hair.hairStyle]}`);
  }
  if (layers.L3_features) {
    enParts.push(`${L3_EN.eyeShape[layers.L3_features.eyeShape]}, ${L3_EN.noseBridge[layers.L3_features.noseBridge]}`);
  }
  if (layers.L4_skin) {
    enParts.push(L4_EN.skinTone[layers.L4_skin.skinTone]);
    enParts.push(L4_EN.skinTexture[layers.L4_skin.skinTexture]);
  }
  if (layers.L1_skeleton) {
    enParts.push(L1_EN.jawAngle[layers.L1_skeleton.jawAngle]);
  }
  if (layers.L5_hair) {
    enParts.push(L5_EN.browShape[layers.L5_hair.browShape]);
  }
  if (layers.L6_decoration) {
    const L6 = layers.L6_decoration;
    if (L6.makeup !== 'none') enParts.push(L6_EN.makeup[L6.makeup]);
    if (L6.accessory !== 'none') enParts.push(`wearing ${L6_EN.accessory[L6.accessory]}`);
  }
  enParts.push('cinematic lighting, film grain, 85mm, shallow depth of field');
  const promptEn = enParts.join(', ');

  // ---- 平台变体 ----
  const variants = platforms.map((p) => {
    if (p === 'mj') {
      // MJ: 关键词形式 + 风格后缀
      const mj = `${promptEn} --ar 1:1 --style raw --s 250`;
      return { platform: p, prompt: mj };
    }
    if (p === 'sd') {
      // SD: 完整自然语言 + negative prompt 暗示
      const sd = `${promptEn}\nNegative prompt: blurry, low quality, deformed`;
      return { platform: p, prompt: sd };
    }
    if (p === 'jimeng' || p === 'doubao') {
      // 即梦/豆包: 中文为主
      return { platform: p, prompt: promptZh };
    }
    return { platform: p, prompt: promptEn };
  });

  return { promptZh, promptEn, variants };
}