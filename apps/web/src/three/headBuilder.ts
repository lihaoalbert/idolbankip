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
import type { L1Skeleton, L2SoftTissue } from '@/api/blueprint';

export interface HeadParams {
  L1: L1Skeleton;
  L2: L2SoftTissue;
}

// 颜色常量 — 跟 catalog paper 色系对齐
const COLOR_SKIN = 0xe8d5b7; // 米黄主色
const COLOR_FAT = 0xf2c8a8; // 颊脂垫偏粉
const COLOR_SHADOW = 0x3a2820; // 眼眶内陷

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
  const { L1, L2 } = params;
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