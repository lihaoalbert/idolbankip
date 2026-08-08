/**
 * PII 脱敏 helper — 给 Claude API 调用前过一遍,避免 PII 数据出境
 *
 * 设计要点:
 * - 纯 string in / string out,无副作用
 * - 覆盖:大陆手机号 / 邮箱 / 身份证 / 银行卡 / 简单姓名(2-4 字中文常见姓名)
 * - 用法: Claude 调用前 `messages: [{role: 'user', content: redactPii(rawText)}]`
 * - 局限: 中文姓名只能粗匹配"姓 + 单名"或"姓 + 双名",无法识别所有真实姓名
 *        — 这是合规 mitigation,不是 100% 防御。合同级合规还要靠法务免责 (§9.6)
 *
 * 关联: docs/research/quality-eval-benchmark-2026.md §8.4 数据出境合规风险
 */

const PATTERNS: Array<{ name: string; regex: RegExp; replacement: string }> = [
  // 大陆手机号: 11 位 1[3-9] 开头
  { name: 'phone', regex: /\b1[3-9]\d{9}\b/g, replacement: '[PHONE]' },
  // 邮箱: 简易 RFC 匹配
  { name: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL]' },
  // 身份证 18 位 (末位 X/x)
  { name: 'idcard', regex: /\b\d{17}[\dXx]\b/g, replacement: '[IDCARD]' },
  // 银行卡 16-19 位数字 (Luhn 校验可选,这里只做长度过滤避免误伤短数字)
  { name: 'bankcard', regex: /\b\d{16,19}\b/g, replacement: '[BANKCARD]' },
  // 简单姓名: 中文 2-4 字 + 常见姓氏开头 (粗匹配,会误伤短语,业务侧按需调用)
  // 关闭默认启用 — 容易误伤文案,需要更精准的 NER 才能稳
  // { name: 'name', regex: /(?<=[\s,，、])[赵钱孙李周吴郑王][一-龥]{1,3}(?=[\s,，、。])/g, replacement: '[NAME]' },
];

export function redactPii(input: string): string {
  if (!input) return input;
  let result = input;
  for (const { regex, replacement } of PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
}

/**
 * 把 OSS URL query string 清掉(可能含上传者信息),留下干净的 signed URL
 */
export function redactOssUrl(ossUrl: string): string {
  try {
    const u = new URL(ossUrl);
    u.search = '';
    return u.toString();
  } catch {
    return ossUrl;
  }
}

/**
 * 批量脱敏: 用于评分 prompt 拼装 (description + imageUrls + creator info)
 */
export interface RedactableFields {
  description?: string;
  imageUrls?: string[];
  creatorNote?: string;
}

export function redactForClaude(input: RedactableFields): RedactableFields {
  return {
    description: input.description ? redactPii(input.description) : undefined,
    imageUrls: input.imageUrls?.map(redactOssUrl),
    creatorNote: input.creatorNote ? redactPii(input.creatorNote) : undefined,
  };
}