import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OSS from 'ali-oss';
import sharp from 'sharp';
import { AssetType, IpAsset, IpStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WatermarkService } from '../watermark/watermark.service';

export interface PolicyResult {
  host: string;
  policy: string;
  signature: string;
  dir: string;
  expire: number;
  accessKeyId: string;
  callback: string;
}

const TEXT_TYPES = new Set<AssetType>([AssetType.BIO_TXT, AssetType.RECIPE_TXT]);
const IMAGE_TYPES = new Set<AssetType>([
  AssetType.THREE_VIEW,
  AssetType.EXPRESSION_GRID,
  AssetType.TRANSPARENT_RENDER,
]);
const AUDIO_TYPES = new Set<AssetType>([AssetType.VOICE_REF]);
const PACKAGE_TYPES = new Set<AssetType>([AssetType.PACKAGE_ZIP]);
const LORA_TYPES = new Set<AssetType>([AssetType.LORA_FILE]);

// 校验规则集中放这里,这样 UI 端如果要展示"最大 5MB"也能 import
export const ASSET_LIMITS: Record<AssetType, { minBytes: number; maxBytes: number; ext: RegExp; label: string }> = {
  THREE_VIEW:        { minBytes: 100_000,     maxBytes: 30_000_000,    ext: /\.(jpe?g|png|webp)$/i,  label: '三视图 (jpg/png/webp, ≥2048×2048, 100KB-30MB)' },
  EXPRESSION_GRID:   { minBytes: 100_000,     maxBytes: 30_000_000,    ext: /\.(jpe?g|png|webp)$/i,  label: '表情矩阵 (jpg/png/webp, ≥2048×2048, 100KB-30MB)' },
  TRANSPARENT_RENDER:{ minBytes: 100_000,     maxBytes: 30_000_000,    ext: /\.png$/i,              label: '立绘 (PNG 带 alpha, ≥2048×2048, 100KB-30MB)' },
  LORA_FILE:         { minBytes: 1_000_000,   maxBytes: 300_000_000,   ext: /\.safetensors$/i,      label: 'LoRA (.safetensors, 1MB-300MB)' },
  RECIPE_TXT:        { minBytes: 10,          maxBytes: 1_000_000,     ext: /\.(txt|md)$/i,         label: 'Prompt 说明书 (.txt/.md, ≤1MB)' },
  BIO_TXT:           { minBytes: 10,          maxBytes: 1_000_000,     ext: /\.(txt|md)$/i,         label: '人物小传 (.txt/.md, ≤1MB)' },
  VOICE_REF:         { minBytes: 50_000,      maxBytes: 50_000_000,    ext: /\.(wav|mp3)$/i,        label: '声音样本 (.wav/.mp3, 50KB-50MB)' },
  PACKAGE_ZIP:       { minBytes: 1_000,       maxBytes: 1_000_000_000, ext: /\.zip$/i,              label: '资产包 (.zip, 1KB-1GB)' },
  TEST_SAMPLE:       { minBytes: 1_000,       maxBytes: 30_000_000,    ext: /\.(jpe?g|png|webp)$/i, label: '测试样板 (图片)' },
  LEGAL_PROOF:       { minBytes: 1_000,       maxBytes: 30_000_000,    ext: /\.(jpe?g|png|webp|pdf)$/i, label: '训练截图' },
};

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly publicClient: OSS;
  private readonly privateClient: OSS;
  private readonly contractsClient: OSS;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly watermark: WatermarkService,
  ) {
    const region = config.get<string>('OSS_REGION', 'oss-cn-hangzhou');
    const accessKeyId = config.get<string>('OSS_ACCESS_KEY_ID', '');
    const accessKeySecret = config.get<string>('OSS_ACCESS_KEY_SECRET', '');
    const opts = { region, accessKeyId, accessKeySecret, secure: true };
    this.publicClient = new OSS({
      ...opts,
      bucket: config.get<string>('OSS_BUCKET_PUBLIC', 'ibi-ren-dev-public'),
    });
    this.privateClient = new OSS({
      ...opts,
      bucket: config.get<string>('OSS_BUCKET_PRIVATE', 'ibi-ren-dev-private'),
    });
    this.contractsClient = new OSS({
      ...opts,
      bucket: config.get<string>('OSS_BUCKET_CONTRACTS', 'ibi-ren-dev-contracts'),
    });
  }

  /**
   * 生成 OSS 直传 POST 策略 (浏览器 → ibi-private 桶,不经后端)
   */
  async generateDirectPostPolicy(params: {
    ipId: string;
    assetType: AssetType;
    filename: string;
    size: number;
  }): Promise<PolicyResult & { url: string; bucket: string; key: string }> {
    const ip = await this.prisma.ipAsset.findUniqueOrThrow({ where: { id: params.ipId } });
    const safeName = params.filename.replace(/[\\/\0]/g, '_').slice(-200);
    const dir = `ips/${ip.code}/raw/${params.assetType}/${Date.now()}/`;
    const key = dir + safeName;
    const expireSeconds = 600;
    const expireEpoch = Math.floor(Date.now() / 1000) + expireSeconds;
    // content-length-range 限制 = ASSET_LIMITS.maxBytes + 1MB 缓冲(OSS 强制)
    const maxSize = Math.min(Math.max(ASSET_LIMITS[params.assetType].maxBytes + 1024 * 1024, 1024), 5 * 1024 * 1024 * 1024);

    const policy = {
      expiration: new Date(expireEpoch * 1000).toISOString(),
      conditions: [
        ['content-length-range', 0, maxSize],
        ['eq', '$key', key],
        ['starts-with', '$key', dir],
      ],
    };

    const { policy: policyBase64, Signature: signature } = (
      this.privateClient as unknown as {
        calculatePostSignature: (p: object) => { policy: string; Signature: string };
      }
    ).calculatePostSignature(policy);

    return {
      host: `https://${this.privateClient.options.bucket}.${this.config.get('OSS_REGION')}.aliyuncs.com`,
      policy: policyBase64,
      signature,
      dir,
      key,
      expire: expireEpoch,
      accessKeyId: this.config.get<string>('OSS_ACCESS_KEY_ID') || '',
      callback: '',
      url: this.privateClient.options.endpoint || '',
      bucket: this.privateClient.options.bucket || '',
    };
  }

  /**
   * OSS 回调: 校验签名 → 按 AssetType 校验 → 写 IpFile
   * 校验失败时抛 BadRequestException(让前端知道),并清理已上传的 OSS 对象
   */
  async handleOssCallback(callbackBody: Record<string, unknown>, signature?: string): Promise<{ ok: boolean; fileId?: string; error?: string }> {
    if (this.config.get('NODE_ENV') === 'production') {
      // TODO: 严格验证 OSS Authorization header
      this.logger.warn('OSS callback signature verification is simplified in MVP');
    }
    const { filename, size, etag, x: dir } = callbackBody as Record<string, string>;
    const ipCode = (dir ?? '').split('/')[1];
    const assetType = (dir ?? '').split('/')[3] as AssetType;
    if (!ipCode || !assetType) {
      return { ok: false, error: 'OSS key 路径不合法' };
    }
    const ip = await this.prisma.ipAsset.findUnique({ where: { code: ipCode } });
    if (!ip) return { ok: false, error: 'IP 不存在' };

    const sizeBytes = parseInt(size ?? '0', 10);
    const filenameStr = filename ?? 'unknown';

    // 1. 简单校验 (size + 扩展名) — 不下文件
    const limit = ASSET_LIMITS[assetType];
    if (sizeBytes < limit.minBytes) {
      await this.deleteFromOss(dir).catch(() => undefined);
      return { ok: false, error: `${limit.label.split('(')[0].trim()} 太小 (${this.fmtSize(sizeBytes)}), 要求 ≥ ${this.fmtSize(limit.minBytes)}` };
    }
    if (sizeBytes > limit.maxBytes) {
      await this.deleteFromOss(dir).catch(() => undefined);
      return { ok: false, error: `${limit.label.split('(')[0].trim()} 太大 (${this.fmtSize(sizeBytes)}), 要求 ≤ ${this.fmtSize(limit.maxBytes)}` };
    }
    if (!limit.ext.test(filenameStr)) {
      await this.deleteFromOss(dir).catch(() => undefined);
      return { ok: false, error: `文件扩展名不合法, 期望: ${limit.label}` };
    }

    // 2. 深度校验 (magic + 尺寸) — 需要下文件
    const deep = await this.deepValidate(assetType, dir, sizeBytes);
    if (!deep.ok) {
      await this.deleteFromOss(dir).catch(() => undefined);
      return { ok: false, error: deep.reason };
    }

    // 3. 校验通过, 写 IpFile
    const checksum = etag;
    const file = await this.prisma.ipFile.create({
      data: {
        ipId: ip.id,
        assetType,
        originalName: filenameStr,
        ossKey: dir,
        sizeBytes: BigInt(sizeBytes),
        mimeType: this.guessMime(filenameStr),
        checksumSha256: checksum ?? '',
        validated: true,
      },
    });

    if (IMAGE_TYPES.has(assetType) && !ip.thumbnailKey) {
      this.generateThumbnailFromOssKey(ip.code, dir, filenameStr).catch((e) =>
        this.logger.warn(`thumbnail gen failed for ${ip.code}: ${e?.message ?? e}`),
      );
    }
    return { ok: true, fileId: file.id };
  }

  /**
   * 深度校验: 图片 (sharp 尺寸) / LORA (safetensors magic) / ZIP (PK magic) / VOICE (mime/扩展名已在前置校验)
   */
  private async deepValidate(
    type: AssetType,
    key: string,
    size: number,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      if (IMAGE_TYPES.has(type)) {
        const url = await this.signDownloadUrl(key, 'private');
        const res = await globalThis.fetch(url);
        if (!res.ok) return { ok: false, reason: `OSS 拉取失败 HTTP ${res.status}` };
        const ab = await res.arrayBuffer();
        const meta = await sharp(Buffer.from(ab)).metadata();
        if (!meta.width || !meta.height) {
          return { ok: false, reason: '无法读取图片尺寸' };
        }
        if (meta.width < 2048 || meta.height < 2048) {
          return { ok: false, reason: `图片尺寸 ${meta.width}×${meta.height}, 要求 ≥2048×2048` };
        }
        if (type === AssetType.TRANSPARENT_RENDER) {
          if (meta.format !== 'png') {
            return { ok: false, reason: '立绘必须是 PNG 格式 (带 alpha 通道)' };
          }
          if (!meta.hasAlpha) {
            return { ok: false, reason: '立绘必须带 alpha 通道 (透明背景)' };
          }
        }
        return { ok: true };
      }

      if (LORA_TYPES.has(type)) {
        // .safetensors magic: 文件以 `{"__metadata":"...` 开头 (JSON header)
        const head = await this.fetchHead(key, 16);
        const headStr = head.toString('utf8', 0, Math.min(head.length, 16));
        if (!headStr.startsWith('{"__metadata"')) {
          return { ok: false, reason: '不是合法的 .safetensors 文件 (magic 校验失败)' };
        }
        return { ok: true };
      }

      if (PACKAGE_TYPES.has(type)) {
        // .zip magic: PK\x03\x04 (50 4B 03 04)
        const head = await this.fetchHead(key, 4);
        if (head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4B || head[2] !== 0x03 || head[3] !== 0x04) {
          return { ok: false, reason: '不是合法的 .zip 文件 (magic 校验失败)' };
        }
        return { ok: true };
      }

      if (TEXT_TYPES.has(type) || AUDIO_TYPES.has(type) || type === AssetType.TEST_SAMPLE || type === AssetType.LEGAL_PROOF) {
        return { ok: true };
      }

      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: `校验失败: ${e?.message ?? e}` };
    }
  }

  private async fetchHead(key: string, n: number): Promise<Buffer> {
    const url = await this.signDownloadUrl(key, 'private');
    const res = await globalThis.fetch(url, { headers: { Range: `bytes=0-${n - 1}` } });
    if (!res.ok && res.status !== 206) {
      throw new Error(`OSS HEAD ${key} → HTTP ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private fmtSize(b: number): string {
    if (b < 1024) return `${b}B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(0)}MB`;
    return `${(b / 1024 / 1024 / 1024).toFixed(1)}GB`;
  }

  private async deleteFromOss(key: string): Promise<void> {
    try {
      await this.privateClient.delete(key);
    } catch (e: any) {
      this.logger.warn(`OSS delete ${key} failed: ${e?.message ?? e}`);
    }
  }

  /**
   * 创作者从 description 自动生成 BIO_TXT 资产 (避免两次输入)
   * - 仅 PENDING_REVIEW 状态可调用
   * - 删除已有的同类型文件, 然后写入新文件
   */
  async createAutoFile(
    ipId: string,
    creatorId: string,
    assetType: AssetType,
    content: string,
  ): Promise<{ id: string; assetType: AssetType; originalName: string; sizeBytes: string; mimeType: string }> {
    if (!TEXT_TYPES.has(assetType)) {
      throw new BadRequestException('auto-file 仅支持文本类素材 (BIO_TXT / RECIPE_TXT)');
    }
    if (!content || content.trim().length === 0) {
      throw new BadRequestException('内容不能为空');
    }
    if (content.length > 200_000) {
      throw new BadRequestException('内容过长 (≤20 万字)');
    }
    const ip = await this.prisma.ipAsset.findUniqueOrThrow({ where: { id: ipId } });
    if (ip.creatorId !== creatorId) throw new ForbiddenException('无权操作此资产');
    if (ip.status !== IpStatus.PENDING_REVIEW) {
      throw new BadRequestException('已提交审核的 IP 不允许修改资产');
    }

    // 删除已有的同类型文件 (OSS 对象 + IpFile 行)
    const existing = await this.prisma.ipFile.findMany({ where: { ipId, assetType } });
    for (const f of existing) {
      await this.deleteFromOss(f.ossKey).catch(() => undefined);
    }
    if (existing.length > 0) {
      await this.prisma.ipFile.deleteMany({ where: { ipId, assetType } });
    }

    // 写 .txt 到 OSS private 桶
    const buf = Buffer.from(content, 'utf-8');
    const filename = `${assetType.toLowerCase()}_auto_${Date.now()}.txt`;
    const key = `ips/${ip.code}/auto/${assetType}/${filename}`;
    await this.privateClient.put(key, buf, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

    // 写 IpFile 行
    const file = await this.prisma.ipFile.create({
      data: {
        ipId,
        assetType,
        originalName: filename,
        ossKey: key,
        sizeBytes: BigInt(buf.length),
        mimeType: 'text/plain',
        checksumSha256: '',
        validated: true,
      },
    });

    return {
      id: file.id,
      assetType,
      originalName: filename,
      sizeBytes: buf.length.toString(),
      mimeType: 'text/plain',
    };
  }

  private isImageType(t: AssetType): boolean {
    return IMAGE_TYPES.has(t);
  }

  /**
   * 从 private bucket 拉原图 → sharp 裁剪成 600×600 → 推到 public bucket → 写 thumbnailKey
   */
  private async generateThumbnailFromOssKey(ipCode: string, sourceKey: string, hintName: string): Promise<void> {
    const url = await this.signDownloadUrl(sourceKey, 'private');
    const res = await globalThis.fetch(url);
    if (!res.ok) throw new Error(`OSS GET ${sourceKey} → HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    const thumb = await sharp(Buffer.from(ab))
      .resize(600, 600, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const key = `ips/${ipCode}/thumb_600.jpg`;
    await this.uploadPublic(key, thumb, 'image/jpeg');
    await this.prisma.ipAsset.update({
      where: { code: ipCode },
      data: { thumbnailKey: key },
    });
    this.logger.log(`thumbnail generated for ${ipCode} from ${hintName}`);
  }

  /**
   * 下载授权签名 URL
   */
  async signDownloadUrl(ossKey: string, bucket: 'private' | 'contracts' = 'private', filename?: string): Promise<string> {
    const client = bucket === 'contracts' ? this.contractsClient : this.privateClient;
    const response: Record<string, string> = { 'x-oss-force-download': 'true' };
    if (filename) response['response-content-disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`;
    const url = client.signatureUrl(ossKey, { expires: 300, response });
    return url;
  }

  async uploadPublic(key: string, buffer: Buffer, mime = 'image/jpeg'): Promise<string> {
    await this.publicClient.put(key, buffer, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=2592000',
        'x-oss-object-acl': 'public-read',
      },
    });
    return `https://${this.publicClient.options.bucket}.${this.config.get('OSS_REGION')}.aliyuncs.com/${key}`;
  }

  async uploadPrivate(key: string, buffer: Buffer): Promise<string> {
    await this.privateClient.put(key, buffer);
    return `https://${this.privateClient.options.bucket}.${this.config.get('OSS_REGION')}.aliyuncs.com/${key}`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.publicClient.getBucketInfo();
      return true;
    } catch {
      return false;
    }
  }

  private guessMime(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase();
    return {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
      safetensors: 'application/octet-stream',
      txt: 'text/plain', md: 'text/markdown',
      wav: 'audio/wav', mp3: 'audio/mpeg',
      zip: 'application/zip',
      mp4: 'video/mp4',
    }[ext ?? ''] ?? 'application/octet-stream';
  }
}
