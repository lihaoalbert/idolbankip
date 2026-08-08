/**
 * L1 技术质量评估 — ffprobe + ffmpeg (本地 CPU,免费)
 *
 * 评分维度 (覆盖度 100%):
 *  - 视频: 分辨率 / 帧率 / 码率 / 编码 / 时长 / 色彩空间
 *  - 音频: 码率 / 电平 / 静音检测
 *  - 异常: 黑帧 / 静音 / 解码失败
 *
 * 关联: docs/research/quality-eval-benchmark-2026.md §1 Layer 1 / §8.2
 *
 * 设计:
 *  - 输入接受 OSS URL 或本地绝对路径 (开发态方便测试)
 *  - ffprobe 失败 / 文件不可达 → graceful degrade (score=0.4 + note)
 *  - 不阻塞主流程: 这里 throw 也只 throw 内部异常, 由主 service 兜底
 *  - score 范围 [0, 1], 0.5 为中性
 */

import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { EvidenceClip, L1TechnicalResult } from './types';

const execFileAsync = promisify(execFile);

const FFMPEG_TIMEOUT_MS = 15_000;

const MIN_RESOLUTION_THRESHOLDS = {
  /** 720p 以上为合格, 480p 重扣 */
  width720p: 1280,
  height720p: 720,
  /** 24 fps 起算合格, 低于重扣 */
  fps24: 24,
  /** 视频码率下限 (kbps), 480p~5Mbps 720p~10Mbps */
  videoBitrate: 1500,
  /** 音频码率下限 (kbps) */
  audioBitrate: 64,
};

interface FfprobeStream {
  codec_type: 'video' | 'audio';
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
  color_space?: string;
  pix_fmt?: string;
  duration?: string;
}

interface FfprobeOutput {
  streams: FfprobeStream[];
  format: {
    duration?: string;
    bit_rate?: string;
    format_name?: string;
  };
}

interface TechnicalInput {
  /** OSS URL 或本地路径 */
  videoUrl: string;
  /** 可选: 用户上传描述 */
  description?: string;
}

@Injectable()
export class L1TechnicalService {
  private readonly logger = new Logger(L1TechnicalService.name);
  /** ffmpeg/ffprobe 是否可用 — 模块启动时探测,避免每次评分都 spawn */
  private ffmpegAvailable: boolean | null = null;

  async score(input: TechnicalInput): Promise<L1TechnicalResult> {
    const evidence: EvidenceClip[] = [];
    const deductions: Array<{ rule: string; reason: string; penalty: number }> = [];

    const localPath = await this.ensureLocalCopy(input.videoUrl);
    if (!localPath) {
      return this.failResult(`无法获取视频文件: ${this.redactUrl(input.videoUrl)}`);
    }

    const available = await this.detectFfmpeg();
    if (!available) {
      return this.failResult('ffmpeg/ffprobe 未安装, L1 评分不可信 (建议 ECS 装 ffmpeg)');
    }

    let probe: FfprobeOutput;
    try {
      probe = await this.runFfprobe(localPath);
    } catch (err) {
      return this.failResult(`ffprobe 失败: ${(err as Error).message}`);
    }

    const video = probe.streams.find((s) => s.codec_type === 'video');
    const audio = probe.streams.find((s) => s.codec_type === 'audio');
    if (!video) {
      return this.failResult('未找到视频流, 文件可能损坏或不合法');
    }

    const metrics: L1TechnicalResult['metrics'] = {};
    let score = 1.0;

    // 分辨率
    if (video.width && video.height) {
      metrics.width = video.width;
      metrics.height = video.height;
      if (video.height < 480) {
        score -= 0.25;
        deductions.push({ rule: 'resolution_too_low', reason: `分辨率 ${video.height}p 低于 480p`, penalty: 0.25 });
      } else if (video.height < MIN_RESOLUTION_THRESHOLDS.height720p) {
        score -= 0.1;
        deductions.push({ rule: 'resolution_below_720p', reason: `分辨率 ${video.height}p 低于 720p`, penalty: 0.1 });
      }
    } else {
      score -= 0.1;
      deductions.push({ rule: 'resolution_unknown', reason: '未读取到分辨率', penalty: 0.1 });
    }

    // 帧率
    if (video.r_frame_rate) {
      const fps = parseFps(video.r_frame_rate);
      if (fps !== null) {
        metrics.fps = fps;
        if (fps < 18) {
          score -= 0.2;
          deductions.push({ rule: 'fps_too_low', reason: `帧率 ${fps} 低于 18`, penalty: 0.2 });
        } else if (fps < MIN_RESOLUTION_THRESHOLDS.fps24) {
          score -= 0.1;
          deductions.push({ rule: 'fps_below_24', reason: `帧率 ${fps} 低于 24`, penalty: 0.1 });
        }
      }
    }

    // 时长
    const duration = parseFloat(video.duration || probe.format.duration || 'NaN');
    if (!Number.isNaN(duration) && Number.isFinite(duration)) {
      metrics.durationSec = duration;
      if (duration < 2) {
        score -= 0.15;
        deductions.push({ rule: 'duration_too_short', reason: `时长 ${duration.toFixed(1)}s 太短`, penalty: 0.15 });
      }
    }

    // 编码
    if (video.codec_name) {
      metrics.videoCodec = video.codec_name;
    }
    if (audio?.codec_name) {
      metrics.audioCodec = audio.codec_name;
    }

    // 视频码率
    const videoBitrateKbps = Number(video.bit_rate || probe.format.bit_rate || 0) / 1000;
    if (videoBitrateKbps > 0) {
      metrics.videoBitrateKbps = Math.round(videoBitrateKbps);
      if (videoBitrateKbps < MIN_RESOLUTION_THRESHOLDS.videoBitrate) {
        const severity = videoBitrateKbps < 500 ? 0.2 : 0.1;
        score -= severity;
        deductions.push({
          rule: 'video_bitrate_low',
          reason: `视频码率 ${Math.round(videoBitrateKbps)}kbps 偏低`,
          penalty: severity,
        });
      }
    }

    // 音频码率
    if (audio) {
      const audioBitrateKbps = Number(audio.bit_rate || 0) / 1000;
      if (audioBitrateKbps > 0) {
        metrics.audioBitrateKbps = Math.round(audioBitrateKbps);
        if (audioBitrateKbps < MIN_RESOLUTION_THRESHOLDS.audioBitrate) {
          score -= 0.1;
          deductions.push({ rule: 'audio_bitrate_low', reason: `音频码率 ${Math.round(audioBitrateKbps)}kbps 偏低`, penalty: 0.1 });
        }
      }
    }

    // 色彩空间
    if (video.color_space) {
      metrics.colorSpace = video.color_space;
      if (!['bt709', 'bt601', 'smpte240m'].includes(video.color_space)) {
        score -= 0.05;
        deductions.push({ rule: 'unknown_color_space', reason: `色彩空间 ${video.color_space} 不标准`, penalty: 0.05 });
      }
    }

    // 黑帧检测 (ffmpeg blackdetect) — 占比 > 10% 重扣
    try {
      const blackRatio = await this.detectBlackFrameRatio(localPath, duration);
      if (blackRatio !== null) {
        metrics.blackFrameRatio = blackRatio;
        if (blackRatio > 0.3) {
          score -= 0.15;
          deductions.push({ rule: 'excessive_black_frames', reason: `黑帧占比 ${(blackRatio * 100).toFixed(1)}%`, penalty: 0.15 });
        } else if (blackRatio > 0.1) {
          score -= 0.08;
          deductions.push({ rule: 'black_frames', reason: `黑帧占比 ${(blackRatio * 100).toFixed(1)}%`, penalty: 0.08 });
        }
      }
    } catch (e) {
      this.logger.warn(`blackdetect 失败: ${(e as Error).message}`);
    }

    // 音频电平 (ffmpeg volumedetect)
    if (audio) {
      try {
        const audioLevel = await this.detectAudioLevel(localPath);
        if (audioLevel !== null) {
          metrics.avgAudioLevelDb = audioLevel;
          if (audioLevel < -40) {
            score -= 0.1;
            deductions.push({ rule: 'audio_too_quiet', reason: `平均电平 ${audioLevel.toFixed(1)}dB 偏小`, penalty: 0.1 });
          } else if (audioLevel > -3) {
            score -= 0.05;
            deductions.push({ rule: 'audio_too_loud', reason: `平均电平 ${audioLevel.toFixed(1)}dB 接近削顶`, penalty: 0.05 });
          }
        }
      } catch (e) {
        this.logger.warn(`volumedetect 失败: ${(e as Error).message}`);
      }
    }

    const final = clamp01(score);
    evidence.push({ note: `L1 metric=${JSON.stringify(metrics)} deductions=${deductions.length}` });

    return {
      layer: 'L1',
      score: final,
      decision: final >= 0.7 ? 'PASS' : final >= 0.5 ? 'REVIEW' : 'FAIL',
      metrics,
      evidence,
      deductions,
    };
  }

  // ============ helpers ============

  private failResult(reason: string): L1TechnicalResult {
    this.logger.warn(`L1: ${reason}`);
    return {
      layer: 'L1',
      score: 0,
      decision: 'FAIL',
      metrics: {},
      evidence: [{ note: reason }],
      deductions: [{ rule: 'l1_disabled', reason, penalty: 1.0 }],
    };
  }

  private async detectFfmpeg(): Promise<boolean> {
    if (this.ffmpegAvailable !== null) return this.ffmpegAvailable;
    try {
      await execFileAsync('ffprobe', ['-version'], { timeout: 3_000 });
      this.ffmpegAvailable = true;
    } catch {
      this.ffmpegAvailable = false;
    }
    return this.ffmpegAvailable;
  }

  private async runFfprobe(filePath: string): Promise<FfprobeOutput> {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
    );
    return JSON.parse(stdout);
  }

  private async detectBlackFrameRatio(filePath: string, durationSec?: number): Promise<number | null> {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      [
        '-i', filePath,
        '-vf', 'blackdetect=threshold=0.10:pic_th=0.98',
        '-an',
        '-f', 'null',
        '-',
      ],
      { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
    );
    // stderr 形如 "blackdetect BLACK_START:0.000 BLACK_END:0.500 ..."
    // 简化算法: 累计每段黑帧时长 / 总时长
    const matches = stderr.matchAll(/black_duration:([\d.]+)/g);
    let totalBlack = 0;
    for (const m of matches) totalBlack += parseFloat(m[1]);
    const dur = durationSec || 0;
    if (!dur || dur <= 0) return null;
    return Math.min(1, totalBlack / dur);
  }

  private async detectAudioLevel(filePath: string): Promise<number | null> {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      [
        '-i', filePath,
        '-vn',
        '-af', 'volumedetect',
        '-f', 'null',
        '-',
      ],
      { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
    );
    const m = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/);
    return m ? parseFloat(m[1]) : null;
  }

  /**
   * 输入若是 OSS URL / HTTP URL — 先下载到本地 /tmp
   * 输入若是本地路径直接返回
   * 失败返 null
   */
  private async ensureLocalCopy(urlOrPath: string): Promise<string | null> {
    if (!urlOrPath) return null;
    if (/^https?:\/\//.test(urlOrPath)) {
      try {
        const tmp = join(tmpdir(), `l1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
        const buf = await this.download(urlOrPath);
        if (!buf) return null;
        await writeFile(tmp, buf);
        return tmp;
      } catch (e) {
        this.logger.warn(`下载失败: ${urlOrPath.slice(0, 80)}: ${(e as Error).message}`);
        return null;
      }
    }
    if (existsSync(urlOrPath) && statSync(urlOrPath).isFile()) return urlOrPath;
    return null;
  }

  private async download(url: string): Promise<Buffer | null> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) return null;
      const ab = await r.arrayBuffer();
      return Buffer.from(ab);
    } finally {
      clearTimeout(t);
    }
  }

  private redactUrl(url: string): string {
    try {
      const u = new URL(url);
      u.search = '';
      return u.toString().slice(0, 80);
    } catch {
      return url.slice(0, 80);
    }
  }
}

function parseFps(rate: string): number | null {
  // 例 "30/1" 或 "24000/1001"
  const [num, den] = rate.split('/').map(Number);
  if (!den) return num;
  return num / den;
}

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000;
}
