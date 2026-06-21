import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  API_PORT: Joi.number().default(3000),

  // DB
  DATABASE_URL: Joi.string().required(),

  // Redis (可选)
  REDIS_URL: Joi.string().optional(),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_TTL: Joi.string().default('30d'),

  // OSS
  OSS_REGION: Joi.string().default('oss-cn-hangzhou'),
  OSS_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  OSS_ACCESS_KEY_SECRET: Joi.string().allow('').default(''),
  OSS_BUCKET_PUBLIC: Joi.string().default('ibi-ren-dev-public'),
  OSS_BUCKET_PRIVATE: Joi.string().default('ibi-ren-dev-private'),
  OSS_BUCKET_CONTRACTS: Joi.string().default('ibi-ren-dev-contracts'),
  OSS_CALLBACK_SECRET: Joi.string().default('oss-callback-secret'),

  // Drivers
  BLOCKCHAIN_DRIVER: Joi.string().valid('mock', 'antchain', 'tencent').default('mock'),
  ESIGN_DRIVER: Joi.string().valid('mock', 'fadada', 'esign').default('mock'),
  PAYMENT_DRIVER: Joi.string().valid('mock', 'alipay', 'wechat').default('mock'),
  KYC_DRIVER: Joi.string().valid('mock', 'aliyun', 'aliyun_idverify').default('mock'),
  OCR_DRIVER: Joi.string().valid('mock', 'aliyun').default('mock'),
  WATERMARK_DRIVER: Joi.string().valid('mock', 'opencv_dwt_svd').default('mock'),
  MODERATION_DRIVER: Joi.string().valid('mock', 'real').default('mock'),

  // LLM (MiniMax M3, Anthropic 协议兼容, #30.6)
  MINIMAX_API_KEY: Joi.string().allow('').default(''),
  MINIMAX_BASE_URL: Joi.string().uri().default('https://api.minimaxi.com'),
  MINIMAX_MODEL: Joi.string().default('claude-sonnet-4-6'),

  // 种子
  SEED_ADMIN_EMAIL: Joi.string().email().default('admin@ibi.ren'),
  SEED_ADMIN_PASSWORD: Joi.string().min(8).default('ChangeMe!2026'),
});