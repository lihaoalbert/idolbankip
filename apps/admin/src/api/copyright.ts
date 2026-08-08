import { apiClient } from './client';

/**
 * #30.6.26 Admin 著作权登记队列 API.
 * 镜像 creator 端的 CopyrightService,只对接 /admin/copyright-reg/* endpoints.
 */

export type RegistrationStage =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'UNDER_REVIEW'
  | 'CERTIFIED'
  | 'REJECTED'
  | 'WITHDRAWN';

export interface CopyrightQueueItem {
  id: string;
  ipId: string;
  ownerName: string;
  ownerType: 'INDIVIDUAL' | 'COMPANY';
  registrationType: 'NATIONAL' | 'PROVINCIAL';
  registrationRegion: string;
  workflowStage: RegistrationStage;
  submittedAt: string | null;
  acceptedAt: string | null;
  reviewedAt: string | null;
  certifiedAt: string | null;
  withdrawnAt: string | null;
  applicationNo: string | null;
  certificateNo: string | null;
  rejectionReason: string | null;
  creatorAgentFeeFen: number | null;
  ip: {
    id: string;
    code: string;
    displayName: string;
    status: string;
    officialCertNo: string | null;
    creator: { id: string; email: string; displayName: string };
  };
}

export interface CopyrightQueueResponse {
  items: CopyrightQueueItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CopyrightDetailResponse extends CopyrightQueueItem {
  ip: CopyrightQueueItem['ip'] & {
    creator: { id: string; email: string; displayName: string; phone: string | null };
    files: Array<{
      id: string;
      assetType: string;
      originalName: string;
      ossKey: string;
      mimeType: string;
      sizeBytes: number;
    }>;
    faceCloseupFile: { id: string; ossKey: string; mimeType: string } | null;
  };
}

export const copyrightAdminApi = {
  queue: (params?: { stage?: RegistrationStage; page?: number; pageSize?: number }) =>
    apiClient.get<CopyrightQueueResponse>('/admin/copyright-reg/queue', { params }).then((r) => r.data),

  detail: (ipId: string) =>
    apiClient.get<CopyrightDetailResponse>(`/admin/copyright-reg/${ipId}`).then((r) => r.data),

  accept: (ipId: string, applicationNo: string) =>
    apiClient.post(`/admin/copyright-reg/${ipId}/accept`, { applicationNo }).then((r) => r.data),

  underReview: (ipId: string) =>
    apiClient.post(`/admin/copyright-reg/${ipId}/under-review`).then((r) => r.data),

  certify: (ipId: string, certificateNo: string) =>
    apiClient.post(`/admin/copyright-reg/${ipId}/certify`, { certificateNo }).then((r) => r.data),

  reject: (ipId: string, reason: string) =>
    apiClient.post(`/admin/copyright-reg/${ipId}/reject`, { reason }).then((r) => r.data),

  /** 复用 creator 端 PDF endpoint(同样能拿到签名 URL) */
  pdfUrl: (ipId: string) =>
    apiClient.get<{ url: string; cached: boolean }>(`/ips/${ipId}/copyright-reg/pdf`).then((r) => r.data),
};