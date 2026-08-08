// 矛盾组合校验规则库 — 检测"罕见 / 视觉冲突 / 逻辑自悖"的参数组合
//
// 设计原则:
// 1. 规则只检测、提示,不阻塞 (UI 黄色 banner,用户可忽略)
// 2. 规则纯函数,无 IO,易测
// 3. 规则随 schema 演进,加新字段时这里同步加
// 4. 后端权威(防前端绕过),前端镜像一份做即时提示
//
// 注意:这里只是"风格提醒",不是"出图禁忌" — MJ/SD 实际都能画,
// 提示是帮创作者避免"看起来不自然"的组合,跟"安全"无关。

import type { L1SkeletonDto, L2SoftTissueDto, L3FeaturesDto, L5HairDto } from './dto/blueprint.dto';

export type ContradictionSeverity = 'warning' | 'info';

export interface Contradiction {
  id: string;
  layer: 'L3' | 'L5' | 'L1+L5';
  title: string;
  description: string;
  severity: ContradictionSeverity;
}

export interface BlueprintLayersLike {
  L1_skeleton: L1SkeletonDto | null;
  L2_softTissue: L2SoftTissueDto | null;
  L3_features: L3FeaturesDto | null;
  L5_hair: L5HairDto | null;
}

type Rule = (layers: BlueprintLayersLike) => Contradiction | null;

const RULES: Rule[] = [
  // ----- L3 五官 -----
  function baldSideburns(layers) {
    const l5 = layers.L5_hair;
    if (!l5) return null;
    if (l5.hairStyle === 'bald' && l5.sideburns > 0.5) {
      return {
        id: 'bald_long_sideburns',
        layer: 'L5',
        title: '光头 + 长鬓角',
        description: '光头通常不会有明显鬓角;若需要"潮人寸头",建议 sideburns ≤ 0.3',
        severity: 'warning',
      };
    }
    return null;
  },

  function hairlineMWithHighBrowRidge(layers) {
    const l5 = layers.L5_hair;
    const l2 = layers.L2_softTissue;
    if (!l5 || !l2) return null;
    if (l5.hairline === 'm_shape' && l2.browRidge > 0.7) {
      return {
        id: 'm_hairline_high_brow',
        layer: 'L1+L5',
        title: 'M 型发际线 + 高眉弓',
        description: '视觉上额头更显窄;若想突出"清冷",建议 browRidge ≤ 0.5',
        severity: 'info',
      };
    }
    return null;
  },

  function thinBrowHighDensity(layers) {
    const l5 = layers.L5_hair;
    if (!l5) return null;
    if (l5.browShape === 'thin' && l5.browDensity > 0.6) {
      return {
        id: 'thin_brow_high_density',
        layer: 'L5',
        title: '细眉 + 高眉密度',
        description: '形状细但密度高在小图容易糊成"一字眉";建议 browDensity ≤ 0.5',
        severity: 'warning',
      };
    }
    return null;
  },

  function blondeBlackBrow(layers) {
    const l5 = layers.L5_hair;
    if (!l5) return null;
    if (l5.hairColor === 'blonde' && l5.browColor === 'black') {
      return {
        id: 'blonde_black_brow',
        layer: 'L5',
        title: '金发 + 黑眉',
        description: '写实风格容易违和;二次元/插画风格可以接受,出图前请确认',
        severity: 'info',
      };
    }
    return null;
  },

  function ponytailBald(layers) {
    const l5 = layers.L5_hair;
    if (!l5) return null;
    if (l5.hairStyle === 'bald' && (l5.hairColor === 'red' || l5.hairColor === 'highlight')) {
      return {
        id: 'bald_colored',
        layer: 'L5',
        title: '光头 + 鲜艳发色',
        description: '发色在光头状态下视觉上无意义;建议 hairStyle 改为短发或波波头',
        severity: 'warning',
      };
    }
    return null;
  },

  function deepSocketHighCheek(layers) {
    const l2 = layers.L2_softTissue;
    const l1 = layers.L1_skeleton;
    if (!l2 || !l1) return null;
    if (l2.eyeSocketDepth > 0.7 && l1.cheekboneProminence > 0.7) {
      return {
        id: 'deep_socket_high_cheek',
        layer: 'L1+L5',
        title: '深眼窝 + 高颧骨',
        description: '面部阴影集中,容易显得"消瘦/凶狠";建议 cheekboneProminence ≤ 0.6',
        severity: 'info',
      };
    }
    return null;
  },

  function extremeLipThicknessTiny(layers) {
    const l3 = layers.L3_features;
    if (!l3) return null;
    if (l3.lipThickness > 0.85 && l3.lipWidth < 0.3) {
      return {
        id: 'thick_narrow_lips',
        layer: 'L3',
        title: '极厚唇 + 极窄唇宽',
        description: '厚唇 + 窄唇宽 罕见,通常厚唇唇宽也偏宽;建议 lipWidth ≥ 0.4',
        severity: 'warning',
      };
    }
    return null;
  },

  function lowNoseBridgeWideNose(layers) {
    const l3 = layers.L3_features;
    if (!l3) return null;
    if (l3.noseBridge === 'low' && l3.noseWidth > 0.7) {
      return {
        id: 'low_bridge_wide_nose',
        layer: 'L3',
        title: '低鼻梁 + 宽鼻',
        description: '低鼻梁通常鼻翼不会过宽(东亚面孔典型);若想做出"蒜头鼻"卡通风格可保留',
        severity: 'info',
      };
    }
    return null;
  },
];

export function detectContradictions(layers: BlueprintLayersLike): Contradiction[] {
  const result: Contradiction[] = [];
  for (const rule of RULES) {
    const c = rule(layers);
    if (c) result.push(c);
  }
  return result;
}