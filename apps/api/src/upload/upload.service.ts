import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OSS from 'ali-oss';
import sharp from 'sharp';
import { AssetType, IpStatus } from '@prisma/client';
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
   * 返回的 key 包含完整路径,浏览器用此 key 作为 OSS 对象名。
   * callback 不进 policy — 浏览器上传成功后自己调 /upload/oss-callback 写 DB。
   */
  async generateDirectPostPolicy(params: {
    ipId: string;
    assetType: AssetType;
    filename: string;
    size: number;
  }): Promise<PolicyResult & { url: string; bucket: string; key: string }> {
    const ip = await this.prisma.ipAsset.findUniqueOrThrow({ where: { id: params.ipId } });
    // 防路径穿越: 取 basename
    const safeName = params.filename.replace(/[\\/\0]/g, '_').slice(-200);
    const dir = `ips/${ip.code}/raw/${params.assetType}/${Date.now()}/`;
    const key = dir + safeName;
    const expireSeconds = 600;
    const expireEpoch = Math.floor(Date.now() / 1000) + expireSeconds;
    // 上限: params.size + 1MB 缓冲;最大 5GB(OSS 限制)
    const maxSize = Math.min(Math.max(params.size + 1024 * 1024, 1024), 5 * 1024 * 1024 * 1024);

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
   * OSS 回调: 校验签名 → 写 IpFile
   */
  async handleOssCallback(callbackBody: Record<string, unknown>, signature?: string): Promise<{ ok: boolean; fileId?: string }> {
    // 简化: 信任 dev 环境;生产需验证 OSS Authorization header
    if (this.config.get('NODE_ENV') === 'production') {
      // TODO: 严格验证
      this.logger.warn('OSS callback signature verification is simplified in MVP');
    }
    const { filename, size, etag, x: dir } = callbackBody as Record<string, string>;
    const ipCode = (dir ?? '').split('/')[1];
    const assetType = (dir ?? '').split('/')[3] as AssetType;
    const ip = await this.prisma.ipAsset.findUnique({ where: { code: ipCode } });
    if (!ip) return { ok: false };
    const checksum = etag; // 简化: 用 etag 作为文件指纹
    const file = await this.prisma.ipFile.create({
      data: {
        ipId: ip.id,
        assetType,
        originalName: filename ?? 'unknown',
        ossKey: dir,
        sizeBytes: BigInt(parseInt(size ?? '0', 10)),
        mimeType: this.guessMime(filename ?? ''),
        checksumSha256: checksum ?? '',
        validated: true,
      },
    });
    // 图片类素材自动生成 600×600 缩略图 → public bucket → 回写 thumbnailKey
    if (this.isImageType(assetType) && !ip.thumbnailKey) {
      this.generateThumbnailFromOssKey(ip.code, dir, filename ?? 'source').catch((e) =>
        this.logger.warn(`thumbnail gen failed for ${ip.code}: ${e?.message ?? e}`),
      );
    }
    return { ok: true, fileId: file.id };
  }

  private isImageType(t: AssetType): boolean {
    return t === AssetType.THREE_VIEW || t === AssetType.EXPRESSION_GRID || t === AssetType.TRANSPARENT_RENDER;
  }

  /**
   * 从 private bucket 拉原图 → sharp 裁剪成 600×600 → 推到 public bucket → 写 thumbnailKey
   * 走签名 URL + HTTPS fetch,避开私有 SDK 类型.
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

  /**
   * 上传缩略图到 public bucket (由 seed 脚本调用)
   * 显式 x-oss-object-acl: public-read,因为 OSS 默认 object ACL 是继承 bucket,
   * 即使 Block Public Access 关掉,新 put 出来的 object 也不一定可读。
   */
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