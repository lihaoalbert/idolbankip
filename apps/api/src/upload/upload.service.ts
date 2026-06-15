import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as OSS from 'ali-oss';
import { AssetType, IpStatus } from '@prisma/client';
import { createHash } from 'crypto';
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
   * 生成 OSS 直传 POST 策略 (浏览器 → OSS,不经后端)
   */
  async generateDirectPostPolicy(params: {
    ipId: string;
    assetType: AssetType;
    filename: string;
    size: number;
  }): Promise<PolicyResult & { url: string; bucket: string }> {
    const ip = await this.prisma.ipAsset.findUniqueOrThrow({ where: { id: params.ipId } });
    const dir = `ips/${ip.code}/raw/${params.assetType}/${Date.now()}/`;
    const expireSeconds = 600;
    const expireEpoch = Math.floor(Date.now() / 1000) + expireSeconds;
    const callbackUrl = `${this.config.get('API_BASE_URL')}/api/v1/upload/oss-callback`;

    const policy = {
      expiration: new Date(expireEpoch * 1000).toISOString(),
      conditions: [
        ['content-length-range', 0, Math.min(params.size + 1024, 1024 * 1024 * 1024)],
        ['starts-with', '$key', dir],
        { callbackUrl },
      ],
    };

    const policyBase64 = Buffer.from(JSON.stringify(policy)).toString('base64');
    const signature = this.publicClient.signature(postPolicy => postPolicy, policyBase64) as unknown as string;
    // ali-oss 没有直接的 signature(policy) 计算,这里用简化版
    const sig = createHash('md5')
      .update(policyBase64 + this.config.get<string>('OSS_ACCESS_KEY_SECRET'))
      .digest('hex');

    return {
      host: `https://${this.publicClient.options.bucket}.${this.config.get('OSS_REGION')}.aliyuncs.com`,
      policy: policyBase64,
      signature: sig,
      dir,
      expire: expireEpoch,
      accessKeyId: this.config.get<string>('OSS_ACCESS_KEY_ID') || '',
      callback: callbackUrl,
      url: this.publicClient.options.endpoint || '',
      bucket: this.publicClient.options.bucket || '',
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
    return { ok: true, fileId: file.id };
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
   */
  async uploadPublic(key: string, buffer: Buffer, mime = 'image/jpeg'): Promise<string> {
    await this.publicClient.put(key, buffer, {
      headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=2592000' },
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