<script setup lang="ts">
/**
 * SchematicFace — Blueprint 2.0 Track A 核心组件
 *
 * 把 L1-L6 的 46 个参数实时渲染成 600×800 的工程图风格人脸矢量图,
 * 作为 ControlNet canny/depth 输入控制生图结构。
 *
 * 设计约束(见 docs/blueprint-schematic-face.md §1):
 *   - P1: 每个参数都有可见映射
 *   - P2: 中性灰基底,不锁人种
 *   - P4: 不画照片质感
 *   - P5: 不画卡通
 *   - P7: 默认值即"标准脸"
 *
 * Round 1 范围:核心 8 区域 + 主要参数,完整 46 字段;Round 2 补 L4 细节(雀斑/痣/毛孔)
 * + L6 浓妆/戏妆 + 标注角标。
 */
import { computed, onMounted, ref, watch } from 'vue';
import type { Blueprint } from '@/api/blueprint';
import {
  L1_DEFAULTS, L2_DEFAULTS, L3_DEFAULTS, L4_DEFAULTS, L5_DEFAULTS, L6_DEFAULTS,
  type L1Skeleton, type L2SoftTissue, type L3Features, type L4Skin, type L5Hair, type L6Decoration,
} from '@/api/blueprint';
import { computeGeom } from './schematicGeom';
import type { FaceGeom } from './schematicGeom';

interface Props {
  layers: Blueprint['layers'];
  showAnnotations?: boolean;
  resolution?: number;
}
const props = withDefaults(defineProps<Props>(), {
  showAnnotations: false,
  resolution: 600,
});

const W = 600;
const H = 800;
const canvasRef = ref<HTMLCanvasElement | null>(null);
const dataURL = ref<string>('');

// ===================== 调色板 (P2 中性灰基底) =====================

const SKIN: Record<string, string> = {
  fair: '#F0DCC8',
  light: '#E8C9A8',
  medium: '#D4B58A',
  olive: '#B8966B',
  tan: '#9C7A52',
  brown: '#7A5A3A',
  dark: '#4F3826',
};
const HAIR_COLOR: Record<string, string> = {
  black: '#1A1A1A',
  brown: '#4A2E1A',
  blonde: '#D4B872',
  red: '#8B3A1A',
  silver: '#B0B0B8',
  gray: '#707074',
  highlight: '#D4C088',
};
const LIP_COLOR: Record<string, string> = {
  natural: '#C46A6A',
  red: '#C8324C',
  pink: '#E07892',
  orange: '#D88860',
  nude: '#B89078',
  dark: '#6A2030',
};
const CREAM = '#F6F2EA';
const INK = '#0E0E0F';
const STAMP_RED = '#B83A2C';

// ===================== 数据提取 (fallback to defaults) =====================

const l1 = computed<L1Skeleton>(() => ({ ...L1_DEFAULTS, ...(props.layers.L1_skeleton as object | null ?? {}) }));
const l2 = computed<L2SoftTissue>(() => ({ ...L2_DEFAULTS, ...(props.layers.L2_softTissue as object | null ?? {}) }));
const l3 = computed<L3Features>(() => ({ ...L3_DEFAULTS, ...(props.layers.L3_features as object | null ?? {}) }));
const l4 = computed<L4Skin>(() => ({ ...L4_DEFAULTS, ...(props.layers.L4_skin as object | null ?? {}) }));
const l5 = computed<L5Hair>(() => ({ ...L5_DEFAULTS, ...(props.layers.L5_hair as object | null ?? {}) }));
const l6 = computed<L6Decoration>(() => ({ ...L6_DEFAULTS, ...(props.layers.L6_decoration as object | null ?? {}) }));

// ===================== 绘制函数 =====================

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
}

function drawHair(ctx: CanvasRenderingContext2D, l5: L5Hair, g: FaceGeom) {
  if (l5.hairStyle === 'bald') return;
  ctx.save();
  ctx.fillStyle = HAIR_COLOR[l5.hairColor] ?? INK;

  // Hairline shape determines the front edge
  let hairlineOffset = 0;
  switch (l5.hairline) {
    case 'high': hairlineOffset = -20; break;
    case 'low': hairlineOffset = 25; break;
    case 'm_shape': hairlineOffset = 10; break;
    default: hairlineOffset = 0;
  }

  // Different hair shapes
  switch (l5.hairStyle) {
    case 'straight_long': {
      // Long straight: frame the face down to shoulders
      ctx.beginPath();
      ctx.moveTo(g.cx - g.fw * 0.75, g.cy + g.fh * 0.4);
      ctx.quadraticCurveTo(g.cx - g.fw * 0.85, g.cy - g.fh * 0.3, g.cx - g.fw * 0.4, g.topY - 10 + hairlineOffset);
      ctx.quadraticCurveTo(g.cx, g.topY - 35 + hairlineOffset, g.cx + g.fw * 0.4, g.topY - 10 + hairlineOffset);
      ctx.quadraticCurveTo(g.cx + g.fw * 0.85, g.cy - g.fh * 0.3, g.cx + g.fw * 0.75, g.cy + g.fh * 0.4);
      ctx.quadraticCurveTo(g.cx + g.fw * 0.6, g.cy + g.fh * 0.45, g.cx, g.cy + g.fh * 0.5);
      ctx.quadraticCurveTo(g.cx - g.fw * 0.6, g.cy + g.fh * 0.45, g.cx - g.fw * 0.75, g.cy + g.fh * 0.4);
      ctx.fill();
      break;
    }
    case 'straight_short': {
      // Short straight: just covers top of head
      ctx.beginPath();
      ctx.moveTo(g.cx - g.fw * 0.65, g.eyeY);
      ctx.quadraticCurveTo(g.cx - g.fw * 0.75, g.topY - 10, g.cx - g.fw * 0.35, g.topY - 5 + hairlineOffset);
      ctx.quadraticCurveTo(g.cx, g.topY - 25 + hairlineOffset, g.cx + g.fw * 0.35, g.topY - 5 + hairlineOffset);
      ctx.quadraticCurveTo(g.cx + g.fw * 0.75, g.topY - 10, g.cx + g.fw * 0.65, g.eyeY);
      ctx.quadraticCurveTo(g.cx, g.eyeY - 15, g.cx - g.fw * 0.65, g.eyeY);
      ctx.fill();
      break;
    }
    case 'wavy': {
      // Wavy: long with wave bumps at sides
      ctx.beginPath();
      ctx.moveTo(g.cx - g.fw * 0.75, g.cy + g.fh * 0.4);
      ctx.quadraticCurveTo(g.cx - g.fw * 0.9, g.cy, g.cx - g.fw * 0.4, g.topY + hairlineOffset);
      ctx.quadraticCurveTo(g.cx, g.topY - 25 + hairlineOffset, g.cx + g.fw * 0.4, g.topY + hairlineOffset);
      ctx.quadraticCurveTo(g.cx + g.fw * 0.9, g.cy, g.cx + g.fw * 0.75, g.cy + g.fh * 0.4);
      ctx.quadraticCurveTo(g.cx + g.fw * 0.55, g.cy + g.fh * 0.55, g.cx, g.cy + g.fh * 0.55);
      ctx.quadraticCurveTo(g.cx - g.fw * 0.55, g.cy + g.fh * 0.55, g.cx - g.fw * 0.75, g.cy + g.fh * 0.4);
      ctx.fill();
      break;
    }
    case 'curly': {
      // Curly: dense cloud shape
      ctx.beginPath();
      ctx.arc(g.cx - g.fw * 0.5, g.topY + 20, 50, 0, Math.PI * 2);
      ctx.arc(g.cx - g.fw * 0.3, g.topY - 10, 55, 0, Math.PI * 2);
      ctx.arc(g.cx, g.topY - 20, 60, 0, Math.PI * 2);
      ctx.arc(g.cx + g.fw * 0.3, g.topY - 10, 55, 0, Math.PI * 2);
      ctx.arc(g.cx + g.fw * 0.5, g.topY + 20, 50, 0, Math.PI * 2);
      ctx.arc(g.cx + g.fw * 0.55, g.cy, 60, 0, Math.PI * 2);
      ctx.arc(g.cx - g.fw * 0.55, g.cy, 60, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'ponytail': {
      // Ponytail: short at front, bun at back
      ctx.beginPath();
      ctx.moveTo(g.cx - g.fw * 0.55, g.eyeY + 10);
      ctx.quadraticCurveTo(g.cx - g.fw * 0.7, g.topY, g.cx - g.fw * 0.3, g.topY + hairlineOffset);
      ctx.quadraticCurveTo(g.cx, g.topY - 20 + hairlineOffset, g.cx + g.fw * 0.3, g.topY + hairlineOffset);
      ctx.quadraticCurveTo(g.cx + g.fw * 0.7, g.topY, g.cx + g.fw * 0.55, g.eyeY + 10);
      ctx.quadraticCurveTo(g.cx, g.eyeY, g.cx - g.fw * 0.55, g.eyeY + 10);
      ctx.fill();
      // Bun
      ctx.beginPath();
      ctx.arc(g.cx - g.fw * 0.65, g.topY + 30, 35, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'bob': {
      // Bob: shoulder length with straight cut
      ctx.beginPath();
      ctx.moveTo(g.cx - g.fw * 0.7, g.lipY + 20);
      ctx.quadraticCurveTo(g.cx - g.fw * 0.8, g.topY, g.cx - g.fw * 0.35, g.topY + hairlineOffset);
      ctx.quadraticCurveTo(g.cx, g.topY - 20 + hairlineOffset, g.cx + g.fw * 0.35, g.topY + hairlineOffset);
      ctx.quadraticCurveTo(g.cx + g.fw * 0.8, g.topY, g.cx + g.fw * 0.7, g.lipY + 20);
      ctx.lineTo(g.cx - g.fw * 0.7, g.lipY + 20);
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

function drawFaceContour(ctx: CanvasRenderingContext2D, l1: L1Skeleton, l2: L2SoftTissue, l4: L4Skin, g: FaceGeom) {
  ctx.save();
  ctx.fillStyle = SKIN[l4.skinTone] ?? '#D4B58A';

  // Face outline as a closed path
  // Start at top-left, go clockwise
  ctx.beginPath();
  ctx.moveTo(g.cx - g.fw * 0.2, g.topY + 10);
  // Top (cranium shape)
  ctx.bezierCurveTo(
    g.cx - g.fw * 0.55, g.topY - 5,
    g.cx - g.fw * 0.55, g.topY + 35,
    g.cx - g.fw * 0.5, g.eyeY - 30
  );
  // Cheek
  ctx.bezierCurveTo(
    g.cx - g.cheekX + g.cx, g.eyeY - 5,
    g.cx - g.cheekX + g.cx + 5, g.eyeY + 50,
    g.cx - g.jawX + g.cx, g.lipY + 30
  );
  // Jaw to chin
  ctx.bezierCurveTo(
    g.cx - g.jawX + g.cx + 5, g.lipY + 80,
    g.cx - 50, g.chinY - 10,
    g.cx - g.chinX, g.chinY
  );
  // Chin to right side (mirror)
  ctx.bezierCurveTo(
    g.cx + 50, g.chinY - 10,
    g.cx + g.jawX - g.cx - 5, g.lipY + 80,
    g.cx + g.jawX - g.cx, g.lipY + 30
  );
  // Right cheek
  ctx.bezierCurveTo(
    g.cx + g.cheekX - g.cx - 5, g.eyeY + 50,
    g.cx + g.cheekX - g.cx, g.eyeY - 5,
    g.cx + g.fw * 0.5, g.eyeY - 30
  );
  // Right top
  ctx.bezierCurveTo(
    g.cx + g.fw * 0.55, g.topY + 35,
    g.cx + g.fw * 0.55, g.topY - 5,
    g.cx + g.fw * 0.2, g.topY + 10
  );
  ctx.closePath();
  ctx.fill();

  // Skin texture overlay
  if (l4.skinTexture === 'matte' || l4.skinTexture === 'rough') {
    ctx.fillStyle = 'rgba(14, 14, 15, 0.06)';
    ctx.fill();
  } else if (l4.skinTexture === 'smooth' || l4.skinTexture === 'oily') {
    // Highlight on forehead + cheek
    const grad = ctx.createRadialGradient(g.cx, g.eyeY - 30, 10, g.cx, g.eyeY - 30, 80);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  ctx.restore();
}

function drawBrowRidge(ctx: CanvasRenderingContext2D, l2: L2SoftTissue, g: FaceGeom) {
  // High brow ridge = subtle shadow under brow
  if (l2.browRidge < 0.4) return;
  ctx.save();
  ctx.fillStyle = `rgba(14, 14, 15, ${0.05 + l2.browRidge * 0.15})`;
  ctx.beginPath();
  ctx.moveTo(g.cx - g.fw * 0.3, g.browRidgeY);
  ctx.quadraticCurveTo(g.cx, g.browRidgeY + 12, g.cx + g.fw * 0.3, g.browRidgeY);
  ctx.quadraticCurveTo(g.cx, g.browRidgeY - 5, g.cx - g.fw * 0.3, g.browRidgeY);
  ctx.fill();
  ctx.restore();
}

function drawBrows(ctx: CanvasRenderingContext2D, l3: L3Features, l5: L5Hair, g: FaceGeom) {
  ctx.save();
  const browColor = l5.browColor === 'same_as_hair'
    ? (HAIR_COLOR[l5.hairColor] ?? INK)
    : (HAIR_COLOR[l5.browColor] ?? INK);
  ctx.strokeStyle = browColor;
  ctx.lineWidth = 1 + l5.browDensity * 4;
  ctx.lineCap = 'round';

  const eyeOffset = 30 + l3.eyeDistance * 20;
  const browY = g.browY;

  // Left brow
  drawBrowPath(ctx, l5.browShape, g.cx - eyeOffset, browY, 1);
  // Right brow
  drawBrowPath(ctx, l5.browShape, g.cx + eyeOffset, browY, -1);

  ctx.restore();
}

function drawBrowPath(ctx: CanvasRenderingContext2D, shape: string, cx: number, y: number, dir: number) {
  ctx.beginPath();
  switch (shape) {
    case 'straight':
      ctx.moveTo(cx - 25 * dir, y);
      ctx.lineTo(cx + 25 * dir, y);
      break;
    case 'arched':
      ctx.moveTo(cx - 25 * dir, y + 3);
      ctx.quadraticCurveTo(cx, y - 8, cx + 25 * dir, y + 2);
      break;
    case 'upward':
      ctx.moveTo(cx - 25 * dir, y + 5);
      ctx.quadraticCurveTo(cx, y - 3, cx + 25 * dir, y - 5);
      break;
    case 'downward':
      ctx.moveTo(cx - 25 * dir, y - 5);
      ctx.quadraticCurveTo(cx, y + 3, cx + 25 * dir, y + 5);
      break;
    case 'thick':
      ctx.moveTo(cx - 28 * dir, y);
      ctx.lineTo(cx + 28 * dir, y);
      break;
    case 'thin':
      ctx.moveTo(cx - 22 * dir, y);
      ctx.lineTo(cx + 22 * dir, y);
      break;
  }
  ctx.stroke();
}

function drawEyes(ctx: CanvasRenderingContext2D, l2: L2SoftTissue, l3: L3Features, g: FaceGeom) {
  ctx.save();
  const eyeOffset = 30 + l3.eyeDistance * 20;
  const eyeW = 22 + l3.eyeApertureHeight * 8;
  const eyeH = 8 + l3.eyeApertureHeight * 12;

  // Eye socket shadow (depth)
  if (l2.eyeSocketDepth > 0.3) {
    ctx.fillStyle = `rgba(14, 14, 15, ${l2.eyeSocketDepth * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(g.cx - eyeOffset, g.eyeY - 10, eyeW + 4, eyeH + 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(g.cx + eyeOffset, g.eyeY - 10, eyeW + 4, eyeH + 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eye whites
  ctx.fillStyle = '#FAFAF6';
  drawEyeShape(ctx, g.cx - eyeOffset, g.eyeY, eyeW, eyeH, l3.eyeShape, 1);
  drawEyeShape(ctx, g.cx + eyeOffset, g.eyeY, eyeW, eyeH, l3.eyeShape, -1);

  // Iris
  ctx.fillStyle = '#5A4530';
  ctx.beginPath();
  ctx.arc(g.cx - eyeOffset, g.eyeY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(g.cx + eyeOffset, g.eyeY, 7, 0, Math.PI * 2);
  ctx.fill();

  // Pupil
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(g.cx - eyeOffset, g.eyeY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(g.cx + eyeOffset, g.eyeY, 3, 0, Math.PI * 2);
  ctx.fill();

  // Eyelid line (eyeShape-dependent)
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  drawEyelid(ctx, g.cx - eyeOffset, g.eyeY, eyeW, l3.eyeShape, 1);
  drawEyelid(ctx, g.cx + eyeOffset, g.eyeY, eyeW, l3.eyeShape, -1);

  ctx.restore();
}

function drawEyeShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, shape: string, dir: number) {
  ctx.beginPath();
  switch (shape) {
    case 'round':
      ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
      break;
    case 'narrow':
      ctx.ellipse(cx, cy, w * 1.2, h * 0.5, 0, 0, Math.PI * 2);
      break;
    case 'phoenix':
      // Upturned at outer corner
      ctx.moveTo(cx - w * dir, cy + h * 0.2);
      ctx.quadraticCurveTo(cx, cy - h * 0.8, cx + w * 1.3 * dir, cy - h * 0.3 * dir);
      ctx.quadraticCurveTo(cx + w * 0.5 * dir, cy + h * 0.3, cx - w * dir, cy + h * 0.2);
      break;
    case 'single':
      ctx.ellipse(cx, cy, w, h * 0.7, 0, 0, Math.PI * 2);
      break;
    case 'double':
    case 'inner':
    default:
      ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
      break;
  }
  ctx.fill();
}

function drawEyelid(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, shape: string, dir: number) {
  ctx.beginPath();
  switch (shape) {
    case 'single':
    case 'inner':
      // Smooth single line
      ctx.moveTo(cx - w * dir, cy);
      ctx.quadraticCurveTo(cx, cy - 5, cx + w * dir, cy);
      break;
    case 'double':
      // Visible crease
      ctx.moveTo(cx - w * dir, cy);
      ctx.quadraticCurveTo(cx, cy - 5, cx + w * dir, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.6 * dir, cy - 4);
      ctx.quadraticCurveTo(cx, cy - 8, cx + w * 0.6 * dir, cy - 4);
      ctx.stroke();
      return;
    case 'phoenix':
      ctx.moveTo(cx - w * dir, cy + 3);
      ctx.quadraticCurveTo(cx, cy - 5, cx + w * 1.3 * dir, cy - 4 * dir);
      break;
    default:
      ctx.moveTo(cx - w * dir, cy);
      ctx.quadraticCurveTo(cx, cy - 5, cx + w * dir, cy);
  }
  ctx.stroke();
}

function drawNose(ctx: CanvasRenderingContext2D, l3: L3Features, g: FaceGeom) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';

  const noseW = 8 + l3.noseWidth * 30;
  const noseTop = g.eyeY + 15;
  const noseBot = g.noseY;
  const noseCx = g.cx;

  // Nose bridge (high = inner line)
  if (l3.noseBridge === 'high') {
    ctx.beginPath();
    ctx.moveTo(noseCx - 2, noseTop);
    ctx.lineTo(noseCx - 3, noseBot - 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(noseCx + 2, noseTop);
    ctx.lineTo(noseCx + 3, noseBot - 10);
    ctx.stroke();
  }

  // Nose tip triangle
  ctx.beginPath();
  ctx.moveTo(noseCx - noseW / 2, noseBot - 12);
  ctx.quadraticCurveTo(noseCx, noseBot + 3, noseCx + noseW / 2, noseBot - 12);
  ctx.stroke();

  // Nostrils
  ctx.fillStyle = `rgba(14, 14, 15, 0.3)`;
  ctx.beginPath();
  ctx.ellipse(noseCx - noseW / 3, noseBot - 4, 4, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(noseCx + noseW / 3, noseBot - 4, 4, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawLips(ctx: CanvasRenderingContext2D, l3: L3Features, l6: L6Decoration, g: FaceGeom) {
  ctx.save();
  const lipW = 30 + l3.lipWidth * 50;
  const lipH = 4 + l3.lipThickness * 10;

  ctx.fillStyle = LIP_COLOR[l6.lipColor] ?? '#C46A6A';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;

  // Upper lip (M shape)
  ctx.beginPath();
  ctx.moveTo(g.cx - lipW / 2, g.lipY);
  ctx.quadraticCurveTo(g.cx - lipW / 3, g.lipY - lipH * 0.6, g.cx - lipW / 6, g.lipY - lipH * 0.3);
  ctx.quadraticCurveTo(g.cx - lipW / 12, g.lipY - lipH * 0.7, g.cx, g.lipY - lipH * 0.4);
  ctx.quadraticCurveTo(g.cx + lipW / 12, g.lipY - lipH * 0.7, g.cx + lipW / 6, g.lipY - lipH * 0.3);
  ctx.quadraticCurveTo(g.cx + lipW / 3, g.lipY - lipH * 0.6, g.cx + lipW / 2, g.lipY);
  ctx.quadraticCurveTo(g.cx, g.lipY - lipH * 0.1, g.cx - lipW / 2, g.lipY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Lower lip
  ctx.beginPath();
  ctx.moveTo(g.cx - lipW / 2, g.lipY);
  ctx.quadraticCurveTo(g.cx, g.lipY + lipH, g.cx + lipW / 2, g.lipY);
  ctx.quadraticCurveTo(g.cx, g.lipY + lipH * 0.2, g.cx - lipW / 2, g.lipY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawSoftTissueShading(ctx: CanvasRenderingContext2D, l1: L1Skeleton, l2: L2SoftTissue, g: FaceGeom) {
  ctx.save();

  // Cheekbone prominence shadow
  if (l1.cheekboneProminence > 0.2) {
    ctx.fillStyle = `rgba(14, 14, 15, ${l1.cheekboneProminence * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(g.cx - g.cheekX + g.cx * 0.7, g.eyeY + 30, 30, 18, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(g.cx + g.cheekX - g.cx * 0.7, g.eyeY + 30, 30, 18, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Buccal fat highlight (apple cheek)
  if (l2.buccalFat > 0.3) {
    const grad = ctx.createRadialGradient(
      g.cx - g.fw * 0.25, g.lipY - 10, 5,
      g.cx - g.fw * 0.25, g.lipY - 10, 25
    );
    grad.addColorStop(0, `rgba(255, 240, 220, ${l2.buccalFat * 0.15})`);
    grad.addColorStop(1, 'rgba(255, 240, 220, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(g.cx - g.fw * 0.25, g.lipY - 10, 25, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(g.cx + g.fw * 0.25, g.lipY - 10, 25, 0, Math.PI * 2);
    const grad2 = ctx.createRadialGradient(
      g.cx + g.fw * 0.25, g.lipY - 10, 5,
      g.cx + g.fw * 0.25, g.lipY - 10, 25
    );
    grad2.addColorStop(0, `rgba(255, 240, 220, ${l2.buccalFat * 0.15})`);
    grad2.addColorStop(1, 'rgba(255, 240, 220, 0)');
    ctx.fillStyle = grad2;
    ctx.fill();
  }

  // Nasolabial fold (faint lines)
  if (l2.nasolabialFold > 0.15) {
    ctx.strokeStyle = `rgba(14, 14, 15, ${l2.nasolabialFold * 0.25})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g.cx - g.fw * 0.25, g.noseY + 5);
    ctx.quadraticCurveTo(g.cx - g.fw * 0.28, g.lipY - 5, g.cx - g.fw * 0.3, g.lipY + 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(g.cx + g.fw * 0.25, g.noseY + 5);
    ctx.quadraticCurveTo(g.cx + g.fw * 0.28, g.lipY - 5, g.cx + g.fw * 0.3, g.lipY + 3);
    ctx.stroke();
  }

  ctx.restore();
}

function drawGenderFeatures(ctx: CanvasRenderingContext2D, g: FaceGeom) {
  // Male-specific: Adam's apple hint (very subtle)
  if (g.isMale) {
    ctx.save();
    ctx.fillStyle = 'rgba(14, 14, 15, 0.12)';
    ctx.beginPath();
    ctx.ellipse(g.cx, g.chinY + 30, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawAccessory(ctx: CanvasRenderingContext2D, l3: L3Features, l5: L5Hair, l6: L6Decoration, g: FaceGeom) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.fillStyle = 'rgba(14, 14, 15, 0.1)';

  if (l6.accessory === 'glasses') {
    ctx.lineWidth = 1.5;
    const eyeOffset = 30 + l3.eyeDistance * 20;
    // Left lens
    ctx.beginPath();
    ctx.ellipse(g.cx - eyeOffset, g.eyeY, 26, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Right lens
    ctx.beginPath();
    ctx.ellipse(g.cx + eyeOffset, g.eyeY, 26, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Bridge
    ctx.beginPath();
    ctx.moveTo(g.cx - 5, g.eyeY);
    ctx.lineTo(g.cx + 5, g.eyeY);
    ctx.stroke();
  } else if (l6.accessory === 'earrings') {
    ctx.fillStyle = '#D4B872';
    ctx.beginPath();
    ctx.arc(g.cx - g.fw * 0.55, g.eyeY + 40, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(g.cx + g.fw * 0.55, g.eyeY + 40, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (l6.accessory === 'headband') {
    ctx.strokeStyle = HAIR_COLOR[l5.hairColor] ?? INK;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(g.cx - g.fw * 0.55, g.browY - 20);
    ctx.quadraticCurveTo(g.cx, g.browY - 35, g.cx + g.fw * 0.55, g.browY - 20);
    ctx.stroke();
  } else if (l6.accessory === 'mask') {
    ctx.fillStyle = 'rgba(200, 200, 210, 0.7)';
    ctx.beginPath();
    ctx.moveTo(g.cx - g.fw * 0.4, g.noseY - 10);
    ctx.quadraticCurveTo(g.cx, g.noseY + 50, g.cx + g.fw * 0.4, g.noseY - 10);
    ctx.quadraticCurveTo(g.cx + g.fw * 0.45, g.lipY + 20, g.cx, g.lipY + 25);
    ctx.quadraticCurveTo(g.cx - g.fw * 0.45, g.lipY + 20, g.cx - g.fw * 0.4, g.noseY - 10);
    ctx.fill();
  }

  ctx.restore();
}

// ===================== 主渲染函数 =====================

function render() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const _l1 = l1.value;
  const _l2 = l2.value;
  const _l3 = l3.value;
  const _l4 = l4.value;
  const _l5 = l5.value;
  const _l6 = l6.value;

  const g = computeGeom(_l1, _l3);

  drawBackground(ctx);
  drawHair(ctx, _l5, g);
  drawFaceContour(ctx, _l1, _l2, _l4, g);
  drawSoftTissueShading(ctx, _l1, _l2, g);
  drawBrowRidge(ctx, _l2, g);
  drawBrows(ctx, _l3, _l5, g);
  drawEyes(ctx, _l2, _l3, g);
  drawNose(ctx, _l3, g);
  drawLips(ctx, _l3, _l6, g);
  drawGenderFeatures(ctx, g);
  drawAccessory(ctx, _l3, _l5, _l6, g);

  // Export PNG dataURL
  dataURL.value = canvas.toDataURL('image/png');
}

// Watch all 6 layer refs
watch([l1, l2, l3, l4, l5, l6], render, { deep: true });
watch(() => props.showAnnotations, render);
onMounted(render);

defineExpose({
  toDataURL: () => dataURL.value,
});
</script>

<template>
  <div class="schematic-face inline-block border border-ink/15 rounded overflow-hidden bg-cream">
    <canvas
      ref="canvasRef"
      :width="W"
      :height="H"
      class="block max-w-full h-auto"
      :style="{ width: `${resolution}px` }"
    />
  </div>
</template>

<style scoped>
.schematic-face {
  background: var(--color-cream);
}
</style>