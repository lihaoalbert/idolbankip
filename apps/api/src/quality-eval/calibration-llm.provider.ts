/**
 * CalibrationLlmProvider — W2.5 D10-D12 校准脚本专用
 *
 * 继承 LlmConfigService 但只读 env,不查 DB,不依赖 AuthModule 的 controller。
 * 在 CalibrationModule 中以 useClass 形式注入 LlmConfigService token,
 * 让 L1/L2/L4 service 的 DI 拿到正确的实例。
 *
 * 注意: 继承只是为了构造器签名匹配 (PrismaService + ConfigService + AuditService),
 * getActive() 完全 override, 不走 DB。
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmConfigService } from '../llm-config/llm-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CalibrationLlmProvider extends LlmConfigService {
  constructor(
    prisma: PrismaService,
    config: ConfigService,
    audit: AuditService,
  ) {
    super(prisma, config, audit);
  }

  async getActive() {
    const apiKey = this['config'].get<string>('MINIMAX_API_KEY') || '';
    const baseUrl = this['config'].get<string>('MINIMAX_BASE_URL') || 'https://api.minimaxi.com';
    const model = this['config'].get<string>('MINIMAX_MODEL') || 'claude-sonnet-4-6';
    return {
      source: 'env' as const,
      configId: 'calibration-env',
      provider: 'minimax',
      displayName: 'Calibration Env',
      baseUrl,
      model,
      apiKey,
      apiKeyMasked: apiKey ? `***${apiKey.slice(-4)}` : '',
    };
  }
}