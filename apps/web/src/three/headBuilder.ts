// 简化头骨 mesh builder — L1 + L2 → Three.js Group
//
// 风格 B:半透明软材质 + 写意头骨
// - MeshStandardMaterial,roughness=0.6,opacity=0.78
// - 米黄 #e8d5b7 主色,跟 catalog paper 色系一致
// - 不画五官的硬细节(那是 R5b L3 的工作)
//
// 性能策略:
// - 全量 rebuild(每次 params 变化重建 group),L1+L2 = 14 字段 → ~5ms 开销,可接受
// - 大 mesh 用 SphereGeometry 32 段,小 mesh 16 段
// - 不缓存 geometry,dispose 在组件 unmount 时统一做

import * as THREE from 'three';
import type { L1Skeleton, L2SoftTissue, L3Features, L5Hair } from '@/api/blueprint';

export interface HeadParams {
  L1: L1Skeleton;
  L2: L2SoftTissue;
  L3: L3Features;
  L5: L5Hair;
}

// 颜色常量 — 跟 catalog paper 色系对齐
const COLOR_SKIN = 0xe8d5b7; // 米黄主色
const COLOR_FAT = 0xf2c8a8; // 颊脂垫偏粉
const COLOR_SHADOW = 0x3a2820; // 眼眶内陷
const COLOR_PUPIL = 0x1a1208; // 瞳孔
const COLOR_LIP = 0xc47266; // 唇色(粉红偏暗)
const COLOR_HAIR_BLACK = 0x1a1410;
const COLOR_HAIR_BROWN = 0x4a2a1a;
const COLOR_HAIR_BLONDE = 0xd4b878;
const COLOR_HAIR_RED = 0x8a3a20;
const COLOR_HAIR_SILVER = 0xb0b0b8;
const COLOR_HAIR_GRAY = 0x707070;
const COLOR_HAIR_HIGHLIGHT = 0xc890e0;

// craniumShape 头部 y 缩放系数
const CRANIUM_Y_SCALE: Record<string, number> = {
  long: 1.18,
  medium: 1.0,
  round: 0.94,
  flat: 0.85,
};

// jawAngle 下颌锥体边数 + 收口形状
const JAW_ANGLE_RADII: Record<string, [number, number]> = {
  sharp: [0.35, 0.55],
  medium: [0.42, 0.6],
  soft: [0.5, 0.7],
};

// 发型 → 头部 mesh 变体参数 (size, top height)
const HAIR_STYLE_RADIUS: Record<string, [number, number, number]> = {
  straight_long: [0.42, 1.4, 0.45],   // 直长发: 贴头皮 + 长发丝往下
  straight_short: [0.42, 0.05, 0.45], // 短发: 略覆盖头顶
  wavy: [0.48, 0.5, 0.55],           // 大波浪: 中等蓬松
  curly: [0.55, 0.4, 0.65],           // 卷发: 蓬松
  ponytail: [0.42, 0.05, 0.45],       // 马尾: 头顶短发 + 后面长(简化为头顶短发)
  bob: [0.45, 0.25, 0.55],           // 齐肩: 包到耳下
  bald: [0.0, 0.0, 0.0],              // 光头: 不画头发
};

function hairColorHex(c: string): number {
  switch (c) {
    case 'brown': return COLOR_HAIR_BROWN;
    case 'blonde': return COLOR_HAIR_BLONDE;
    case 'red': return COLOR_HAIR_RED;
    case 'silver': return COLOR_HAIR_SILVER;
    case 'gray': return COLOR_HAIR_GRAY;
    case 'highlight': return COLOR_HAIR_HIGHLIGHT;
    case 'black':
    default:
      return COLOR_HAIR_BLACK;
  }
}

function makeSkinMat(opacity = 0.78): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: COLOR_SKIN,
    roughness: 0.65,
    metalness: 0.0,
    transparent: true,
    opacity,
    side: THREE.FrontSide,
  });
}

export function buildHead(params: HeadParams): THREE.Group {
  const { L1, L2, L3, L5 } = params;
  const group = new THREE.Group();
  group.name = 'BlueprintHead';

  // 1. 颅骨主体 — SphereGeometry + 三轴缩放
  const craniumGeom = new THREE.SphereGeometry(1, 48, 48);
  const cranium = new THREE.Mesh(craniumGeom, makeSkinMat(0.85));
  // faceIndex (1.0~1.6) → y 缩放,默认 1.35
  cranium.scale.set(1, L1.faceIndex / 1.35, 1);
  // craniumShape 在 faceIndex 基础上叠加
  const yScale = CRANIUM_Y_SCALE[L1.craniumShape] ?? 1;
  cranium.scale.y *= yScale;
  cranium.position.y = 0.4;
  cranium.name = 'cranium';
  group.add(cranium);

  // 2. 颧骨 ×2
  const cheekboneGeom = new THREE.SphereGeometry(1, 24, 24);
  const cheekboneMat = makeSkinMat(0.82);
  [-1, 1].forEach((side) => {
    const width = L1.cheekboneWidth;
    const prominence = L1.cheekboneProminence;
    const cb = new THREE.Mesh(cheekboneGeom, cheekboneMat);
    cb.scale.set(0.18 * (0.4 + width * 0.6), 0.12, 0.06 + prominence * 0.16);
    cb.position.set(side * (0.42 + width * 0.25), 0.05, 0.78);
    cb.name = `cheekbone_${side > 0 ? 'R' : 'L'}`;
    group.add(cb);
  });

  // 3. 下颌 — ConeGeometry,4 边模拟下颌骨
  const jaw = new THREE.Mesh(
    new THREE.ConeGeometry(1, 1.0, 4, 1, true),
    makeSkinMat(0.82),
  );
  const [jawRadiusTop, jawRadiusBot] = JAW_ANGLE_RADII[L1.jawAngle] ?? [0.42, 0.6];
  jaw.scale.set(jawRadiusBot * (0.6 + L1.jawWidth * 0.6), 1.2, jawRadiusBot * (0.6 + L1.jawWidth * 0.6));
  jaw.position.y = -0.6;
  jaw.rotation.y = Math.PI / 4;
  jaw.name = 'jaw';
  group.add(jaw);

  // 4. 眼眶 ×2 — RingGeometry 内嵌
  [-1, 1].forEach((side) => {
    const socketDepth = L2.eyeSocketDepth;
    const ringGeom = new THREE.RingGeometry(0.08, 0.13, 24);
    const socket = new THREE.Mesh(
      ringGeom,
      new THREE.MeshBasicMaterial({
        color: COLOR_SHADOW,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4 + socketDepth * 0.5,
      }),
    );
    socket.position.set(side * 0.3, 0.35, 0.88 - socketDepth * 0.06);
    socket.name = `eyeSocket_${side > 0 ? 'R' : 'L'}`;
    group.add(socket);
  });

  // 5. 眉弓 ×2 — BoxGeometry 弧形
  const browMat = makeSkinMat(0.85);
  [-1, 1].forEach((side) => {
    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.04 + L2.browRidge * 0.05, 0.06),
      browMat,
    );
    brow.position.set(side * 0.3, 0.5, 0.92);
    brow.name = `brow_${side > 0 ? 'R' : 'L'}`;
    group.add(brow);
  });

  // 6. 颊脂垫 ×2 — 苹果肌
  const fatMat = new THREE.MeshStandardMaterial({
    color: COLOR_FAT,
    roughness: 0.45,
    metalness: 0.0,
    transparent: true,
    opacity: 0.45,
  });
  [-1, 1].forEach((side) => {
    const fat = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 24), fatMat);
    const size = 0.15 + L2.buccalFat * 0.15;
    fat.scale.set(size, size * 0.7, size * 0.6);
    fat.position.set(side * 0.42, -0.05, 0.7);
    fat.name = `buccalFat_${side > 0 ? 'R' : 'L'}`;
    group.add(fat);
  });

  // 7. 法令纹 ×2 — CatmullRomCurve3 弧线
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x8a6850,
    transparent: true,
    opacity: 0.4 + L2.nasolabialFold * 0.5,
  });
  [-1, 1].forEach((side) => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i += 1) {
      const t = i / 8;
      points.push(
        new THREE.Vector3(
          side * (0.18 + t * 0.1),
          0.0 - t * 0.45,
          0.82 - t * 0.08,
        ),
      );
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const lineGeom = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
    const line = new THREE.Line(lineGeom, lineMat);
    line.name = `nasolabial_${side > 0 ? 'R' : 'L'}`;
    group.add(line);
  });

  // ====== L3 五官 (鼻 / 眼 / 唇 / 耳 / 人中) ======

  // 8. 鼻 — ConeGeometry (高鼻梁更尖)
  const noseGeom = new THREE.ConeGeometry(0.08, 0.18, 8);
  const nose = new THREE.Mesh(noseGeom, makeSkinMat(0.92));
  const noseLenScale = 0.7 + L3.noseLength * 0.6; // 0.7 ~ 1.3
  const noseWidthScale = 0.7 + L3.noseWidth * 0.6;
  const bridgeZ = L3.noseBridge === 'high' ? 0.96 : L3.noseBridge === 'low' ? 0.84 : 0.9;
  nose.scale.set(noseWidthScale, noseLenScale, noseWidthScale);
  nose.position.set(0, 0.05, bridgeZ);
  nose.rotation.x = -Math.PI / 2; // 尖朝外
  nose.name = 'nose';
  group.add(nose);

  // 9. 鼻翼 ×2 — 小球
  [-1, 1].forEach((side) => {
    const wing = new THREE.Mesh(
      new THREE.SphereGeometry(0.025 + L3.noseWidth * 0.04, 12, 12),
      makeSkinMat(0.92),
    );
    wing.position.set(side * (0.04 + L3.noseWidth * 0.06), -0.04, 0.88);
    wing.name = `noseWing_${side > 0 ? 'R' : 'L'}`;
    group.add(wing);
  });

  // 10. 眼 ×2 — SphereGeometry 眼球 + 瞳孔
  const eyeDistanceOffset = (L3.eyeDistance - 0.5) * 0.15; // ±0.075
  const eyeApertureScale = 0.5 + L3.eyeApertureHeight * 0.8; // 0.5 ~ 1.3
  [-1, 1].forEach((side) => {
    // 眼球(白色 — 用 skin 色简化)
    const eyeball = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfafaf8,
        roughness: 0.3,
        transparent: true,
        opacity: 0.95,
      }),
    );
    eyeball.scale.set(1, eyeApertureScale, 0.6);
    eyeball.position.set(side * (0.18 + eyeDistanceOffset), 0.32, 0.82);
    eyeball.name = `eyeball_${side > 0 ? 'R' : 'L'}`;
    group.add(eyeball);

    // 瞳孔 — 黑圆点
    const pupil = new THREE.Mesh(
      new THREE.CircleGeometry(0.025, 16),
      new THREE.MeshBasicMaterial({ color: COLOR_PUPIL }),
    );
    pupil.position.set(side * (0.18 + eyeDistanceOffset), 0.32, 0.86);
    pupil.name = `pupil_${side > 0 ? 'R' : 'L'}`;
    group.add(pupil);
  });

  // 11. 唇 — TorusGeometry (上唇细线) + 半圆下唇
  const lipMat = new THREE.MeshStandardMaterial({
    color: COLOR_LIP,
    roughness: 0.55,
    transparent: true,
    opacity: 0.7 + L3.lipThickness * 0.25,
  });
  const lipWidth = 0.06 + L3.lipWidth * 0.18; // 0.06 ~ 0.24
  const lipThick = 0.015 + L3.lipThickness * 0.025;
  // 上唇 — 弧形细条
  const upperLip = new THREE.Mesh(
    new THREE.TorusGeometry(lipWidth * 0.5, lipThick, 8, 12, Math.PI),
    lipMat,
  );
  upperLip.position.set(0, -0.18, 0.82);
  upperLip.rotation.z = Math.PI; // 弧朝下
  upperLip.name = 'upperLip';
  group.add(upperLip);
  // 下唇 — 半圆
  const lowerLip = new THREE.Mesh(
    new THREE.SphereGeometry(lipWidth * 0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    lipMat,
  );
  lowerLip.scale.set(1, 0.5, 0.4);
  lowerLip.position.set(0, -0.22, 0.82);
  lowerLip.name = 'lowerLip';
  group.add(lowerLip);

  // 12. 耳 ×2 — SphereGeometry 半圆
  const earSize = 0.05 + L3.earSize * 0.07; // 0.05 ~ 0.12
  const earYOffset = (L3.earPosition - 0.5) * 0.4; // ±0.2
  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(
      new THREE.SphereGeometry(earSize, 12, 12),
      makeSkinMat(0.85),
    );
    ear.scale.set(0.5, 1.4, 0.6);
    ear.position.set(side * (0.55 + earSize * 0.3), 0.3 + earYOffset, 0.18);
    ear.name = `ear_${side > 0 ? 'R' : 'L'}`;
    group.add(ear);
  });

  // ====== L5 毛发 ======

  // 13. 头发 — 按发型变体
  const [hairRadius, hairTopY, hairFrontZ] = HAIR_STYLE_RADIUS[L5.hairStyle] ?? [0, 0, 0];
  if (hairRadius > 0) {
    const hairMat = new THREE.MeshStandardMaterial({
      color: hairColorHex(L5.hairColor),
      roughness: 0.85,
      metalness: 0.0,
      transparent: true,
      opacity: 0.92,
    });
    const hairGeom = new THREE.SphereGeometry(hairRadius, 24, 24);
    const hair = new THREE.Mesh(hairGeom, hairMat);
    hair.scale.set(1.05, hairTopY > 0.3 ? 1.3 : 0.6, hairFrontZ);
    hair.position.set(0, 0.55 + (hairTopY > 0.3 ? 0.2 : 0.1), 0);
    hair.name = 'hair';
    group.add(hair);

    // 长发加尾巴
    if (L5.hairStyle === 'straight_long' || L5.hairStyle === 'wavy') {
      const tail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.05, 0.8, 12),
        hairMat,
      );
      tail.position.set(0, -0.5, -0.3);
      tail.name = 'hairTail';
      group.add(tail);
    }
  }

  // 14. 眉 ×2 — BoxGeometry (弧形,用 browDensity 加宽加高)
  const browColorMap: Record<string, number> = {
    black: COLOR_HAIR_BLACK,
    brown: COLOR_HAIR_BROWN,
    gray: COLOR_HAIR_GRAY,
    same_as_hair: hairColorHex(L5.hairColor),
  };
  const browColor = browColorMap[L5.browColor] ?? COLOR_HAIR_BLACK;
  const browMatL5 = new THREE.MeshStandardMaterial({
    color: browColor,
    roughness: 0.7,
    transparent: true,
    opacity: 0.9,
  });
  const browThick = L5.browShape === 'thick' ? 0.06 : L5.browShape === 'thin' ? 0.015 : 0.035;
  const browWide = 0.15 + L5.browDensity * 0.1;
  const browY = 0.48 + (L5.browShape === 'upward' ? 0.02 : L5.browShape === 'downward' ? -0.02 : 0);
  [-1, 1].forEach((side) => {
    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(browWide, browThick, 0.03),
      browMatL5,
    );
    // 弓形上挑 — 中间略高
    if (L5.browShape === 'arched' || L5.browShape === 'upward') {
      brow.rotation.z = side > 0 ? -0.15 : 0.15;
    } else if (L5.browShape === 'downward') {
      brow.rotation.z = side > 0 ? 0.15 : -0.15;
    }
    brow.position.set(side * 0.2, browY, 0.94);
    brow.name = `brow_${side > 0 ? 'R' : 'L'}_L5`;
    group.add(brow);
  });

  return group;
}

export function disposeHead(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else {
        mat.dispose();
      }
    }
  });
}