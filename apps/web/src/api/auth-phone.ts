/**
 * 手机验证码 auth API — W3 W1 D4
 * 调 apiClient (自动带 baseURL / 401 refresh)
 */
import { apiClient } from './client';
import type { UserRole } from '@/stores/auth';

export interface PhoneSendCodeResp {
  ok: true;
  ttlSec: number;
}

export interface PhoneLoginResp {
  user: { id: string; email: string; displayName: string; roles: UserRole[]; phone?: string };
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
  /** 首次注册缺 role+displayName 时返 */
  needRegister?: boolean;
}

export async function sendPhoneCode(phone: string): Promise<PhoneSendCodeResp> {
  const { data } = await apiClient.post<PhoneSendCodeResp>('/auth/phone/send-code', { phone });
  return data;
}

export async function phoneLogin(
  phone: string,
  code: string,
  opts: { role?: UserRole; displayName?: string } = {},
): Promise<PhoneLoginResp> {
  const { data } = await apiClient.post<PhoneLoginResp>('/auth/phone/login', {
    phone,
    code,
    role: opts.role,
    displayName: opts.displayName,
  });
  return data;
}
