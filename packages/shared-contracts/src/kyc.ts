// KYC 共享契约 — 个人 + 企业 二要素
// 个人走实名核身 (姓名+身份证号),企业走营业执照 OCR + 法人二要素

export interface KycVerifyInput {
  /** 真实姓名 (个人) 或 法人姓名 (企业) */
  realName: string;
  /** 身份证号 (个人) 或 法人身份证号 (企业) */
  idNumber: string;
  /** 活体自拍 OSS key (Phase 2 H5 活体,Phase 1 不用) */
  livenessImageKey?: string;
  /** 联系电话 (可选) */
  phone?: string;
  /** 企业 KYC: 营业执照 OSS key (用于 OCR 后人工核对) */
  licenseImageKey?: string;
  /** 企业 KYC: 营业执照注册号 (OCR 后填入,业务层校验) */
  licenseNo?: string;
  /** 企业 KYC: 公司全称 (OCR 后填入) */
  enterpriseName?: string;
  /** 幂等 ID:同一笔 KYC 多次提交共享同一 bizId,避免阿里云重复计费 */
  bizId?: string;
}

export interface KycVerifyResult {
  status: 'APPROVED' | 'REJECTED' | 'PENDING';
  reason?: string;
  /** 阿里云返回的 VerifyToken / MaterialVerifyId,审计用 */
  refId?: string;
  /** 0=认证不一致 1=认证一致 (阿里云 VerifyMaterial 字段) */
  verifyScore?: number;
}

export interface KycClient {
  verifyIdentity(input: KycVerifyInput): Promise<KycVerifyResult>;
}

export const KYC_CLIENT = Symbol('KYC_CLIENT');

// ====================== OCR 营业执照 ======================

export interface OcrBusinessLicenseInput {
  /** 营业执照图片 URL (HTTP/HTTPS 公网可访问,OSS 签名 URL 可用) */
  imageUrl: string;
}

export interface OcrBusinessLicenseResult {
  /** 公司全称 */
  enterpriseName: string;
  /** 统一社会信用代码 (即注册号) */
  licenseNo: string;
  /** 法人姓名 */
  legalPerson: string;
  /** 公司类型 (有限责任公司 / 股份有限公司...) */
  companyType?: string;
  /** 注册资本 */
  registeredCapital?: string;
  /** 成立日期 YYYY-MM-DD */
  establishedDate?: string;
  /** 营业期限 */
  businessTerm?: string;
  /** 经营范围 */
  businessScope?: string;
  /** 住所/注册地址 */
  address?: string;
  /** OCR 置信度 0-100 */
  confidence?: number;
}

export interface OcrClient {
  recognizeBusinessLicense(input: OcrBusinessLicenseInput): Promise<OcrBusinessLicenseResult>;
}

export const OCR_CLIENT = Symbol('OCR_CLIENT');