// 区块链存证客户端接口
export interface BlockchainProofResult {
  txId: string;
  blockHeight: number | null;
  network: string;
  submittedAt: Date;
}

export interface BlockchainClient {
  submitHash(
    payloadHash: string,
    metadata: Record<string, unknown>,
  ): Promise<BlockchainProofResult>;
  verifyHash(payloadHash: string, txId: string): Promise<boolean>;
}

export const BLOCKCHAIN_CLIENT = Symbol('BLOCKCHAIN_CLIENT');