/**
 * ibi.ren · 占位图生成器 (无需外部资源)
 * 用 sharp 渲染 SVG → PNG,生成 600×600 缩略图 + 1024×1024 预览图
 *
 * 用法: ts-node scripts/lib/generate-placeholder-image.ts
 * 输出: seed-assets/{IBI-CODE}/thumb_600.jpg + preview_1024.jpg
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';

const SEED_DIR = path.resolve(__dirname, '../../seed-assets');
const TOTAL = Number(process.env.SEED_IMAGES_TOTAL || 100);

const PALETTE: Array<[string, string, string]> = [
  ['#F4E4D7', '#C8A36B', '#3D2C1E'], // 暖米 + 金 + 棕
  ['#E5E1DA', '#7A6E5C', '#1A1A1A'], // 冷灰
  ['#FFE4E1', '#C73E3A', '#3D0F0F'], // 樱粉 + 朱
  ['#E0E5E8', '#5A6E7A', '#0F1A24'], // 雾蓝
  ['#F2EAD3', '#D08C2B', '#4A2E0A'], // 麦黄
  ['#EDE4F0', '#6B4E8C', '#1A0F2E'], // 紫藤
  ['#D9EAD3', '#4A7A3A', '#0F2410'], // 竹青
  ['#1A1A1A', '#C8A36B', '#F4E4D7'], // 黑 + 金
];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function makeSvg(code: string, name: string, style: string, size: 600 | 1024): string {
  const [bg, accent, ink] = pick(PALETTE);
  const isLarge = size === 1024;
  const fontSize = isLarge ? 64 : 38;
  const smallFontSize = isLarge ? 28 : 18;
  const stripeWidth = isLarge ? 8 : 4;
  const codeSize = isLarge ? 36 : 22;
  const watermarkSize = isLarge ? 22 : 14;
  const lineSpacing = isLarge ? 90 : 56;
  const startY = isLarge ? 360 : 220;

  // 简笔人物剪影 (抽象头肩像)
  const silhouette = `
    <ellipse cx="${size/2}" cy="${size*0.32}" rx="${size*0.13}" ry="${size*0.16}" fill="${ink}" opacity="0.85"/>
    <path d="M ${size*0.30} ${size*0.85} Q ${size/2} ${size*0.50} ${size*0.70} ${size*0.85} Z" fill="${ink}" opacity="0.85"/>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0.3"/>
      </linearGradient>
      <pattern id="dotgrid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="20" cy="20" r="1" fill="${ink}" opacity="0.06"/>
      </pattern>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#g)"/>
    <rect width="${size}" height="${size}" fill="url(#dotgrid)"/>

    <!-- 左侧金条 -->
    <rect x="0" y="0" width="${stripeWidth}" height="${size}" fill="${accent}"/>
    <rect x="${size-stripeWidth}" y="0" width="${stripeWidth}" height="${size}" fill="${accent}"/>

    <!-- 头部轮廓 -->
    ${silhouette}

    <!-- 名字 -->
    <text x="${size/2}" y="${startY}" text-anchor="middle" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-weight="600" font-size="${fontSize}" fill="${ink}">${name}</text>
    <text x="${size/2}" y="${startY+lineSpacing*0.6}" text-anchor="middle" font-family="sans-serif" font-size="${smallFontSize}" fill="${ink}" opacity="0.6">${style}</text>

    <!-- 编号 -->
    <text x="${size/2}" y="${size-50}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="${codeSize}" fill="${ink}" opacity="0.4">${code}</text>

    <!-- 平台水印 -->
    <g transform="translate(${size/2}, ${size/2 + size*0.18}) rotate(-30)">
      <text text-anchor="middle" font-family="sans-serif" font-size="${watermarkSize*3}" fill="${ink}" opacity="0.05" letter-spacing="${size/40}">IBI.REN</text>
    </g>
  </svg>`;
}

async function renderForCode(code: string, name: string, style: string) {
  const dir = path.join(SEED_DIR, code);
  await fs.mkdir(dir, { recursive: true });

  const thumbSvg = makeSvg(code, name, style, 600);
  await sharp(Buffer.from(thumbSvg))
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(path.join(dir, 'thumb_600.jpg'));

  const previewSvg = makeSvg(code, name, style, 1024);
  await sharp(Buffer.from(previewSvg))
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(dir, 'preview_1024.jpg'));
}

const FIRST_NAMES = ['林', '苏', '陈', '白', '叶', '顾', '沈', '宋', '秦', '萧'];
const GIVEN_NAMES = ['知夏', '暮云', '清越', '晚吟', '寻真', '若笙', '怀瑾', '念安', '唯心', '听雪'];
const STYLES = ['现代', '古风', '赛博', '二次元', '民国', '未来', '复古', '日式', '韩系', '北欧'];

async function main() {
  console.log(`🎨 生成 ${TOTAL} 个 IP 的占位图 (600x600 + 1024x1024)…`);
  for (let i = 1; i <= TOTAL; i++) {
    const code = `IBI-2026-${String(i).padStart(4, '0')}`;
    const name = `${pick(FIRST_NAMES)}${pick(GIVEN_NAMES)}`;
    const style = pick(STYLES);
    await renderForCode(code, name, style);
    if (i % 10 === 0) console.log(`   ⏳ ${i}/${TOTAL}`);
  }
  console.log(`\n✅ 完成,输出至 ${SEED_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
