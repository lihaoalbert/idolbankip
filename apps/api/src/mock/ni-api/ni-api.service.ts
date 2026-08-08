import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MOCK_IPS,
  MOCK_CHARACTERS,
  MOCK_ASSETS,
  MOCK_NI_JWT_SECRET,
  MOCK_USER_ID,
  MOCK_USER_EMAIL,
  MockIp,
} from './fixtures';

export interface ListIpsResult {
  items: MockIp[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface DetailResult {
  id: string;
  name: string;
  avatar_url: string;
  preview_url: string;
  character: (typeof MOCK_CHARACTERS)[string];
  license: {
    type: MockIp['license_type'];
    scope: string;
    allowed_platforms: string[];
    download_quota: number;
    download_used: number;
    expires_at: string | null;
    can_offline_use: boolean;
  };
  assets: (typeof MOCK_ASSETS)[string];
}

export interface LicenseResult {
  valid: boolean;
  type: MockIp['license_type'];
  scope: string;
  download_quota_remaining: number;
  expires_at: string | null;
  can_offline_use: boolean;
}

export interface SignedUrlResult {
  url: string;
  expires_at: string;
  expires_in_seconds: number;
}

const DOWNLOAD_QUOTA: Record<MockIp['license_type'], number> = {
  personal_perpetual: 3,
  personal_subscription: 10,
  commercial: 999,
};

const CAN_OFFLINE: Record<MockIp['license_type'], boolean> = {
  personal_perpetual: true,
  personal_subscription: true,
  commercial: false,
};

@Injectable()
export class NiApiService {
  constructor(private readonly jwtService: JwtService) {}

  login(email: string, _password: string) {
    const payload = {
      sub: MOCK_USER_ID,
      email,
      scope: 'companion_app',
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: MOCK_NI_JWT_SECRET,
      expiresIn: '1h',
    });
    const refreshToken = this.jwtService.sign(
      { sub: MOCK_USER_ID, type: 'refresh' },
      { secret: MOCK_NI_JWT_SECRET, expiresIn: '30d' },
    );
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      token_type: 'Bearer',
    };
  }

  listIps(page: number, pageSize: number, status?: string): ListIpsResult {
    const all = MOCK_IPS;
    const filtered = status
      ? all.filter((ip) => {
          if (status === 'active') {
            return (
              ip.license_type === 'personal_perpetual' ||
              ip.license_type === 'personal_subscription'
            );
          }
          if (status === 'expired') {
            return (
              ip.license_expires_at !== null &&
              new Date(ip.license_expires_at) < new Date()
            );
          }
          return true;
        })
      : all;
    const start = (page - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);
    return {
      items: slice,
      total: filtered.length,
      page,
      page_size: pageSize,
      has_more: start + pageSize < filtered.length,
    };
  }

  getDetail(ipId: string): DetailResult {
    const ip = MOCK_IPS.find((i) => i.id === ipId);
    if (!ip) {
      throw new NotFoundException({
        error: {
          code: 'ip_not_found',
          message: `IP ${ipId} 不存在或未授权`,
          request_id: null,
        },
      });
    }
    const character = MOCK_CHARACTERS[ipId];
    const assets = MOCK_ASSETS[ipId];
    if (!character || !assets) {
      throw new NotFoundException({
        error: {
          code: 'ip_not_found',
          message: `IP ${ipId} 数据不完整 (character 或 assets 缺失)`,
          request_id: null,
        },
      });
    }
    return {
      id: ip.id,
      name: ip.name,
      avatar_url: ip.avatar_url,
      preview_url: ip.preview_url,
      character,
      license: {
        type: ip.license_type,
        scope: 'personal_companion_use',
        allowed_platforms: ['ios', 'android'],
        download_quota: DOWNLOAD_QUOTA[ip.license_type],
        download_used: 0,
        expires_at: ip.license_expires_at,
        can_offline_use: CAN_OFFLINE[ip.license_type],
      },
      assets,
    };
  }

  getLicense(ipId: string): LicenseResult {
    const ip = MOCK_IPS.find((i) => i.id === ipId);
    if (!ip) {
      throw new NotFoundException({
        error: {
          code: 'ip_not_found',
          message: `IP ${ipId} 不存在或未授权`,
          request_id: null,
        },
      });
    }
    const expired =
      ip.license_expires_at !== null &&
      new Date(ip.license_expires_at) < new Date();
    return {
      valid: !expired,
      type: ip.license_type,
      scope: 'personal_companion_use',
      download_quota_remaining: DOWNLOAD_QUOTA[ip.license_type],
      expires_at: ip.license_expires_at,
      can_offline_use: CAN_OFFLINE[ip.license_type],
    };
  }

  getSignedUrl(ipId: string, asset: string): SignedUrlResult {
    const ip = MOCK_IPS.find((i) => i.id === ipId);
    if (!ip) {
      throw new NotFoundException({
        error: {
          code: 'ip_not_found',
          message: `IP ${ipId} 不存在或未授权`,
          request_id: null,
        },
      });
    }
    const assets = MOCK_ASSETS[ipId];
    if (!assets) {
      throw new NotFoundException({
        error: {
          code: 'ip_not_found',
          message: `IP ${ipId} assets 缺失`,
          request_id: null,
        },
      });
    }
    const key = `${asset}_url` as keyof typeof assets;
    if (!(key in assets)) {
      throw new NotFoundException({
        error: {
          code: 'asset_not_found',
          message: `asset=${asset} 不可用,可选: preview_2k, preview_4k, voice_sample, expression_set`,
          request_id: null,
        },
      });
    }
    const baseUrl = assets[key];
    const expiresIn = 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return {
      url: `${baseUrl}&mock_signed=true&expires=${expiresIn}`,
      expires_at: expiresAt,
      expires_in_seconds: expiresIn,
    };
  }
}
