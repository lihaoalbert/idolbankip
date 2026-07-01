/**
 * AI 助手 FAQ 知识库 — 关键词命中直达
 *
 * 用途: 在调 LLM 之前先扫一遍, 命中 → 直接返回 (省 token + 更快 + 可审计)
 * 没命中 → 走原 LLM 流程
 *
 * 设计要点:
 *  1. 关键词不区分大小写, 按出现次数计分
 *  2. 至少命中 2 个关键词 (短词) 或 1 个 ≥ 4 字关键词, 才算命中
 *  3. 同分按数组顺序 (前面的优先级高), 避免被边缘 FAQ 抢答
 *  4. audience 字段限定 ('buyer' / 'creator' / 'both'), 命中时按当前用户角色过滤
 *  5. actions.href 必须是 CTA_WHITELIST / CTA_DYNAMIC_PATTERNS 之一, 否则丢弃
 *
 * W2 #32 客服机器人 FAQ 知识库
 * 维护人: ibi.ren 平台运营
 * 当前条目: 15 (Top-15 高频问题)
 */

import { SuggestedAction } from './assistant.service';

export type FaqAudience = 'buyer' | 'creator' | 'both';

export interface FaqEntry {
  id: string;
  /** 关键词 — 任一命中计 1 分, 越长权重越高 */
  keywords: string[];
  /** 角色限定 — 只在指定角色下生效 */
  audience: FaqAudience;
  /** 回答正文 — 中文, 短句, 4~8 句最佳 */
  answer: string;
  /** 建议动作 — href 必须在 prompts.ts 的 CTA 白名单内 */
  actions: SuggestedAction[];
}

// =============================================================
// 15 条 FAQ — 按优先级排序 (前面的覆盖后面的)
// =============================================================

export const FAQ: ReadonlyArray<FaqEntry> = [
  // ---- 创作者侧 ----
  {
    id: 'creator-kyc',
    audience: 'creator',
    keywords: ['kyc', '实名', '认证', '审核', '被拒', '驳回', '材料', '补料', '身份证'],
    answer:
      'KYC 是创作者入驻必过的实名审核, 提交后一般 1-3 个工作日完成。\n' +
      '● 通过: 站内 + 邮件通知, 自动解锁"上传 IP"和"接单"权限\n' +
      '● 被拒: 通知里会写明原因 (证件模糊/资料不全/法人不一致), 补料后重新提交即可\n' +
      '● 进度查询: 走"通知"页面或重新进 KYC 页面看状态\n' +
      '不会判定能不能过 — KYC 由平台人工审核, 助手只能解读通知和补料清单。',
    actions: [
      { label: '去 KYC 提交', href: '/creator/onboard' },
      { label: '看通知', href: '/notifications' },
    ],
  },
  {
    id: 'creator-ip-upload',
    audience: 'creator',
    keywords: ['上传', 'ip', '资产', '资产包', '图片', 'wizard', '向导', '3d', '形象', '捏脸'],
    answer:
      '上传 IP 走 3 步向导 (/creator/ips/new):\n' +
      '● 第 1 步 — 选档位: 数字人广告 / 短视频 / 3D 数字人 等\n' +
      '● 第 2 步 — 资产包: 每类至少 5 张关键角度 (正/侧/背/仰/俯) + 1 段 15s 演示\n' +
      '● 第 3 步 — 元数据: 风格标签 + 授权价区间 (平台会建议)\n' +
      '完成后进"审核中", 通过后自动上架 + 区块链存证 + 同步推送给买家。',
    actions: [
      { label: '去 IP 上传向导', href: '/creator/ips/new' },
      { label: '查捏者手册', href: '/guide/creator' },
    ],
  },
  {
    id: 'creator-bid',
    audience: 'creator',
    keywords: ['投标', '报价', '接单', '任务包', 'brief', '抢单', '出价'],
    answer:
      '接单流程:\n' +
      '● 进 /creator/tasks 看任务包列表, 按"风格匹配"过滤\n' +
      '● 点开某条 → 看到预算区间 + 当前价 + 截止倒计时\n' +
      '● 点"我要投标" → 填报价 / 交付天数 / 提案 → 提交\n' +
      '● 买家选中你后 → 自动生成 workspace, 进入交付流程\n' +
      '撤回: 在详情页底部"撤回报价"即可, 撤回后可重新报。',
    actions: [
      { label: '去任务板', href: '/creator/tasks' },
      { label: '查捏者手册', href: '/guide/creator' },
    ],
  },
  {
    id: 'creator-api-key',
    audience: 'creator',
    keywords: ['api', 'key', '密钥', 'api-key', 'apikey', '泄露', '轮换'],
    answer:
      'API Key 是你用 SDK / CLI 调 ibi.ren 的凭证。\n' +
      '● 创建: /creator/api-keys → "新建" → 选权限 (read / write) → 复制保存 (关弹窗就再也看不到完整 key)\n' +
      '● 误删/泄露: 立刻在同页面点"作废", 然后建新的。平台无 key 明文, 无法恢复, 只能重发\n' +
      '● 用法: SDK 鉴权头 Authorization: Bearer <key>, 限频 60 次/分钟/key\n' +
      '轮换建议: 每 90 天换一次, 或成员离职时立即作废旧 key。',
    actions: [
      { label: '管理 API Key', href: '/creator/api-keys' },
    ],
  },
  {
    id: 'creator-credit',
    audience: 'creator',
    keywords: ['信用分', '信誉', '评分', '等级', '徽章'],
    answer:
      '信用分是平台基于交付历史 / 买家评价 / 响应速度 综合算的, 0~100 分。\n' +
      '● 等级: S(≥90) / A(≥75) / B(≥60) / C(<60)\n' +
      '● 影响因素: 按时交付 +10, 提前 +5, 延期 -3, 客诉属实 -15, 主动撤单 -1\n' +
      '● 显示位置: 创作者主页 + 任务包投标页\n' +
      '● 提升: 多接高溢价任务 + 按时交付 + 主动沟通, 1-2 个月可见显著变化。',
    actions: [
      { label: '回捏者中心', href: '/creator' },
    ],
  },
  {
    id: 'creator-copyright',
    audience: 'creator',
    keywords: ['版权', '著作权', '代申请', '登记', '代办'],
    answer:
      '著作权代申请是平台对接中国版权保护中心的代办服务, 创作者只需提交材料, 平台拼 PDF 提交包。\n' +
      '● 流程: 在 /creator/ips 选 IP → "申请著作权" → 填作品说明 → 付代办费 → 平台提交\n' +
      '● 时长: 受理 1-2 个月, 登记证书下来后会同步存证\n' +
      '● 归属: 著作权登记在**创作者名下** (平台只收代办费, 不持有版权)\n' +
      '● 状态查询: /notifications 会有 5 个状态推送 (草稿/已提交/受理/登记成功/驳回)。',
    actions: [
      { label: '回捏者中心', href: '/creator' },
      { label: '看通知', href: '/notifications' },
    ],
  },

  // ---- 买家侧 ----
  {
    id: 'buyer-tiers',
    audience: 'buyer',
    keywords: ['档位', '阶梯', '授权', '广告', '短剧', '独家', '买断', '套餐', '价格', '多少钱', '费用'],
    answer:
      'ibi.ren 的 IP 授权分 4 档 (从便宜到贵):\n' +
      '● SINGLE_AD — 单条广告片授权, 不可二次分发\n' +
      '● SINGLE_DRAMA — 单部短剧/微电影授权\n' +
      '● THREE_YEAR_WEB — 3 年内全网使用 (含海外)\n' +
      '● BUYOUT_EXCLUSIVE — 买断 + 独家, IP 不再对其他买家开放\n' +
      '具体价以 IP 详情页为准, 助手不报数字 (避免误差)。',
    actions: [
      { label: '去形象库', href: '/ips' },
      { label: '联系商务', href: '/contact' },
    ],
  },
  {
    id: 'buyer-order-status',
    audience: 'buyer',
    keywords: ['订单', '状态', '卡住', '下一步', '待付款', '已付款', '合同', '下载'],
    answer:
      '订单状态机 (从早到晚):\n' +
      'CREATED → PAID → CONTRACT_PENDING → CONTRACT_SIGNED → DELIVERED → COMPLETED\n' +
      '● 卡 CREATED: 付款未完成, 重新进 /orders/<id> 完成支付\n' +
      '● 卡 CONTRACT_PENDING: 合同 PDF 已生成未签, 进去签字\n' +
      '● 卡 DELIVERED: 创作者已交付, 你点"验收"或"异议"\n' +
      '更细的状态说明在 /orders/<id> 页面顶部。',
    actions: [
      { label: '看我的订单', href: '/orders' },
    ],
  },
  {
    id: 'buyer-download',
    audience: 'buyer',
    keywords: ['下载', '水印', '失败', '资产', '用不了'],
    answer:
      '下载失败排错:\n' +
      '● 0 个文件: 还没到 DELIVERED 状态, 等创作者上传\n' +
      '● 文件缺失某角度: 进 /orders/<id> 提"补料", 创作者会重传\n' +
      '● 水印误用: 用 SDK (Creator 给我们 cli) 跑去水印, 或联系商务\n' +
      '● 链接 403: 链接 24h 过期, 重新进 /orders/<id> 点"重新生成下载链接"\n' +
      '排查 5 分钟没解决 → /contact 留资, 平台技术跟进。',
    actions: [
      { label: '看我已下载的资产', href: '/my-assets' },
      { label: '联系商务', href: '/contact' },
    ],
  },
  {
    id: 'buyer-brief',
    audience: 'buyer',
    keywords: ['发包', '发需求', 'brief', '招人', '招创作者', '定制'],
    answer:
      '发包 4 步 (/buyer/brief/new):\n' +
      '● 1. 选品类 + 投放平台 + 截止时间\n' +
      '● 2. AI 拆解 (可选) — 点"AI 帮我写"自动生成 Brief, 你审核修改\n' +
      '● 3. 填预算区间 + 关联 IP (可不选)\n' +
      '● 4. 发布 → 进 bidding 状态, 创作者开始投标\n' +
      '加价: 发布后最多 3 次, 每次 +10~50%, 总价超菜单价 2x 需二次确认。\n' +
      '过期: 截止时间没人接 → 系统自动 close + 通知你。',
    actions: [
      { label: '看我的订单', href: '/orders' },
    ],
  },

  // ---- 通用 (both) ----
  {
    id: 'common-payment',
    audience: 'both',
    keywords: ['支付', '充值', '付款', '微信', '支付宝', '数字人民币', '开发票', '发票', '对公'],
    answer:
      '当前支付通道 (W7 上线):\n' +
      '● 微信支付 + 支付宝 (个人)\n' +
      '● 对公转账 / 数字人民币 (企业, 走 /contact 留资由商务对接)\n' +
      '● 开发票: 订单完成后, 在 /orders/<id> 申请, 1-3 工作日开\n' +
      '财务对账: 平台 T+1 自动出对账日报, 不需要用户操作。\n' +
      '具体接入时间表以官网公告为准。',
    actions: [
      { label: '看我的订单', href: '/orders' },
      { label: '联系商务', href: '/contact' },
    ],
  },
  {
    id: 'common-refund',
    audience: 'both',
    keywords: ['退款', '退钱', '退订', '不做了', '撤单', '取消', '怎么退', '退订'],
    answer:
      '退款规则 (按订单状态):\n' +
      '● CREATED (未付款): 无需退款, 直接关闭订单\n' +
      '● PAID ~ CONTRACT_PENDING: 扣 5% 手续费后退, 1-3 工作日到账\n' +
      '● CONTRACT_SIGNED 之后: 不退, 走争议流程 (/disputes, W7 上线)\n' +
      '● 创作者接单前 (bidding 中): 买家可手动 close, 已付款全额退\n' +
      '争议处理: 平台仲裁 / 协商分成 / 全额退款 三选一, 走 /contact 留资发起。',
    actions: [
      { label: '看我的订单', href: '/orders' },
      { label: '联系商务', href: '/contact' },
    ],
  },
  {
    id: 'common-data',
    audience: 'both',
    keywords: ['隐私', '数据', '安全', '个人信息', '合规', '等保'],
    answer:
      '数据安全:\n' +
      '● 等保三级备案中 (Q3 完成)\n' +
      '● 个人信息: 仅用于订单交付, 不卖第三方, 不用于模型训练 (创作者明确勾选同意的素材除外)\n' +
      '● 备份: 数据库 T+1 全量备份 + binlog 实时同步, RPO < 5 分钟\n' +
      '● 跨境: 仅邮件 / 微信模板消息走阿里云, 其他数据都在国内\n' +
      '详细见 /legal/privacy (草稿) 或 /contact 索取正式版。',
    actions: [
      { label: '去个人设置', href: '/settings' },
    ],
  },
  {
    id: 'common-contact',
    audience: 'both',
    keywords: ['客服', '人工', '联系', '电话', '工单', '找谁', '怎么办'],
    answer:
      '找人工客服 3 个通道:\n' +
      '● 站内: /contact 留资表单 (24h 内回)\n' +
      '● 邮件: admin@ibi.ren (商务 + 法务)\n' +
      '● 紧急: 创作者卡死 / 买家订单卡付款 → 走 /contact 选"紧急", 平台 4h 内回\n' +
      '客服机器人能答的会直接答, 答不了的会自动转人工, 不需要重复描述问题。',
    actions: [
      { label: '联系商务', href: '/contact' },
    ],
  },
];

// =============================================================
// 匹配器
// =============================================================

interface MatchResult {
  entry: FaqEntry;
  score: number;
}

/**
 * 分词: 中文连续字串 + 英文/数字串 — 例: "KYC 被退" → ["kyc", "被退"]
 * "下单失败" → ["下单失败"]
 * "档位怎么选" → ["档位怎么选"]
 */
function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[一-龥]+|[a-z0-9]+/g) ?? []);
}

/**
 * 命中规则:
 *  - 关键词长度 ≥ 3:
 *      - 完全等于 token       → +3 (整词命中, 强)
 *      - 是某个 token 子串    → +2 (e.g. kw="退款", token="退款流程")
 *      - 是整段文本子串       → +1 (跨词匹配, 弱)
 *  - 关键词长度 2:
 *      - 完全等于 token / 子串 → +2 (中)
 *  - 关键词长度 1: 不参与匹配 (太易误伤)
 *  - 阈值: ≥ 2 分命中
 *  - audience 不匹配 → 跳过
 *
 * 单关键词命中(2~3 字)在短问句里很常见 (e.g. "档位怎么选"), 不能误拒
 */
function scoreEntry(entry: FaqEntry, tokens: string[], fullText: string): number {
  let score = 0;
  for (const kw of entry.keywords) {
    const k = kw.toLowerCase();
    if (!k || k.length < 2) continue;

    if (tokens.includes(k)) {
      score += k.length >= 3 ? 3 : 2;
      continue;
    }
    if (tokens.some((t) => t.includes(k))) {
      score += k.length >= 3 ? 2 : 1;
      continue;
    }
    if (fullText.includes(k)) {
      score += 1;
    }
  }
  return score;
}

/**
 * 在 FAQ 中查找最佳匹配, 返回 null 表示没命中 → 走 LLM
 */
export function matchFaq(
  message: string,
  audience: 'buyer' | 'creator',
): { entry: FaqEntry; score: number } | null {
  const fullText = message.toLowerCase();
  const tokens = tokenize(message);

  let best: MatchResult | null = null;
  for (const entry of FAQ) {
    if (entry.audience !== 'both' && entry.audience !== audience) continue;
    const s = scoreEntry(entry, tokens, fullText);
    if (s < 1) continue;
    if (!best || s > best.score) {
      best = { entry, score: s };
    }
  }
  return best ? { entry: best.entry, score: best.score } : null;
}