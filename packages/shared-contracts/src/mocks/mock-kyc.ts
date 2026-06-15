import type { KycClient, KycVerifyInput, KycVerifyResult } from '../kyc';

/**
 * Mock KYC: 提交即 APPROVED (允许手动审核)。
 * 真实接入时用阿里云 IDVerify / 腾讯云慧眼活体检测。
 */
export class MockKycClient implements KycClient {
  async verifyIdentity(input: KycVerifyInput): Promise<KycVerifyResult> {
    const idLooksValid = /^\d{15}|\d{17}[\dXx]$/.test(input.idNumber);
    if (!idLooksValid) {
      return {
        status: 'REJECTED',
        reason: '身份证号格式不正确',
      };
    }
    if (!input.realName || input.realName.length < 2) {
      return {
        status: 'REJECTED',
        reason: '姓名不合法',
      };
    }
    return {
      status: 'APPROVED',
      refId: `mock-kyc-${Date.now()}`,
    };
  }
}