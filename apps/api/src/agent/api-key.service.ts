import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateApiKeyParams {
  userId: string;
  label: string;
  scopes?: string[];
  expiresAt?: Date;
}

export interface CreatedApiKey {
  id: string;
  /** 明文 key — 仅返回一次, 后续无法再查看 */
  plainKey: string;
  keyPrefix: string;
  label: string;
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
}

const DEFAULT_SCOPES = ['ips:create', 'ips:upload'];
const KEY_PREFIX = 'ibi_sk_';

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 生成 API key — 明文仅返回一次, DB 存 sha256 hash
   * 明文格式: ibi_sk_{32 chars random} = 39 chars total
   */
  async create(params: CreateApiKeyParams): Promise<CreatedApiKey> {
    const random = randomBytes(24).toString('base64url'); // 32 chars
    const plainKey = `${KEY_PREFIX}${random}`;
    const keyHash = createHash('sha256').update(plainKey).digest('hex');
    const keyPrefix = plainKey.slice(0, 12);
    const scopes = params.scopes && params.scopes.length > 0 ? params.scopes : DEFAULT_SCOPES;

    const record = await this.prisma.apiKey.create({
      data: {
        userId: params.userId,
        keyHash,
        keyPrefix,
        label: params.label,
        scopes: scopes.join(','),
        expiresAt: params.expiresAt ?? null,
      },
    });
    this.logger.log(`ApiKey created: ${keyPrefix}... (label=${params.label}) for user ${params.userId}`);
    return {
      id: record.id,
      plainKey,
      keyPrefix,
      label: record.label,
      scopes,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }

  async listForUser(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        keyPrefix: true,
        label: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
  }

  async revoke(id: string, userId: string): Promise<void> {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('API key 不存在');
    if (key.userId !== userId) throw new ForbiddenException('无权操作');
    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    this.logger.log(`ApiKey revoked: ${key.keyPrefix}... (id=${id})`);
  }
}
