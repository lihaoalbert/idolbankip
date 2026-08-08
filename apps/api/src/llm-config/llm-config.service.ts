/**
 * LlmConfigService — 从 LlmProviderConfig 表读 LLM 配置 (apiKey AES-GCM 加密).
 *
 * 设计要点:
 * - 单 active 策略: schema 上 @@unique([activeAt]) 保证 active 行严格唯一
 * - 5 分钟内存 cache: 减少 DB 读取 + decrypt 开销
 * - 不持有解密后的 key 长生命周期: 每次 getActive 都重新解密, 减小密钥内存暴露面
 * - 切换 active 后: cache TTL 内旧请求继续走旧 key, 过了 TTL 自然走新 key (符合用户决策 "新请求走新, 旧请求继续旧")
 *
 * DB 为空时 fallback 到 env (MINIMAX_API_KEY/MINIMAX_BASE_URL/MINIMAX_MODEL):
 *   - 让本地第一次启动 + 部署后第一次启动都能跑 (零配置即可用占位符)
 *   - env fallback 标记 isActive=true 但不入库 (transient, 无 audit log)
 *   - 真实使用场景: seed 一次后 DB 就有行, env 永远是兜底
 *
 * 注意: AiService 不会直接用本 service 的 client, 而是每次从 getActive() 拿到 {apiKey, baseUrl, model}
 *       自己 new Anthropic(). 这样切换 active 后旧的 Anthropic 实例不会被清掉 (自然过期).
 *       AiService 内部可以按 configId cache 一份 client 复用 (避免每请求都重建).
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { decrypt, encrypt } from '../common/crypto/aes-gcm';

const CACHE_TTL_MS = 5 * 60_000;

export interface LlmResolvedConfig {
  /** 来源: 'db' (DB active 行) | 'env' (env fallback, DB 空) */
  source: 'db' | 'env';
  /** DB 行 id, env 时为 'env' */
  configId: string;
  provider: string;
  displayName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  /** 给 UI 显示: sk-***xxxx (永远不返 apiKey 明文) */
  apiKeyMasked: string;
}

export interface LlmConfigRow {
  id: string;
  provider: string;
  displayName: string;
  baseUrl: string;
  model: string;
  apiKeyLast4: string;
  isActive: boolean;
  activeAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
}

@Injectable()
export class LlmConfigService {
  private readonly logger = new Logger(LlmConfigService.name);
  private cached: { value: LlmResolvedConfig; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 取当前 active 配置 (DB 优先, env 兜底). 内部 5min 内存 cache.
   * 找不到任何配置 → 抛 503 (调用方一般包成 ServiceUnavailableException)
   */
  async getActive(): Promise<LlmResolvedConfig> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.value;
    }
    const value = await this.resolveActiveFromDbOrEnv();
    this.cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  }

  /**
   * 强制下次 getActive 走 DB (任何写操作后调一次)
   */
  invalidate(): void {
    this.cached = null;
  }

  /**
   * 列出所有配置 (管理用, 包含 active 标记; 不返 apiKey 明文)
   */
  async list(): Promise<LlmConfigRow[]> {
    const rows = await this.prisma.llmProviderConfig.findMany({
      orderBy: [{ activeAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toRow);
  }

  async getById(id: string): Promise<LlmConfigRow> {
    const r = await this.prisma.llmProviderConfig.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('LLM 配置不存在');
    return toRow(r);
  }

  async getDecryptedApiKey(id: string): Promise<string> {
    const r = await this.prisma.llmProviderConfig.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('LLM 配置不存在');
    return decrypt(r.apiKeyEncrypted, r.apiKeyIv, r.apiKeyTag);
  }

  /**
   * 创建新配置 (不入 active). 默认 isActive=false, activeAt=null.
   * 如果传 setActive=true 则同时调 setActive (同一事务保证原子).
   */
  async create(input: {
    provider: string;
    displayName: string;
    baseUrl: string;
    model: string;
    apiKey: string;
    note?: string | null;
    setActive?: boolean;
    actorId?: string;
  }): Promise<LlmConfigRow> {
    if (!input.apiKey || input.apiKey.length < 8) {
      throw new BadRequestException('API key 太短 (至少 8 字符)');
    }
    const { ciphertext, iv, tag } = encrypt(input.apiKey);
    const last4 = input.apiKey.slice(-4);

    return this.prisma.$transaction(async (tx) => {
      const r = await tx.llmProviderConfig.create({
        data: {
          provider: input.provider,
          displayName: input.displayName,
          baseUrl: input.baseUrl,
          model: input.model,
          apiKeyEncrypted: ciphertext,
          apiKeyIv: iv,
          apiKeyTag: tag,
          apiKeyLast4: last4,
          isActive: false,
          activeAt: null,
          note: input.note ?? null,
          updatedBy: input.actorId ?? null,
        },
      });
      if (input.setActive) {
        await this.activateInTx(tx, r.id);
      }
      this.invalidate();
      await this.audit.log({
        actorId: input.actorId,
        action: 'LLM_CONFIG_CREATED',
        targetType: 'LlmProviderConfig',
        targetId: r.id,
        payload: { provider: input.provider, displayName: input.displayName, setActive: !!input.setActive },
      });
      const fresh = await tx.llmProviderConfig.findUnique({ where: { id: r.id } });
      return toRow(fresh!);
    });
  }

  /**
   * 更新配置. apiKey 不传则保留旧 key, 传则重新加密.
   * 不动 active 状态 (用 setActive 切).
   */
  async update(input: {
    id: string;
    provider?: string;
    displayName?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    note?: string | null;
    actorId?: string;
  }): Promise<LlmConfigRow> {
    const cur = await this.prisma.llmProviderConfig.findUnique({ where: { id: input.id } });
    if (!cur) throw new NotFoundException('LLM 配置不存在');

    const data: any = {
      updatedBy: input.actorId ?? null,
    };
    if (input.provider !== undefined) data.provider = input.provider;
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl;
    if (input.model !== undefined) data.model = input.model;
    if (input.note !== undefined) data.note = input.note;

    if (input.apiKey) {
      if (input.apiKey.length < 8) throw new BadRequestException('API key 太短 (至少 8 字符)');
      const { ciphertext, iv, tag } = encrypt(input.apiKey);
      data.apiKeyEncrypted = ciphertext;
      data.apiKeyIv = iv;
      data.apiKeyTag = tag;
      data.apiKeyLast4 = input.apiKey.slice(-4);
    }

    const r = await this.prisma.llmProviderConfig.update({
      where: { id: input.id },
      data,
    });
    this.invalidate();
    await this.audit.log({
      actorId: input.actorId,
      action: 'LLM_CONFIG_UPDATED',
      targetType: 'LlmProviderConfig',
      targetId: input.id,
      payload: {
        changed: Object.keys(data).filter((k) => k !== 'updatedBy'),
        apiKeyChanged: !!input.apiKey,
      },
    });
    return toRow(r);
  }

  /**
   * 删除配置. active 行不能删 (先切到别的).
   */
  async delete(id: string, actorId?: string): Promise<{ ok: true }> {
    const cur = await this.prisma.llmProviderConfig.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('LLM 配置不存在');
    if (cur.isActive) {
      throw new ConflictException('当前 active 配置不能删, 请先切换到别的配置');
    }
    await this.prisma.llmProviderConfig.delete({ where: { id } });
    this.invalidate();
    await this.audit.log({
      actorId,
      action: 'LLM_CONFIG_DELETED',
      targetType: 'LlmProviderConfig',
      targetId: id,
      payload: { provider: cur.provider, displayName: cur.displayName },
    });
    return { ok: true };
  }

  /**
   * 切换 active. 事务: 旧 active activeAt=null → 新 active activeAt=now().
   * @@unique([activeAt]) 保证只有一个 activeAt 非 null.
   */
  async setActive(id: string, actorId?: string): Promise<LlmConfigRow> {
    return this.prisma.$transaction(async (tx) => {
      const cur = await tx.llmProviderConfig.findUnique({ where: { id } });
      if (!cur) throw new NotFoundException('LLM 配置不存在');
      await this.activateInTx(tx, id);
      this.invalidate();
      await this.audit.log({
        actorId,
        action: 'LLM_CONFIG_ACTIVATED',
        targetType: 'LlmProviderConfig',
        targetId: id,
        payload: { provider: cur.provider, displayName: cur.displayName },
      });
      const fresh = await tx.llmProviderConfig.findUnique({ where: { id } });
      return toRow(fresh!);
    });
  }

  /**
   * 测试一个配置的连通性 (decrypt + 极简 messages call).
   * 不影响 active 状态.
   */
  async testConnection(id: string): Promise<{ ok: boolean; latencyMs: number; model: string; error?: string }> {
    const r = await this.prisma.llmProviderConfig.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('LLM 配置不存在');
    const apiKey = decrypt(r.apiKeyEncrypted, r.apiKeyIv, r.apiKeyTag);
    const t0 = Date.now();
    try {
      const client = new Anthropic({ apiKey, baseURL: r.baseUrl });
      await client.messages.create({
        model: r.model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { ok: true, latencyMs: Date.now() - t0, model: r.model };
    } catch (e: any) {
      const msg = e?.message || String(e);
      this.logger.warn(`testConnection ${id} failed: ${msg.slice(0, 200)}`);
      return { ok: false, latencyMs: Date.now() - t0, model: r.model, error: msg.slice(0, 300) };
    }
  }

  // ===== private =====

  private async activateInTx(tx: any, id: string): Promise<void> {
    const now = new Date();
    // 旧 active 清掉
    await tx.llmProviderConfig.updateMany({
      where: { isActive: true, NOT: { id } },
      data: { isActive: false, activeAt: null },
    });
    // 新 active 设上
    await tx.llmProviderConfig.update({
      where: { id },
      data: { isActive: true, activeAt: now },
    });
  }

  private async resolveActiveFromDbOrEnv(): Promise<LlmResolvedConfig> {
    const active = await this.prisma.llmProviderConfig.findFirst({
      where: { isActive: true },
    });
    if (active) {
      const apiKey = decrypt(active.apiKeyEncrypted, active.apiKeyIv, active.apiKeyTag);
      return {
        source: 'db',
        configId: active.id,
        provider: active.provider,
        displayName: active.displayName,
        baseUrl: active.baseUrl,
        model: active.model,
        apiKey,
        apiKeyMasked: maskKey(active.apiKeyLast4),
      };
    }
    // DB 没 active → env fallback
    const envKey = this.config.get<string>('MINIMAX_API_KEY', '');
    if (envKey && envKey !== 'sk-api-PLACEHOLDER') {
      return {
        source: 'env',
        configId: 'env',
        provider: 'minimax',
        displayName: 'env-fallback (MINIMAX_*)',
        baseUrl: this.config.get<string>('MINIMAX_BASE_URL', 'https://api.minimaxi.com'),
        model: this.config.get<string>('MINIMAX_MODEL', 'claude-sonnet-4-6'),
        apiKey: envKey,
        apiKeyMasked: maskKey(envKey.slice(-4)),
      };
    }
    throw new ServiceUnavailableException(
      'LLM 服务未配置: DB 无 active 行, 且 env MINIMAX_API_KEY 缺失或为占位符. 请 admin 在 /settings/llm 添加配置.',
    );
  }
}

function toRow(r: any): LlmConfigRow {
  return {
    id: r.id,
    provider: r.provider,
    displayName: r.displayName,
    baseUrl: r.baseUrl,
    model: r.model,
    apiKeyLast4: r.apiKeyLast4,
    isActive: r.isActive,
    activeAt: r.activeAt,
    note: r.note,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    updatedBy: r.updatedBy,
  };
}

function maskKey(last4: string): string {
  if (!last4) return '••••••••';
  return `sk-••••••••${last4}`;
}