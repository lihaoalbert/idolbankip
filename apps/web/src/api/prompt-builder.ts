// L7 渲染 prompt 整合 — 前端镜像
//
// 跟后端 apps/api/src/blueprint/prompt-builder.ts 完全一致(双份同步维护)
// 改动要同时改两边
//
// 为什么前端要一份:
// 1. 实时预览(改完 L1~L6 slider,立即看到 prompt 草稿,不需要等 PATCH)
// 2. 不依赖网络,前端 fallback / 离线草稿模式可用
// 3. UI 复杂度低 — 不需要 LLM 改写,模板拼接足够

import type {
  L1Skeleton,
  L2SoftTissue,
  L3Features,
  L4Skin,
  L5Hair,
  L6Decoration,
  Platform,
} from './blueprint';

export const SUPPORTED_PLATFORMS: Platform[] = ['mj', 'sd', 'jimeng', 'doubao'];

export interface BlueprintLayersForPrompt {
  L1_skeleton?: L1Skeleton | null;
  L2_softTissue?: L2SoftTissue | null;
  L3_features?: L3Features | null;
  L4_skin?: L4Skin | null;
  L5_hair?: L5Hair | null;
  L6_decoration?: L6Decoration | null;
}

export interface PromptResult {
  promptZh: string;
  promptEn: string;
  variants: { platform: Platform; prompt: string }[];
}

// ===== 字段 → 词条 字典 =====

const L1_ZH = {
  craniumShape: { long: '长颅', medium: '中颅', round: '圆颅', flat: '扁颅' } as Record<string, string>,
  jawAngle: { sharp: '锐角下颌', medium: '中等下颌', soft: '钝角下颌' } as Record<string, string>,
};
const L1_EN = {
  craniumShape: { long: 'long skull', medium: 'medium skull', round: 'round skull', flat: 'flat skull' } as Record<string, string>,
  jawAngle: { sharp: 'sharp jaw', medium: 'medium jaw', soft: 'soft jaw' } as Record<string, string>,
};

const L3_ZH = {
  eyeShape: {
    single: '单眼皮', inner: '内双', double: '双眼皮', phoenix: '丹凤眼', round: '圆眼', narrow: '细长眼',
  } as Record<string, string>,
  noseBridge: { high: '高鼻梁', medium: '中等鼻梁', low: '低鼻梁' } as Record<string, string>,
};
const L3_EN = {
  eyeShape: {
    single: 'single eyelid', inner: 'inner double eyelid', double: 'double eyelid',
    phoenix: 'phoenix eyes', round: 'round eyes', narrow: 'narrow eyes',
  } as Record<string, string>,
  noseBridge: { high: 'high nose bridge', medium: 'medium nose bridge', low: 'low nose bridge' } as Record<string, string>,
};

const L4_ZH = {
  skinTone: {
    fair: '瓷白肌', light: '自然白皙', medium: '自然色', olive: '黄调', tan: '小麦色', brown: '古铜', dark: '深棕',
  } as Record<string, string>,
  skinTexture: { smooth: '光滑肌肤', normal: '标准肤质', rough: '粗糙肌理', matte: '哑光肤质', oily: '油光肌' } as Record<string, string>,
};
const L4_EN = {
  skinTone: {
    fair: 'fair porcelain skin', light: 'light skin', medium: 'medium skin', olive: 'olive skin',
    tan: 'tan skin', brown: 'brown skin', dark: 'dark skin',
  } as Record<string, string>,
  skinTexture: { smooth: 'smooth skin', normal: 'normal skin', rough: 'rough skin', matte: 'matte skin', oily: 'oily skin' } as Record<string, string>,
};

const L5_ZH = {
  hairStyle: {
    straight_long: '黑色直长发', straight_short: '直短发', wavy: '大波浪卷发', curly: '卷发',
    ponytail: '马尾', bob: '波波头', bald: '光头',
  } as Record<string, string>,
  hairColor: { black: '黑色', brown: '棕色', blonde: '金色', red: '红色', silver: '银色', gray: '灰色', highlight: '挑染' } as Record<string, string>,
  hairline: { high: '高发际线', medium: '中等发际线', low: '低发际线', m_shape: 'M 型发际线' } as Record<string, string>,
  browShape: { straight: '平直眉', arched: '弓形眉', upward: '上挑眉', downward: '下垂眉', thick: '粗眉', thin: '细眉' } as Record<string, string>,
  browColor: { black: '黑色眉', brown: '棕色眉', gray: '灰色眉', same_as_hair: '与发色同' } as Record<string, string>,
  lashes: { long_dense: '长密睫毛', short_dense: '短密睫毛', long_sparse: '长疏睫毛', short_sparse: '短疏睫毛' } as Record<string, string>,
};
const L5_EN = {
  hairStyle: {
    straight_long: 'long straight hair', straight_short: 'short straight hair', wavy: 'wavy hair', curly: 'curly hair',
    ponytail: 'ponytail', bob: 'bob cut', bald: 'bald',
  } as Record<string, string>,
  hairColor: { black: 'black hair', brown: 'brown hair', blonde: 'blonde hair', red: 'red hair', silver: 'silver hair', gray: 'gray hair', highlight: 'highlighted hair' } as Record<string, string>,
  hairline: { high: 'high hairline', medium: 'medium hairline', low: 'low hairline', m_shape: 'M-shaped hairline' } as Record<string, string>,
  browShape: { straight: 'straight brows', arched: 'arched brows', upward: 'upward brows', downward: 'downward brows', thick: 'thick brows', thin: 'thin brows' } as Record<string, string>,
  browColor: { black: 'black brows', brown: 'brown brows', gray: 'gray brows', same_as_hair: 'brows same as hair' } as Record<string, string>,
  lashes: { long_dense: 'long dense lashes', short_dense: 'short dense lashes', long_sparse: 'long sparse lashes', short_sparse: 'short sparse lashes' } as Record<string, string>,
};

const L6_ZH = {
  makeup: { none: '素颜', natural: '素颜感妆容', light: '淡妆', heavy: '浓妆', costume: '戏妆' } as Record<string, string>,
  lipColor: { natural: '自然唇色', red: '正红唇', pink: '粉色唇', orange: '橘色唇', nude: '裸色唇', dark: '暗红唇' } as Record<string, string>,
  accessory: { none: '无装饰', earrings: '耳环', necklace: '项链', headband: '发箍', mask: '面具', glasses: '眼镜' } as Record<string, string>,
};
const L6_EN = {
  makeup: { none: 'bare face', natural: 'natural makeup', light: 'light makeup', heavy: 'heavy makeup', costume: 'costume makeup' } as Record<string, string>,
  lipColor: { natural: 'natural lips', red: 'red lips', pink: 'pink lips', orange: 'orange lips', nude: 'nude lips', dark: 'dark lips' } as Record<string, string>,
  accessory: { none: 'no accessory', earrings: 'earrings', necklace: 'necklace', headband: 'headband', mask: 'face mask', glasses: 'glasses' } as Record<string, string>,
};

function levelZh(v: number, options: string[]): string {
  if (v < 0.2) return options[0];
  if (v < 0.5) return options[1];
  if (v < 0.8) return options[2];
  return options[3];
}
function levelEn(v: number, options: string[]): string {
  if (v < 0.2) return options[0];
  if (v < 0.5) return options[1];
  if (v < 0.8) return options[2];
  return options[3];
}

export function buildPrompts(
  layers: BlueprintLayersForPrompt,
  platforms: Platform[] = ['mj', 'sd', 'jimeng', 'doubao'],
): PromptResult {
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

  const variants = platforms.map((p) => {
    if (p === 'mj') {
      return { platform: p, prompt: `${promptEn} --ar 1:1 --style raw --s 250` };
    }
    if (p === 'sd') {
      return { platform: p, prompt: `${promptEn}\nNegative prompt: blurry, low quality, deformed` };
    }
    if (p === 'jimeng' || p === 'doubao') {
      return { platform: p, prompt: promptZh };
    }
    return { platform: p, prompt: promptEn };
  });

  return { promptZh, promptEn, variants };
}