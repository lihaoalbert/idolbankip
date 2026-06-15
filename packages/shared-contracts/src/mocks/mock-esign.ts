import { customAlphabet } from 'nanoid';
import type {
  ESignClient,
  ESignCreateFlowInput,
  ESignFlowInfo,
  ESignSignerRole,
  ESignStatus,
} from '../esign';

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

interface MockFlow {
  input: ESignCreateFlowInput;
  signed: Record<ESignSignerRole, boolean>;
  fullySignedAt?: Date;
}

/**
 * 模拟法大大/腾讯电子签。所有签署状态保存在内存,重启即丢。
 * 真实接入时把 MockFadadaClient 换成 FadadaRealClient,实现接口即可。
 */
export class MockFadadaClient implements ESignClient {
  private flows = new Map<string, MockFlow>();

  async createFlow(input: ESignCreateFlowInput): Promise<ESignFlowInfo> {
    const flowId = `mock-flow-${nano()}`;
    this.flows.set(flowId, {
      input,
      signed: { BUYER: false, PLATFORM: false },
    });
    return {
      flowId,
      signingUrl: `https://mock.fadada.local/sign/${flowId}`,
      createdAt: new Date(),
    };
  }

  async getSignUrl(flowId: string, role: ESignSignerRole): Promise<string> {
    return `https://mock.fadada.local/sign/${flowId}?as=${role}`;
  }

  async markSigned(flowId: string, role: ESignSignerRole): Promise<void> {
    const flow = this.flows.get(flowId);
    if (!flow) throw new Error(`Flow ${flowId} not found`);
    flow.signed[role] = true;
    if (flow.signed.BUYER && flow.signed.PLATFORM) {
      flow.fullySignedAt = new Date();
    }
  }

  async isFullySigned(flowId: string): Promise<ESignStatus> {
    const flow = this.flows.get(flowId);
    if (!flow) {
      return { signed: false, buyerSigned: false, platformSigned: false };
    }
    return {
      signed: flow.signed.BUYER && flow.signed.PLATFORM,
      buyerSigned: flow.signed.BUYER,
      platformSigned: flow.signed.PLATFORM,
      signedAt: flow.fullySignedAt,
    };
  }
}