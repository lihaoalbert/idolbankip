/**
 * LocalKeywordFallback — 本地广告法违禁词表 fallback
 *
 * 用途:
 * - 阿里云 API 漏判时最后一关
 * - ECS 出境网络故障时降级
 * - 创作者上传后立即拦截(零延迟)
 *
 * 数据源: apps/api/src/moderation/keywords/ad-law-words.json (gitignored, 购买)
 * 骨架: ad-law-words.example.json (入仓, 字段结构示例)
 *
 * 设计:
 * - 启动时一次性加载到内存 (词表 < 100KB, 启动成本可忽略)
 * - 失败时降级为空匹配 (不阻断主流程, 让阿里云 API 处理)
 * - 返回 ModerationResult 格式, 与 AliyunGreenProvider 接口兼容
 *
 * 关联: docs/research/quality-eval-benchmark-2026.md §5.4 + §9.6
 */
import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ModerationResult,
  ModerationLabel,
  ModerationDecision,
} from '@ibi-ren/shared-contracts';

interface AdLawWords {
  _version?: string;
  _purchased?: string | null;
  extreme_absolute?: string[];
  medical_guarantee?: string[];
  comparison_rank?: string[];
  invest_return?: string[];
  minor_sensitive?: string[];
  politics_sensitive?: string[];
  religion_sensitive?: string[];
}

const WORDS_PATH = join(__dirname, 'keywords', 'ad-law-words.json');
const EXAMPLE_PATH = join(__dirname, 'keywords', 'ad-law-words.example.json');

@Injectable()
export class LocalKeywordFallback {
  private readonly logger = new Logger(LocalKeywordFallback.name);
  private words: AdLawWords = {};
  private loaded = false;

  constructor() {
    this.reload();
  }

  /**
   * 重新加载词表 — 用于热更 (admin 后台按钮触发)
   */
  reload(): void {
    const path = existsSync(WORDS_PATH) ? WORDS_PATH : EXAMPLE_PATH;
    if (!existsSync(path)) {
      this.logger.warn(`广告法词表不存在: ${path}, 降级为空匹配`);
      this.words = {};
      this.loaded = false;
      return;
    }
    try {
      const raw = readFileSync(path, 'utf-8');
      this.words = JSON.parse(raw) as AdLawWords;
      this.loaded = true;
      const count = Object.values(this.words)
        .filter((v) => Array.isArray(v))
        .reduce((sum, arr) => sum + (arr as string[]).length, 0);
      this.logger.log(`广告法词表已加载: ${path}, 命中 ${count} 个词`);
    } catch (err) {
      this.logger.error(`广告法词表加载失败: ${(err as Error).message}`);
      this.words = {};
      this.loaded = false;
    }
  }

  /**
   * 扫描文本 — 返回 ModerationResult
   */
  scanText(text: string): ModerationResult {
    if (!this.loaded) {
      return {
        decision: 'PASS',
        labels: [],
        scannedAt: new Date(),
      };
    }
    const labels: ModerationLabel[] = [];
    const categoryMap: Record<keyof AdLawWords, string> = {
      _version: '',
      _purchased: '',
      extreme_absolute: 'extreme_word',
      medical_guarantee: 'medical_guarantee',
      comparison_rank: 'comparison_rank',
      invest_return: 'invest_promise',
      minor_sensitive: 'minor_sensitive',
      politics_sensitive: 'politics_sensitive',
      religion_sensitive: 'religion_sensitive',
    };
    for (const [key, labelName] of Object.entries(categoryMap)) {
      if (!labelName) continue;
      const words = this.words[key as keyof AdLawWords];
      if (!Array.isArray(words)) continue;
      for (const word of words as string[]) {
        if (text.includes(word)) {
          labels.push({
            label: labelName,
            confidence: 1.0, // 词表匹配 = 100% 确定
            description: `命中违禁词: ${word}`,
          });
        }
      }
    }
    // 任一 politics_sensitive/religion_sensitive 命中 → 直接 FAIL (一票否决)
    // 其他命中 → REVIEW (人工复审)
    const hasCritical = labels.some(
      (l) => l.label === 'politics_sensitive' || l.label === 'religion_sensitive',
    );
    const decision: ModerationDecision = hasCritical
      ? 'FAIL'
      : labels.length > 0
        ? 'REVIEW'
        : 'PASS';
    return {
      decision,
      labels,
      rawResponse: { source: 'local-keyword-fallback', version: this.words._version },
      scannedAt: new Date(),
    };
  }
}