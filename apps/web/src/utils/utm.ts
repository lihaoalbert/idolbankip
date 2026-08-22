/**
 * UTM / 渠道追踪 — 投放落地页归因 (2026-08 需求端起量计划 P0)
 *
 * 规则:
 * - 首次带 utm 参数进入任意页面时写入 sessionStorage; 之后无参访问不覆盖
 * - 留资提交时 source 组装为 `<page>|<utm_source>|<utm_campaign>`, 无 utm 时 `<page>|direct`
 * - 轻量事件只累计到 sessionStorage + console.debug, 不外发 (后端暂无事件接口)
 */

export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
}

const UTM_KEY = 'ibi.utm';
const EVENT_KEY = 'ibi.events';
const MAX_EVENTS = 100;

/** 从当前 URL query 捕获 utm 参数; 已捕获过则跳过 (首次写入优先) */
export function captureUtm(search: string = window.location.search): void {
  try {
    const p = new URLSearchParams(search);
    const utm: UtmParams = {
      source: p.get('utm_source') || undefined,
      medium: p.get('utm_medium') || undefined,
      campaign: p.get('utm_campaign') || undefined,
    };
    if (!utm.source && !utm.medium && !utm.campaign) return;
    if (sessionStorage.getItem(UTM_KEY)) return;
    sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
  } catch {
    // sessionStorage 不可用 (隐私模式等) 时静默, 不影响页面功能
  }
}

export function getUtm(): UtmParams {
  try {
    const raw = sessionStorage.getItem(UTM_KEY);
    return raw ? (JSON.parse(raw) as UtmParams) : {};
  } catch {
    return {};
  }
}

/** 组装留资 source 字段, 如 `promo|douyin|launch-0829`; 无 utm 时 `promo|direct` */
export function buildLeadSource(page: string): string {
  const utm = getUtm();
  const parts = [page, utm.source, utm.campaign].filter(Boolean);
  // 后端 CreateLeadDto source 上限 64 字符, 截断防 400
  return (parts.length > 1 ? parts.join('|') : `${page}|direct`).slice(0, 64);
}

/** 轻量事件累计 — 落地页交互 (视频播放 / SKU CTA 点击等), 仅本地留存 + 控制台 */
export function trackEvent(name: string, payload: Record<string, unknown> = {}): void {
  console.debug('[track]', name, payload);
  try {
    const raw = sessionStorage.getItem(EVENT_KEY);
    const events: Array<Record<string, unknown>> = raw ? JSON.parse(raw) : [];
    events.push({ name, ...payload, at: Date.now() });
    sessionStorage.setItem(EVENT_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // 同上, 静默
  }
}
