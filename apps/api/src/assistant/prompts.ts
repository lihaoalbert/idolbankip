/**
 * AI 助手 — 共享常量 + 老 system prompt 兼容入口
 *
 * W6-R1 拆分:
 *  - 老 CREATOR_SYSTEM_PROMPT / BUYER_SYSTEM_PROMPT 整体迁到 ./intent-prompts.ts
 *    (新 prompt 多了 intent + intentParams 输出 schema)
 *  - 本文件保留 OUT_OF_SCOPE_REPLY / CTA_WHITELIST / CTA_DYNAMIC_PATTERNS
 *    (这些是 W6 之前就在用的, 12 个老 FAQ 仍引用它们做 action 校验)
 *
 * 历史:
 *  - W2 #32 客服机器人 FAQ + 5 角色场景问答
 *  - W6-R1 Intent Router 重写 prompt, 允许 LLM 输出写操作意图
 */
export { CREATOR_SYSTEM_PROMPT, BUYER_SYSTEM_PROMPT } from './intent-prompts';

export const OUT_OF_SCOPE_REPLY =
  '这个请求超出 AI 助手当前能帮上忙的范围(助手只能做问答+指路,不能代替您操作)。' +
  '建议:1) 邮件 admin@ibi.ren  2) 紧急商务合作可走 /contact 留资。';

/**
 * CTA 白名单 — 助手的"建议操作"只能从这 13 项里选, 防止 LLM 自由编 URL 把用户带到错页面
 *
 * 静态: path 完全匹配
 * 动态: path 走正则(assistant.service 校验)
 *   - /checkout/:code     (IP code, e.g. IBI-2026-0001)
 *   - /orders/:id         (Order id, cuid 格式)
 *   - /ips/:code
 *   - /creator/ips/:id
 */
export const CTA_WHITELIST: ReadonlyArray<{ label: string; href: string }> = [
  { label: '去 KYC 提交', href: '/creator/onboard' },
  { label: '回捏者中心', href: '/creator' },
  { label: '去 IP 上传向导', href: '/creator/ips/new' },
  { label: '去任务板', href: '/creator/tasks' },
  { label: '管理 API Key', href: '/creator/api-keys' },
  { label: '查捏者手册', href: '/guide/creator' },
  { label: '去形象库', href: '/ips' },
  { label: '看我的订单', href: '/orders' },
  { label: '看我已下载的资产', href: '/my-assets' },
  { label: '联系商务', href: '/contact' },
  { label: '去个人设置', href: '/settings' },
  { label: '看通知', href: '/notifications' },
  { label: '去 AI 助手对话页', href: '/assistant' },
];

/** 动态路径正则 — 助手的 reply 中可以引用, service 端做白名单校验 */
export const CTA_DYNAMIC_PATTERNS: ReadonlyArray<RegExp> = [
  /^\/checkout\/[A-Za-z0-9_-]+$/,
  /^\/orders\/[A-Za-z0-9_-]+$/,
  /^\/ips\/[A-Za-z0-9_-]+$/,
  /^\/creator\/ips\/[A-Za-z0-9_-]+$/,
];