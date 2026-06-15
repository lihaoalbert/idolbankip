export type ESignSignerRole = 'BUYER' | 'PLATFORM';

export interface ESignSigner {
  role: ESignSignerRole;
  name: string;
  idCard?: string;
  phone?: string;
  email?: string;
}

export interface ESignCreateFlowInput {
  templateCode: string;
  contractTitle: string;
  variables: Record<string, unknown>;
  signers: ESignSigner[];
  callbackUrl?: string;
}

export interface ESignFlowInfo {
  flowId: string;
  signingUrl: string;
  createdAt: Date;
}

export interface ESignStatus {
  signed: boolean;
  buyerSigned: boolean;
  platformSigned: boolean;
  signedAt?: Date;
}

export interface ESignClient {
  createFlow(input: ESignCreateFlowInput): Promise<ESignFlowInfo>;
  getSignUrl(flowId: string, role: ESignSignerRole): Promise<string>;
  markSigned(flowId: string, role: ESignSignerRole): Promise<void>;
  isFullySigned(flowId: string): Promise<ESignStatus>;
}

export const ESIGN_CLIENT = Symbol('ESIGN_CLIENT');