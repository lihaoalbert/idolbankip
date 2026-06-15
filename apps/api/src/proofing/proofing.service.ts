import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  BLOCKCHAIN_CLIENT,
  BlockchainClient,
  BlockchainProofResult,
} from '@ibi-ren/shared-contracts';

@Injectable()
export class ProofingService {
  private readonly logger = new Logger(ProofingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BLOCKCHAIN_CLIENT) private readonly chain: BlockchainClient,
  ) {}

  /**
   * 计算 IP 资产包的 SHA-256 摘要并上链
   * 摘要 = SHA256( creatorId || sorted(fileSha256) || ISO timestamp )
   */
  async proofIp(ipId: string): Promise<BlockchainProofResult & { payloadHash: string }> {
    const ip = await this.prisma.ipAsset.findUniqueOrThrow({
      where: { id: ipId },
      include: { files: true, creator: true },
    });
    const sortedHashes = ip.files
      .map(f => f.checksumSha256)
      .filter(Boolean)
      .sort();
    const ts = new Date().toISOString();
    const payloadString = [ip.creatorId, ...sortedHashes, ts].join('|');
    const payloadHash = createHash('sha256').update(payloadString).digest('hex');

    const metadata = {
      ipId: ip.id,
      ipCode: ip.code,
      creatorId: ip.creatorId,
      fileCount: ip.files.length,
      timestamp: ts,
    };

    const result = await this.chain.submitHash(payloadHash, metadata);
    await this.prisma.blockchainProof.create({
      data: {
        ipId,
        payloadHash,
        network: result.network,
        txId: result.txId,
        blockHeight: result.blockHeight ? BigInt(result.blockHeight) : null,
      },
    });
    this.logger.log(`Proofed IP ${ip.code} → ${result.txId}`);
    return { ...result, payloadHash };
  }

  async verify(payloadHash: string, txId: string): Promise<boolean> {
    return this.chain.verifyHash(payloadHash, txId);
  }
}