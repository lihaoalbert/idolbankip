/**
 * 微信扫码 auth API — W3 W1 D5
 * 调 apiClient (自动带 baseURL / 401 refresh)
 */
import { apiClient } from './client';
import type { UserRole } from '@/stores/auth';

export interface WechatQrUrlResp {
  url: string;
  state: string;
  expiresAt: string;
}

export type WechatPollResp =
  | { status: 'waiting' }
  | { status: 'expired' }
  | { status: 'ok'; token: string; user: any; isNewUser: boolean; needBindPhone?: boolean; bindToken?: string };

export interface WechatExchangeResp {
  status: 'ok';
  user?: any;
  tokens?: { accessToken: string; refreshToken: string; expiresIn: number };
  isNewUser?: boolean;
  needBindPhone?: boolean;
  bindToken?: string;
}

export interface WechatBindResp {
  user: any;
  isNewUser?: boolean;
  tokens?: { accessToken: string; refreshToken: string; expiresIn: number };
}

export async function getQrUrl(): Promise<WechatQrUrlResp> {
  const { data } = await apiClient.get<WechatQrUrlResp>('/auth/wechat/qr-url');
  return data;
}

export async function pollState(state: string): Promise<WechatPollResp> {
  const { data } = await apiClient.get<WechatPollResp>('/auth/wechat/poll', { params: { state } });
  return data;
}

export async function exchange(code: string, state: string): Promise<WechatExchangeResp> {
  const { data } = await apiClient.post<WechatExchangeResp>('/auth/wechat/exchange', { code, state });
  return data;
}

export async function bindWechat(params: {
  wechatCode: string;
  state: string;
  phone?: string;
  phoneCode?: string;
  displayName?: string;
  role?: UserRole;
}): Promise<WechatBindResp> {
  const { data } = await apiClient.post<WechatBindResp>('/auth/wechat/bind', params);
  return data;
}

export async function unbindWechat(): Promise<{ ok: true }> {
  const { data } = await apiClient.post<{ ok: true }>('/auth/wechat/unbind', {});
  return data;
}