/**
 * RadarChart 纯函数库 — 不依赖 Vue / DOM
 * 抽出来便于单元测试,组件只做模板渲染
 */

export interface RadarScore {
  label: string;
  value: number; // 0~max
}

export interface RadarPoint {
  x: number;
  y: number;
  score: RadarScore;
}

export interface RadarLabelPos {
  x: number;
  y: number;
  score: RadarScore;
}

export interface RadarCircle {
  r: number;
  label: string;
}

/** 颜色编码: >= 7 绿, 4-7 黄棕, <4 红 */
export function scoreColor(avg: number): string {
  if (avg >= 7) return '#3f7d3f'; // 绿
  if (avg >= 4) return '#a87a2c'; // 黄棕
  return '#a83232'; // 红
}

export function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function computeAvgScore(scores: RadarScore[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b.value, 0) / scores.length;
}

/** 网格圈(3 圈等分) */
export function computeGridCircles(size: number, max: number): RadarCircle[] {
  const radius = (size / 2) * 0.65;
  return [0.33, 0.67, 1.0].map((f) => ({
    r: radius * f,
    label: (max * f).toFixed(1),
  }));
}

/** 3 个轴的端点(从中心到外) */
export function computeAxisEnds(size: number, scores: RadarScore[]): { x: number; y: number }[] {
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size / 2) * 0.65;
  const angleStep = (Math.PI * 2) / Math.max(1, scores.length);
  return scores.map((_, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

/** 数据点(归一化到 max) */
export function computeDataPoints(size: number, max: number, scores: RadarScore[]): RadarPoint[] {
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size / 2) * 0.65;
  const angleStep = (Math.PI * 2) / Math.max(1, scores.length);
  return scores.map((s, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const r = radius * Math.min(1, Math.max(0, s.value / max));
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), score: s };
  });
}

/** 多边形 path (闭合) */
export function computeDataPath(points: RadarPoint[]): string {
  if (points.length === 0) return '';
  return (
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ') + ' Z'
  );
}

/** 轴标签位置(比轴端再外推 22px) */
export function computeLabelPositions(size: number, scores: RadarScore[]): RadarLabelPos[] {
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size / 2) * 0.65 + 22;
  const angleStep = (Math.PI * 2) / Math.max(1, scores.length);
  return scores.map((s, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), score: s };
  });
}
