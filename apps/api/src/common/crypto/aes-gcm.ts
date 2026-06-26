/**
 * AES-256-GCM 对称加密 — 用于在 DB 中保存 LLM provider 的 API key。
 *
 * 主密钥来源: 环境变量 LLM_KEY_ENCRYPTION_KEY (32 字节, base64 编码)
 * IV: 12 字节随机, 每次加密新生成
 * Auth tag: 16 字节, 跟密文一起存 (完整性校验)
 *
 * 输出格式: { ciphertext: Buffer, iv: hex string, tag: hex string }
 *
 * 设计取舍:
 * - 不存 key 的 hash (用 GCM 的 auth tag 即可验完整性和源)
 * - 不存 key 的明文前缀 (UI 用 apiKeyLast4 字段单独存)
 * - 失败抛 Error, 让调用方决定怎么报 (AI 服务 503 / 400 等)
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function getKey(): Buffer {
  const b64 = process.env.LLM_KEY_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      'LLM_KEY_ENCRYPTION_KEY 未配置. 用 `openssl rand -base64 32` 生成 32 字节密钥, ' +
      '写入 .env 和 ECS /opt/ibiren/.env.',
    );
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `LLM_KEY_ENCRYPTION_KEY 长度 ${key.length} 字节, 应为 ${KEY_BYTES}. ` +
      `重新生成: openssl rand -base64 32`,
    );
  }
  return key;
}

export interface AesGcmCipher {
  /** base64 编码的密文 (Prisma @db.Text 字段,存字符串比 Buffer 方便) */
  ciphertext: string;
  iv: string;   // hex
  tag: string;  // hex
}

export function encrypt(plaintext: string): AesGcmCipher {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== TAG_BYTES) {
    throw new Error(`unexpected GCM tag length ${tag.length}`);
  }
  return {
    ciphertext: ct.toString('base64'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

export function decrypt(ciphertextB64: string, ivHex: string, tagHex: string): string {
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  if (iv.length !== IV_BYTES) throw new Error(`IV length ${iv.length}, expected ${IV_BYTES}`);
  if (tag.length !== TAG_BYTES) throw new Error(`GCM tag length ${tag.length}, expected ${TAG_BYTES}`);
  const ct = Buffer.from(ciphertextB64, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}