// 矛盾组合校验规则 — 前端镜像
//
// 跟后端 apps/api/src/blueprint/contradictions.ts 完全一致
// (双份同步维护,改动要同时改两边)
//
// 为什么前端也要一份:
// - 用户改 slider 时即时检测,不需要等 PATCH 返结果再显示 banner
// - 网络中断 / 离线状态下也能给提示
//
// 设计原则:
// - 纯函数,无 IO
// - 只检测、提示,不阻塞 (UI 黄色 banner,用户可忽略)
// - 规则随 schema 演进,加新字段时这里同步加

import type { Contradiction, L1Skeleton, L2SoftTissue, L3Features, L5Hair } from './blueprint';

export interface ContradictableLayers {
  L1_skeleton?: L1Skeleton | null;
  L2_softTissue?: L2SoftTissue | null;
  L3_features?: L3Features | null;
  L5_hair?: L5Hair | null;
}

type Rule = (layers: ContradictableLayers) => Contradiction | null;

const RULES: Rule[] = [
  // ----- L5 毛发 -----
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

export function detectContradictions(layers: ContradictableLayers): Contradiction[] {
  const result: Contradiction[] = [];
  for (const rule of RULES) {
    const c = rule(layers);
    if (c) result.push(c);
  }
  return result;
}