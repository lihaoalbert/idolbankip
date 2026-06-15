export interface KycVerifyInput {
  realName: string;
  idNumber: string;
  livenessImageKey?: string;
  phone?: string;
}

export interface KycVerifyResult {
  status: 'APPROVED' | 'REJECTED' | 'PENDING';
  reason?: string;
  refId?: string;
}

export interface KycClient {
  verifyIdentity(input: KycVerifyInput): Promise<KycVerifyResult>;
}

export const KYC_CLIENT = Symbol('KYC_CLIENT');