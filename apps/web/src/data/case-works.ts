/**
 * 案例集共用数据 — /cases 与 /promo 落地页共用, 避免两处各抄一份
 * 视频托管在 OSS public bucket `cases/` 前缀 (2026-07-24 从 luckynemo demo 迁移)
 * 新增案例: 传同前缀 mp4 + jpg 封面, 再在这里加一行
 */
import { ossUrl } from '@/api/client';

export interface CaseWork {
  src: string;
  title: string;
  meta: string;
  cat: '商业广告' | '剧情短片' | '动画';
}

export const CASE_WORKS: CaseWork[] = [
  { src: '03-golf-shoes',    title: '《一双舒服的鞋》', meta: '商业广告 · 横屏 0:34',   cat: '商业广告' },
  { src: '04-boss-shoes',    title: '《大佬带货》',     meta: '剧情带货 · 竖屏 1:29',   cat: '商业广告' },
  { src: '02-huaxing',       title: '《化形》',         meta: 'AI 真人玄幻剧 · 横屏 6:20', cat: '剧情短片' },
  { src: '05-mansion-night', title: '《深宅夜宴》',     meta: '古装剧情 · 横屏 0:56',   cat: '剧情短片' },
  { src: '07-jade-disc',     title: '《完璧归赵》',     meta: '历史短剧 · 竖屏 0:53',   cat: '剧情短片' },
  { src: '06-one-cart-bricks', title: '《一车砖》',     meta: '写实情感 · 4:3 画幅 1:19', cat: '剧情短片' },
  { src: '01-coffee-voyage', title: '《咖啡豆环游记》', meta: '3D 卡通 IP · 竖屏 1:06', cat: '动画' },
  { src: '08-elevator-home', title: '《回家的电梯》',   meta: '粘土动画 · 横屏 1:56',   cat: '动画' },
];

export function caseVideoUrl(src: string): string {
  return ossUrl(`cases/${src}.mp4`);
}

export function casePosterUrl(src: string): string {
  return ossUrl(`cases/${src}.jpg`);
}
