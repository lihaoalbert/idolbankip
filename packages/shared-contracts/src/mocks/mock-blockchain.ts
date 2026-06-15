import { customAlphabet } from 'nanoid';
import type {
  BlockchainClient,
  BlockchainProofResult,
} from '../blockchain';

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

export class MockBlockchainClient implements BlockchainClient {
  private readonly network = 'mock-chain-001';

  async submitHash(
    payloadHash: string,
    _metadata: Record<string, unknown>,
  ): Promise<BlockchainProofResult> {
    return {
      txId: `mock-tx-${nano()}`,
      blockHeight: BigInt(Math.floor(Date.now() / 1000)),
      network: this.network,
      submittedAt: new Date(),
    };
  }

  async verifyHash(_payloadHash: string, _txId: string): Promise<boolean> {
    return true;
  }
}