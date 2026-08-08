/**
 * scripts/seed-llm-config.ts — 把当前 env 里的 MINIMAX_* 加密入库作为 active LLM 配置
 *
 * 跑法:
 *   bash scripts/seed-deploy.sh llm-config    # ECS (source /opt/ibiren/.env, tsx 跑)
 *   cd apps/api && set -a && source .env && set +a && pnpm exec tsx ../../scripts/seed-llm-config.ts
 *
 * 行为:
 *   1. 读 process.env.MINIMAX_API_KEY/MINIMAX_BASE_URL/MINIMAX_MODEL
 *   2. 如果 MINIMAX_API_KEY 缺失或 = 'sk-api-PLACEHOLDER' → abort (本地开发 stub, 不应该入库)
 *   3. AES-256-GCM 加密 key (主密钥从 LLM_KEY_ENCRYPTION_KEY)
 *   4. transaction: 把现有所有 active 行 activeAt=null, 新行 activeAt=now()
 *   5. 写 audit log (action=LLM_CONFIG_SEEDED, actorId=null 因为是脚本)
 *
 * 幂等: 重复跑会清掉旧 active + 写新 active, 不会重复插入 (因为本脚本不创建新行, 只 upsert 一条 "minimax" 行).
 *      第一次跑会创建一行, 之后跑会更新同一行 (按 provider+displayName 唯一).
 *
 * 注意: 不替代 admin UI 的"创建新配置". 这里是"把 .env 配置持久化到 DB"的一次性种子.
 *       之后 admin 可以在 /settings/llm 添加备用 provider / 切 active / 删除旧行.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createCipheriv, randomBytes } from 'crypto';

const prisma = new PrismaClient();

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function getKey(): Buffer {
  const b64 = process.env.LLM_KEY_ENCRYPTION_KEY;
  if (!b64) throw new Error('LLM_KEY_ENCRYPTION_KEY 未配置, 无法加密 apiKey');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error(`LLM_KEY_ENCRYPTION_KEY 长度 ${key.length} 字节, 应为 32. 重新生成: openssl rand -base64 32`);
  }
  return key;
}

function encryptKey(plaintext: string): { ciphertext: string; iv: string; tag: string } {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // base64 字符串 (Prisma @db.Text 字段, 存 string 比 Buffer 方便, 与 service 实现一致)
  return { ciphertext: ct.toString('base64'), iv: iv.toString('hex'), tag: tag.toString('hex') };
}

async function main() {
  const apiKey = process.env.MINIMAX_API_KEY;
  const baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com';
  const model = process.env.MINIMAX_MODEL || 'claude-sonnet-4-6';

  if (!apiKey || apiKey === 'sk-api-PLACEHOLDER') {
    console.error('❌ MINIMAX_API_KEY 缺失或为占位符, 不应入库.');
    console.error('   请在 .env / /opt/ibiren/.env 里填真 key 后再跑.');
    console.error('   本地开发请跳过此 seed, AiService 会自动 fallback 到 env MINIMAX_API_KEY.');
    process.exit(1);
  }

  console.log(`[seed-llm-config] baseUrl=${baseUrl} model=${model} apiKeyLen=${apiKey.length} (last4=${apiKey.slice(-4)})`);
  const { ciphertext, iv, tag } = encryptKey(apiKey);
  console.log(`[seed-llm-config] encrypted: ciphertext=${ciphertext.length} chars (base64) iv=${IV_BYTES}B tag=16B`);

  await prisma.$transaction(async (tx) => {
    // 1. 清掉当前所有 active
    const cleared = await tx.llmProviderConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false, activeAt: null },
    });
    if (cleared.count > 0) {
      console.log(`[seed-llm-config] 清掉 ${cleared.count} 个旧 active 行`);
    }

    // 2. upsert (按 provider+displayName 唯一, 用 @@unique 之前需要先在 schema 上加;
    //    当前 schema 没有, 所以用 findFirst + create/update 二选一)
    const existing = await tx.llmProviderConfig.findFirst({
      where: { provider: 'minimax', displayName: 'MiniMax 生产 (seed)' },
    });

    const now = new Date();
    if (existing) {
      await tx.llmProviderConfig.update({
        where: { id: existing.id },
        data: {
          baseUrl,
          model,
          apiKeyEncrypted: ciphertext,
          apiKeyIv: iv,
          apiKeyTag: tag,
          apiKeyLast4: apiKey.slice(-4),
          isActive: true,
          activeAt: now,
          updatedBy: 'seed',
          note: '由 scripts/seed-llm-config.ts 写入. admin 可在 /settings/llm 修改.',
        },
      });
      console.log(`[seed-llm-config] 更新已有行 ${existing.id} → active`);
    } else {
      const r = await tx.llmProviderConfig.create({
        data: {
          provider: 'minimax',
          displayName: 'MiniMax 生产 (seed)',
          baseUrl,
          model,
          apiKeyEncrypted: ciphertext,
          apiKeyIv: iv,
          apiKeyTag: tag,
          apiKeyLast4: apiKey.slice(-4),
          isActive: true,
          activeAt: now,
          updatedBy: 'seed',
          note: '由 scripts/seed-llm-config.ts 写入. admin 可在 /settings/llm 修改.',
        },
      });
      console.log(`[seed-llm-config] 创建新行 ${r.id} → active`);
    }
  });

  // audit log (不参与事务, 失败也无所谓 — seed 不阻塞主流程)
  try {
    await prisma.auditLog.create({
      data: {
        action: 'LLM_CONFIG_SEEDED',
        targetType: 'LlmProviderConfig',
        targetId: 'seed',
        payload: { provider: 'minimax', model, baseUrl },
      },
    });
  } catch (e) {
    console.warn('[seed-llm-config] audit log 失败 (非阻塞):', e);
  }

  console.log('[seed-llm-config] ✅ 完成. 现在 AiService 会从 DB 读 active 行, 不再走 env fallback.');
}

main()
  .catch((e) => {
    console.error('[seed-llm-config] ❌ 失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());