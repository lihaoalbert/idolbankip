/**
 * R11.3 P2-1: 全站时间格式统一
 *
 * 三种用法:
 *   formatRelative('2026-07-14T08:00:00Z') → "3 小时前" / "2 天前" / "昨天" / "07-14"
 *   formatDeadline('2026-07-21T23:59:59Z') → "7月21日截止" / "今天截止" / "已过期"
 *   formatDateTime('2026-07-14T08:00:00Z') → "07-14 14:30" (zh-CN 紧凑)
 *
 * 替换原本三处混用:
 *   1. brief 列表用 ISO 字符串 (Date.prototype.toISOString)
 *   2. workspace 时间用美式 new Date(x).toLocaleString()
 *   3. orders 用 zh-CN 长格式
 */

const ZH_MONTHS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 距今多少秒 */
function secondsAgo(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 1000);
}

/**
 * 相对时间: < 60s → 刚刚; < 60min → N 分钟前; < 24h → N 小时前;
 * < 7d → N 天前; 否则月日
 */
export function formatRelative(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const diff = secondsAgo(d);
  if (diff < 0) {
    // 未来时间(发包截止等)
    if (diff > -3600) return `${Math.abs(Math.floor(diff / 60))} 分钟后`;
    if (diff > -86400) return `${Math.abs(Math.floor(diff / 3600))} 小时后`;
    return `${Math.abs(Math.floor(diff / 86400))} 天后`;
  }
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}-${String(day).padStart(2, '0')}`;
}

/**
 * 截止时间: 今天/明天/几天后/N 天后/已过期 → "今天截止" / "明天截止"
 * 否则 → "7月21日截止" / "已过期"
 */
export function formatDeadline(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((target - today0) / 86400000);
  if (days < 0) return '已过期';
  if (days === 0) return '今天截止';
  if (days === 1) return '明天截止';
  if (days <= 7) return `${days} 天后截止`;
  return `${ZH_MONTHS[d.getMonth()]}${d.getDate()}日截止`;
}

/**
 * 紧凑日期+时间: "07-14 14:30"
 */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${hh}:${mm}`;
}

/**
 * 中文长格式: "2026年7月14日 周二 14:30"
 * 用在订单详情、版权登记详情等需要正式日期的场合
 */
export function formatDateLong(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const wd = WEEKDAYS[d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${wd} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}