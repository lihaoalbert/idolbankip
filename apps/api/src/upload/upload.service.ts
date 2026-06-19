import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OSS from 'ali-oss';
import sharp from 'sharp';
import { AssetType, CertFileType, IpAsset, IpStatus } from '@prisma/client';
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
  AssetType.FACE_CLOSEUP,
]);
const AUDIO_TYPES = new Set<AssetType>([AssetType.VOICE_REF]);
const PACKAGE_TYPES = new Set<AssetType>([AssetType.PACKAGE_ZIP]);
const LORA_TYPES = new Set<AssetType>([AssetType.LORA_FILE]);
const PROCESS_TYPES = new Set<AssetType>([AssetType.PROCESS_EVIDENCE]);

// #33 创作过程证据 — 步骤 const (产品可扩展, 无需 migration)
export const PROCESS_STEPS = ['TRAINING_DATA_PREP', 'TRAINING', 'GENERATION', 'POST_PROCESSING', 'OTHER'] as const;
export type ProcessStep = typeof PROCESS_STEPS[number];

// #33 单 IP 累计证据上限 (600MB) — 限 PROCESS_EVIDENCE 类型, 其它资产包不受影响
export const PROCESS_EVIDENCE_TOTAL_MAX_BYTES = 600 * 1024 * 1024;

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
  // 面部特写 — 版权登记核心证据。尺寸同三视图,但必须清晰人脸 (UI 提示),不强制 sharp 验脸
  FACE_CLOSEUP:      { minBytes: 100_000,     maxBytes: 30_000_000,    ext: /\.(jpe?g|png|webp)$/i,  label: '面部特写 (jpg/png/webp, ≥2048×2048, 100KB-30MB, 单一人物正面清晰人脸)' },
  // #33 创作过程证据 — 训练截图/工作流/出图序列, 单文件 200MB, 单 IP 累计 600MB (在 oss-callback 里 SUM 校验)
  PROCESS_EVIDENCE:  { minBytes: 1_000,       maxBytes: 200_000_000,   ext: /\.(jpe?g|png|webp|pdf|mp4|zip)$/i, label: '创作过程证据 (jpg/png/webp/pdf/mp4/zip, 1KB-200MB, 单 IP 累计 ≤600MB)' },
};

export const CERT_LIMITS: Record<CertFileType, { minBytes: number; maxBytes: number; ext: RegExp; label: string; magic: Buffer }> = {
  PDF: { minBytes: 1_000,  maxBytes: 20_000_000, ext: /\.pdf$/i,  label: '版权证书 PDF (100KB-20MB)', magic: Buffer.from('%PDF-') },
  JPG: { minBytes: 10_000, maxBytes: 20_000_000, ext: /\.jpe?g$/i, label: '版权证书 JPG (10KB-20MB)', magic: Buffer.from([0xff, 0xd8, 0xff]) },
  PNG: { minBytes: 10_000, maxBytes: 20_000_000, ext: /\.png$/i,  label: '版权证书 PNG (10KB-20MB)', magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
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
   * 版权证书文件上传策略
   * - 路径: ips/{code}/cert/{ts}/{filename} (与 raw 资产隔离)
   * - 不写 IpFile, 只返回 key 给前端用于提交 cert metadata
   * - 大小限制来自 CERT_LIMITS
   */
  async generateCertPolicy(params: {
    ipCode: string;
    certFileType: CertFileType;
    filename: string;
    size: number;
  }): Promise<PolicyResult & { url: string; bucket: string; key: string }> {
    const safeName = params.filename.replace(/[\\/\0]/g, '_').slice(-200);
    const dir = `ips/${params.ipCode}/cert/${Date.now()}/`;
    const key = dir + safeName;
    const expireSeconds = 600;
    const expireEpoch = Math.floor(Date.now() / 1000) + expireSeconds;
    const limit = CERT_LIMITS[params.certFileType];
    if (!limit.ext.test(params.filename)) {
      throw new BadRequestException(`文件扩展名不合法, 期望: ${limit.label}`);
    }
    const maxSize = Math.min(limit.maxBytes + 1024 * 1024, 5 * 1024 * 1024 * 1024);

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
   * 读 cert 文件 Buffer (用于 admin 预览)
   * - 用 SDK get() 直接走内部签名, 避免 signed URL 的 Range+response 签名 bug
   * - 限制 maxBytes (默认 30MB) 防止恶意大文件拖垮 API
   */
  async getCertBuffer(ossKey: string, maxBytes = 30 * 1024 * 1024): Promise<Buffer> {
    const res = await this.privateClient.get(ossKey);
    // ali-oss get returns { res, content } where content is Buffer
    let buf: Buffer = Buffer.isBuffer(res.content) ? res.content : Buffer.from(res.content as ArrayBuffer);
    if (buf.length > maxBytes) {
      throw new Error(`文件过大 (${this.fmtSize(buf.length)} > ${this.fmtSize(maxBytes)}), 拒绝预览`);
    }
    return buf;
  }

  /**
   * 读合同 PDF (从 private 桶, buyer / admin 调)
   * 合同 key 是 contracts/... 但实际写到 private 桶 (ContractsService.uploadPrivate), 后续读也走 private
   * 用 SDK get() 直读避开 signed URL signature bug
   */
  async getContractBuffer(ossKey: string, maxBytes = 5 * 1024 * 1024): Promise<Buffer> {
    const res = await this.privateClient.get(ossKey);
    let buf: Buffer = Buffer.isBuffer(res.content) ? res.content : Buffer.from(res.content as ArrayBuffer);
    if (buf.length > maxBytes) {
      throw new Error(`合同 PDF 过大 (${this.fmtSize(buf.length)} > ${this.fmtSize(maxBytes)})`);
    }
    return buf;
  }

  /**
   * 验证 cert OSS 对象存在 + magic 校验
   * 创作者提交 cert metadata 时由 CertService 调用, 防止前端伪造 key
   * 用 SDK 自身的 head() + get(range) 避免签名 URL 的 x-oss-force-download 头签名 bug
   */
  async verifyCertObject(ossKey: string, certFileType: CertFileType, size: number): Promise<{ ok: true } | { ok: false; reason: string }> {
    const limit = CERT_LIMITS[certFileType];
    try {
      // 1. SDK head() 拉元数据
      const head = await this.privateClient.head(ossKey);
      const actualSize = Number(head.res.headers['content-length'] ?? 0);
      if (actualSize !== size) {
        return { ok: false, reason: `OSS 实际大小 ${actualSize} 与声明 ${size} 不一致` };
      }
      if (actualSize < limit.minBytes || actualSize > limit.maxBytes) {
        return { ok: false, reason: `${limit.label.split('(')[0].trim()} 大小越界 (${this.fmtSize(actualSize)})` };
      }
      // 2. SDK get(range) 拉首 N 字节做 magic 校验 — 避免走签名 URL
      const range = await this.privateClient.get(ossKey, {
        range: `bytes=0-${limit.magic.length - 1}`,
      } as any);
      const headBuf = Buffer.isBuffer(range.content) ? range.content : Buffer.from(range.content);
      if (!headBuf.subarray(0, limit.magic.length).equals(limit.magic)) {
        return { ok: false, reason: `文件 magic 校验失败, 不是合法的 ${certFileType}` };
      }
      return { ok: true };
    } catch (e: any) {
      this.logger.warn(`verifyCertObject failed for ${ossKey}: ${e?.message ?? e}`);
      return { ok: false, reason: `OSS 对象不存在或无法访问: ${e?.message ?? e}` };
    }
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
    const { filename, size, etag, x, description, processStep } = callbackBody as Record<string, string | undefined>;
    const dir: string = x ?? '';
    const ipCode = dir.split('/')[1];
    const assetType = dir.split('/')[3] as AssetType;
    if (!ipCode || !assetType) {
      return { ok: false, error: 'OSS key 路径不合法' };
    }
    const ip = await this.prisma.ipAsset.findUnique({ where: { code: ipCode } });
    if (!ip) return { ok: false, error: 'IP 不存在' };

    const sizeBytes = parseInt(size ?? '0', 10);
    const filenameStr = filename ?? 'unknown';

    // 0. #33 创作过程证据 — processStep 必填 + 必须在 const list 里
    if (assetType === AssetType.PROCESS_EVIDENCE) {
      if (!processStep || !PROCESS_STEPS.includes(processStep as ProcessStep)) {
        await this.deleteFromOss(dir).catch(() => undefined);
        return { ok: false, error: `processStep 必填且必须是: ${PROCESS_STEPS.join(', ')}` };
      }
    }

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

    // 1b. #33 创作过程证据 — per-IP 累计 ≤ 600MB (DB SUM 现有 evidence 大小 + 本次)
    if (assetType === AssetType.PROCESS_EVIDENCE) {
      const agg = await this.prisma.ipFile.aggregate({
        where: { ipId: ip.id, assetType: AssetType.PROCESS_EVIDENCE },
        _sum: { sizeBytes: true },
      });
      const existing = Number(agg._sum.sizeBytes ?? 0n);
      if (existing + sizeBytes > PROCESS_EVIDENCE_TOTAL_MAX_BYTES) {
        await this.deleteFromOss(dir).catch(() => undefined);
        return {
          ok: false,
          error: `单 IP 累计 PROCESS_EVIDENCE ≤ ${this.fmtSize(PROCESS_EVIDENCE_TOTAL_MAX_BYTES)} (已用 ${this.fmtSize(existing)}, 本次 ${this.fmtSize(sizeBytes)})`,
        };
      }
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
        description: assetType === AssetType.PROCESS_EVIDENCE ? (description ?? null) : null,
        processStep: assetType === AssetType.PROCESS_EVIDENCE ? processStep ?? null : null,
      },
    });

    // 4. 面部特写专属逻辑: 自动选为版权图 (首张), 并从它重新生成缩略图 (覆盖老的三视图缩略图)
    //    创作者可在 UI 上传多张面部特写, 然后用 ⭐ 按钮切换; 切换逻辑见 IpsService.setFaceCloseup
    if (assetType === AssetType.FACE_CLOSEUP) {
      if (!ip.faceCloseupFileId) {
        await this.prisma.ipAsset.update({
          where: { id: ip.id },
          data: { faceCloseupFileId: file.id },
        });
        this.logger.log(`auto-set faceCloseupFileId for ${ip.code} → ${file.id} (first FACE_CLOSEUP)`);
      }
      // 总是用面部特写重生成缩略图 (即使已有, 也升级到人脸版本)
      this.generateThumbnailFromOssKey(ip.code, dir, filenameStr).catch((e) =>
        this.logger.warn(`face-closeup thumbnail regen failed for ${ip.code}: ${e?.message ?? e}`),
      );
    } else if (IMAGE_TYPES.has(assetType) && !ip.thumbnailKey) {
      // 其他图片类型只在还没缩略图时生成 (保持向后兼容, 老 IP 用三视图作缩略图)
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
        // 用 SDK get() 直读 (避开 signatureUrl + response 头的 403 签名 bug,
        // 跟 getContractBuffer / verifyCertObject 同样的处理)
        const res = await this.privateClient.get(key);
        const buf = Buffer.isBuffer(res.content) ? res.content : Buffer.from(res.content as ArrayBuffer);
        const meta = await sharp(buf).metadata();
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
    // 用 SDK get(range) 直读首 N 字节 (避开 signatureUrl + response 头签名 bug)
    const res = await this.privateClient.get(key, { range: `bytes=0-${n - 1}` } as any);
    const buf = Buffer.isBuffer(res.content) ? res.content : Buffer.from(res.content);
    if (buf.length === 0) {
      throw new Error(`OSS HEAD ${key} → 空响应`);
    }
    return buf;
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
   * 公开的 OSS 删除 — 其它 service (如 IpsService.deleteProcessEvidence) 可调用
   * 失败不抛异常,只 warn,让 DB 行能被清理
   */
  async deleteOssObject(key: string): Promise<void> {
    return this.deleteFromOss(key);
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
   * public 包装 — 给 AiService.generateImage 等其它模块用
   */
  async generateThumbnailFromOssKey(ipCode: string, sourceKey: string, hintName: string): Promise<void> {
    // 不要走 signDownloadUrl — 它会塞 x-oss-force-download response header, ali-oss
    // 对这个 header 算的签名跟 OSS 期望的不一致, fetch 必 403 SignatureDoesNotMatch
    // thumbnail regen 是后端→OSS 拉数据(不是浏览器下载), 裸签名 URL 即可
    const url = this.privateClient.signatureUrl(sourceKey, { expires: 300 });
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
   * 下载授权签名 URL (浏览器会弹下载框)
   */
  async signDownloadUrl(ossKey: string, bucket: 'private' | 'contracts' = 'private', filename?: string): Promise<string> {
    const client = bucket === 'contracts' ? this.contractsClient : this.privateClient;
    const response: Record<string, string> = { 'x-oss-force-download': 'true' };
    if (filename) response['response-content-disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`;
    const url = client.signatureUrl(ossKey, { expires: 300, response });
    return url;
  }

  /**
   * 普通 GET-able 签名 URL — 给后端服务或 LLM 拉取内容用 (无 force-download 头)
   * 默认 1 小时有效
   */
  signViewUrl(ossKey: string, bucket: 'public' | 'private' | 'contracts' = 'private', expiresSec = 3600): string {
    const client = bucket === 'contracts' ? this.contractsClient : bucket === 'public' ? this.publicClient : this.privateClient;
    return client.signatureUrl(ossKey, { expires: expiresSec });
  }

  /**
   * 创作者手动指定/切换版权图 (IpAsset.faceCloseupFileId)
   * - fileId 必须是该 IP 下的 FACE_CLOSEUP 类型 IpFile
   * - 自动用新的版权图重新生成缩略图 (覆盖旧的,即使老缩略图来自 THREE_VIEW)
   *
   * 见 [[project-post-mvp-backlog]] #31: 创作者可上传多张 FACE_CLOSEUP, ⭐ 按钮切换
   */
  async setFaceCloseup(ipId: string, fileId: string, creatorId: string): Promise<{ id: string; faceCloseupFileId: string | null }> {
    const ip = await this.prisma.ipAsset.findUnique({ where: { id: ipId } });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== creatorId) throw new ForbiddenException('无权操作此 IP');
    const file = await this.prisma.ipFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('文件不存在');
    if (file.ipId !== ipId) throw new BadRequestException('该文件不属于此 IP');
    if (file.assetType !== AssetType.FACE_CLOSEUP) {
      throw new BadRequestException('该文件不是【面部特写】类型,不能设为版权图');
    }
    const updated = await this.prisma.ipAsset.update({
      where: { id: ipId },
      data: { faceCloseupFileId: fileId },
      select: { id: true, faceCloseupFileId: true },
    });
    // 异步重生成缩略图 (从新版权图)
    this.generateThumbnailFromOssKey(ip.code, file.ossKey, file.originalName).catch((e) =>
      this.logger.warn(`face-closeup switch thumbnail regen failed for ${ip.code}: ${e?.message ?? e}`),
    );
    this.logger.log(`faceCloseupFileId set for ${ip.code} → ${fileId} (creator ${creatorId})`);
    return updated;
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
