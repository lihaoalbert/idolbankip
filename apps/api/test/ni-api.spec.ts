// E2E 测试 — Mock 数字人陪伴 App API
// 覆盖 Goal Contract A1~A7
//
// why 独立 module: 复用 app.module 会带起 Prisma + 阿里云 KYC,依赖重且需要真实 .env.
//                  mock 模块独立可插拔,验证 fixture + guard 逻辑即可.

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NiApiModule } from '../src/mock/ni-api/ni-api.module';
import { MOCK_NI_JWT_SECRET } from '../src/mock/ni-api/fixtures';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

describe('Mock Ni API (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let validToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        // 关掉 throttler,免得 CI 跑快被限流
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10_000 }]),
        NiApiModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    jwt = moduleRef.get(JwtService);
    validToken = jwt.sign(
      { sub: 'mock-user-ni-v1', email: 'dev@ni.example.com' },
      { secret: MOCK_NI_JWT_SECRET, expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /v1/auth/login (A1)', () => {
    it('returns access_token + refresh_token (OAuth 2.0 shape)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'dev@ni.example.com', password: 'anything' })
        .expect(201);

      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.refresh_token).toEqual(expect.any(String));
      expect(res.body.token_type).toBe('Bearer');
      expect(res.body.expires_in).toBe(3600);
      // JWT 解出来 sub/mock-user-ni-v1
      const decoded = jwt.verify(res.body.access_token, {
        secret: MOCK_NI_JWT_SECRET,
      });
      expect((decoded as any).sub).toBe('mock-user-ni-v1');
    });

    it('rejects missing email with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ password: 'x' })
        .expect(400);
      expect(res.body.message).toEqual(expect.any(Array));
    });
  });

  describe('GET /v1/ips (A2)', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/v1/ips').expect(401);
    });

    it('returns 401 with bad token', async () => {
      await request(app.getHttpServer())
        .get('/v1/ips')
        .set('Authorization', 'Bearer not.a.real.jwt')
        .expect(401);
    });

    it('returns 3 fixture IPs with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/ips')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(res.body.total).toBe(3);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.page).toBe(1);
      expect(res.body.has_more).toBe(false);

      const names = res.body.items.map((i: any) => i.name);
      expect(names).toEqual(expect.arrayContaining(['苏晚', '傲云', '李泽']));

      const suwan = res.body.items.find(
        (i: any) => i.id === 'ip_ni_suwan_001',
      );
      expect(suwan.license_type).toBe('personal_perpetual');
      expect(suwan.tags).toContain('温柔');
    });

    it('filters by status=active (perpetual + subscription only)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/ips?status=active')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      // 3 fixture: perpetual(苏晚) + subscription(傲云) + commercial(李泽)
      // active 过滤 = perpetual + subscription = 2
      expect(res.body.total).toBe(2);
      const types = res.body.items.map((i: any) => i.license_type);
      expect(types).not.toContain('commercial');
    });
  });

  describe('GET /v1/ips/:id (A3)', () => {
    it('returns full detail with character + assets + license', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/ips/ip_ni_suwan_001')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(res.body.id).toBe('ip_ni_suwan_001');
      expect(res.body.name).toBe('苏晚');
      expect(res.body.character.id).toBe('char_suwan_001');
      expect(res.body.character.personality_traits).toContain('温柔');
      expect(res.body.assets.preview_2k_url).toMatch(/placehold\.co/);
      expect(res.body.license.type).toBe('personal_perpetual');
      expect(res.body.license.can_offline_use).toBe(true); // perpetual 允许离线
      expect(res.body.license.download_quota).toBe(3);
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/ips/ip_does_not_exist')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(res.body.error.code).toBe('ip_not_found');
    });
  });

  describe('GET /v1/ips/:id/license (A4)', () => {
    it('returns license check with can_offline_use', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/ips/ip_ni_suwan_001/license')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(res.body.valid).toBe(true);
      expect(res.body.type).toBe('personal_perpetual');
      expect(res.body.can_offline_use).toBe(true);
      expect(res.body.download_quota_remaining).toBe(3);
    });

    it('commercial license: can_offline_use=false', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/ips/ip_ni_lize_003/license')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(res.body.type).toBe('commercial');
      expect(res.body.can_offline_use).toBe(false);
      expect(res.body.download_quota_remaining).toBe(999);
    });
  });

  describe('GET /v1/ips/:id/signed-url (A5)', () => {
    it('returns 1h signed URL for preview_2k', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/ips/ip_ni_suwan_001/signed-url?asset=preview_2k')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(res.body.url).toMatch(/placehold\.co/);
      expect(res.body.url).toContain('mock_signed=true');
      expect(res.body.expires_in_seconds).toBe(3600);
      expect(new Date(res.body.expires_at).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });

    it('rejects missing asset with 400', async () => {
      await request(app.getHttpServer())
        .get('/v1/ips/ip_ni_suwan_001/signed-url')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400);
    });

    it('rejects invalid asset name with 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/ips/ip_ni_suwan_001/signed-url?asset=foo')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(res.body.error.code).toBe('asset_not_found');
    });
  });
});