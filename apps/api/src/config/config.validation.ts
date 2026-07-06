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

  // W2 #29 推送通知 — 阿里云 DirectMail (邮件)
  // 凭据未配齐时 EmailService 进入 mock 模式 — 只打日志
  ALIYUN_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  ALIYUN_ACCESS_KEY_SECRET: Joi.string().allow('').default(''),
  DIRECTMAIL_ACCOUNT: Joi.string().allow('').default(''),
  DIRECTMAIL_PASSWORD: Joi.string().allow('').default(''),
  DIRECTMAIL_FROM_ALIAS: Joi.string().default('ibi.ren 平台'),
  DIRECTMAIL_REGION: Joi.string().default('cn-shanghai'),

  // W2 #29 推送通知 — 微信模板消息
  // 凭据未配齐时 WechatService 进入 mock 模式 — 只打日志
  WECHAT_APP_ID: Joi.string().allow('').default(''),
  WECHAT_APP_SECRET: Joi.string().allow('').default(''),
  WECHAT_TEMPLATE_ID_BRIEF_PUBLISHED: Joi.string().allow('').default(''),
  WECHAT_TEMPLATE_ID_BRIEF_BUMPED: Joi.string().allow('').default(''),

  // W3 W1: 多通道登录 — 短信 (阿里云 dysmsapi)
  // 凭据未配齐时 SmsService 进入 mock 模式 — 后端日志输出 code
  SMS_DRIVER: Joi.string().valid('mock', 'aliyun').default('mock'),
  SMS_LOG_CODE: Joi.boolean().default(false), // dev only — 日志打印明文 code
  SMS_CODE_TTL_SECONDS: Joi.number().default(300),
  SMS_CODE_LENGTH: Joi.number().default(6),
  SMS_THROTTLE_SECONDS: Joi.number().default(60),  // 同号最小发送间隔
  SMS_MAX_DAILY_PER_PHONE: Joi.number().default(10),
  SMS_MAX_ATTEMPTS: Joi.number().default(5),  // 单码最大错试次数
  ALIYUN_SMS_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  ALIYUN_SMS_ACCESS_KEY_SECRET: Joi.string().allow('').default(''),
  ALIYUN_SMS_SIGN_NAME: Joi.string().default('ibi.ren'),
  ALIYUN_SMS_TEMPLATE_CODE_LOGIN: Joi.string().allow('').default(''),

  // W3 W1: 多通道登录 — 微信开放平台 OAuth (网站应用, snsapi_login)
  // 真 driver 需 ICP 备案完成 + redirect_uri 已在开放平台后台配置
  WECHAT_OAUTH_DRIVER: Joi.string().valid('mock', 'real').default('mock'),
  WECHAT_OAUTH_APP_ID: Joi.string().allow('').default(''),
  WECHAT_OAUTH_APP_SECRET: Joi.string().allow('').default(''),
  WECHAT_OAUTH_REDIRECT_URI: Joi.string().uri().default('https://ibi.ren/api/v1/auth/wechat/callback'),

  // W3 W1: 多通道登录 — 手机号格式
  PHONE_REGEX: Joi.string().default('^1[3-9]\\d{9}$'),

  // DashScope (阿里云百炼) — image gen + vision
  // 之前 imageGen 静默读 env 无 Joi 校验(隐藏坑),Track B 补上
  DASHSCOPE_API_KEY: Joi.string().allow('').default(''),
  DASHSCOPE_MODEL: Joi.string().default('wan2.7-image-pro'),
  // Track B 新增:Qwen-VL 视觉模型(参考图反推 L1-L6 用)
  DASHSCOPE_VL_MODEL: Joi.string().default('qwen-vl-plus'),

  // 种子
  SEED_ADMIN_EMAIL: Joi.string().email().default('admin@ibi.ren'),
  SEED_ADMIN_PASSWORD: Joi.string().min(8).default('ChangeMe!2026'),

  // 功能开关 — Blueprint Wizard (Phase 1 Layered Prompt Generator)
  // false 时所有 /api/v1/blueprint/* 返 404,前端路由 redirect 到 /creator
  // 默认 ON — 2026-06-24 Phase C 上线时启用
  BLUEPRINT_WIZARD_ENABLED: Joi.boolean().default(true),
});