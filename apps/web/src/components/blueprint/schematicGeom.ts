// SchematicFace 几何计算 — 抽出来便于单元测试
//
// 与 SchematicFace.vue 1:1 配套使用。所有坐标基于 600×800 画布,
// fwu (face width unit) ≈ fw = 240px。改任何字段都会影响整脸布局,
// 测试时建议固定一组 l1+l3 验证关键节点(cheekX/jawX/chinX/browRidgeY/isMale)。

import type { L1Skeleton, L3Features } from '@/api/blueprint';

export interface FaceGeom {
  cx: number;
  cy: number;
  fw: number;          // face width
  fh: number;          // face height = fw * faceIndex
  topY: number;        // face top y
  chinY: number;       // chin tip y
  browY: number;       // brow baseline y
  eyeY: number;        // eye centerline y
  noseY: number;       // nose tip y
  lipY: number;        // lip centerline y
  cheekX: number;      // cheek max x offset (positive, mirror)
  jawX: number;        // jaw angle x offset (positive, mirror)
  chinX: number;       // chin protrusion offset (forward)
  browRidgeY: number;  // brow ridge vertical position
  isMale: boolean;
}

export function computeGeom(l1: L1Skeleton, l3: L3Features): FaceGeom {
  const W = 600;
  const cx = W / 2;
  const cy = 420;
  const fw = 240;
  const fh = fw * l1.faceIndex;
  const isMale = l1.gender === 'male';

  let topAdjust = 0;
  switch (l1.craniumShape) {
    case 'long': topAdjust = -15; break;
    case 'round': topAdjust = 5; break;
    case 'flat': topAdjust = 25; break;
    default: topAdjust = 0;
  }

  return {
    cx,
    cy,
    fw,
    fh,
    topY: cy - fh / 2 + topAdjust,
    chinY: cy + fh / 2,
    browY: cy - fh / 2 + fh * l1.upperThirdRatio,
    eyeY: cy - fh / 2 + fh * l1.upperThirdRatio + 30,
    noseY: cy - fh / 2 + fh * (l1.upperThirdRatio + l1.midThirdRatio),
    lipY: cy + fh / 2 - 50,
    cheekX: cx + (fw / 2) * (0.6 + l1.cheekboneWidth * 0.4),
    jawX: cx + (fw / 2) * (0.5 + l1.jawWidth * 0.35) * (isMale ? 1.08 : 0.95),
    chinX: 8 + l3.chinProtrusion * 12,
    browRidgeY: cy - fh / 2 + fh * l1.upperThirdRatio - 18,
    isMale,
  };
}