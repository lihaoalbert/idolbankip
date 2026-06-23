// E2E 测试 — FaceBlueprint 后端骨架(Phase 1 Layered Prompt Generator)
// 覆盖 Goal Contract A1~A4 + 边界 404/400
//
// Phase A Round 2:stub 实现(内存 Map),Round 4 起换 Prisma
// 当前 spec 验证:模块/路由/DTO/错误信封,真实落库留 Phase B

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BlueprintModule } from '../src/blueprint/blueprint.module';
import { BLUEPRINT_LAYERS } from '../src/blueprint/blueprint.service';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

describe('FaceBlueprint skeleton (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10_000 }]),
        BlueprintModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /blueprint (A1 stub)', () => {
    it('creates blueprint with all 8 layers null + meta defaults', async () => {
      const res = await request(app.getHttpServer())
        .post('/blueprint')
        .send({
          ownerId: 'user_alice',
          title: '苏晚-测试',
          tags: '温柔,内敛',
        })
        .expect(201);

      expect(res.body.id).toMatch(/^fb_test_\d{3}$/);
      expect(res.body.ownerId).toBe('user_alice');
      expect(res.body.title).toBe('苏晚-测试');
      expect(res.body.tags).toBe('温柔,内敛');
      expect(res.body.version).toBe(1);
      expect(res.body.isArchived).toBe(false);
      expect(res.body.ipId).toBeNull();

      // 8 层全部 null
      expect(Object.keys(res.body.layers)).toEqual(
        expect.arrayContaining(BLUEPRINT_LAYERS),
      );
      for (const k of BLUEPRINT_LAYERS) {
        expect(res.body.layers[k]).toBeNull();
      }

      expect(res.body.createdAt).toEqual(expect.any(String));
      expect(res.body.updatedAt).toEqual(res.body.createdAt);
    });

    it('falls back to stub user when ownerId omitted', async () => {
      const res = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);
      expect(res.body.ownerId).toBe('stub-user-blueprint');
    });
  });

  describe('GET /blueprint/:id (A2)', () => {
    it('retrieves previously created blueprint', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({ ownerId: 'user_bob' })
        .expect(201);
      const id = created.body.id;

      const res = await request(app.getHttpServer())
        .get(`/blueprint/${id}`)
        .expect(200);

      expect(res.body.id).toBe(id);
      expect(res.body.ownerId).toBe('user_bob');
      expect(res.body.layers).toEqual(created.body.layers);
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app.getHttpServer())
        .get('/blueprint/fb_does_not_exist')
        .expect(404);

      expect(res.body.error.code).toBe('blueprint_not_found');
    });
  });

  describe('PATCH /blueprint/:id/step/:n (A3)', () => {
    it('updates only the targeted layer', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({ ownerId: 'user_carol' })
        .expect(201);
      const id = created.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/1`)
        .send({
          data: { headWidth: 0.6, headDepth: 0.55, jawWidth: 0.5 },
        })
        .expect(200);

      expect(res.body.layers.L1_skeleton).toEqual({
        headWidth: 0.6,
        headDepth: 0.55,
        jawWidth: 0.5,
      });
      // 其他层必须还是 null
      for (const k of BLUEPRINT_LAYERS) {
        if (k === 'L1_skeleton') continue;
        expect(res.body.layers[k]).toBeNull();
      }
      // version 自增,updatedAt 前进
      expect(res.body.version).toBe(2);
      expect(res.body.updatedAt).not.toBe(created.body.createdAt);
    });

    it('updates step 8 (L8_evaluation)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({ ownerId: 'user_dave' })
        .expect(201);
      const id = created.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/8`)
        .send({ data: { originality: 9.2 } })
        .expect(200);

      expect(res.body.layers.L8_evaluation).toEqual({ originality: 9.2 });
    });

    it('rejects step=0 with 400', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/0`)
        .send({ data: {} })
        .expect(400);
    });

    it('rejects step=9 with 400', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);
      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/9`)
        .send({ data: {} })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_step');
    });

    it('returns 404 when patching unknown blueprint', async () => {
      await request(app.getHttpServer())
        .patch('/blueprint/fb_does_not_exist/step/1')
        .send({ data: {} })
        .expect(404);
    });

    it('rejects missing data field with 400', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/1`)
        .send({})
        .expect(400);
    });
  });

  describe('POST /blueprint/:id/evaluate (A4)', () => {
    it('returns mock originality/consistency/aesthetics scores', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({ ownerId: 'user_eva' })
        .expect(201);
      const id = created.body.id;

      const res = await request(app.getHttpServer())
        .post(`/blueprint/${id}/evaluate`)
        .expect(201);

      expect(res.body.id).toBe(id);
      expect(res.body.scores).toEqual({
        originality: expect.any(Number),
        consistency: expect.any(Number),
        aesthetics: expect.any(Number),
      });
      // 范围 5.0 ~ 10.0
      for (const k of ['originality', 'consistency', 'aesthetics']) {
        expect(res.body.scores[k]).toBeGreaterThanOrEqual(5);
        expect(res.body.scores[k]).toBeLessThanOrEqual(10);
      }
      expect(res.body.evaluated_at).toEqual(expect.any(String));
    });

    it('is deterministic for same input', async () => {
      const a = await request(app.getHttpServer())
        .post('/blueprint')
        .send({ ownerId: 'u1' })
        .expect(201);
      // 填同样的 L1 让 hash 一致
      await request(app.getHttpServer())
        .patch(`/blueprint/${a.body.id}/step/1`)
        .send({ data: { headWidth: 0.7 } })
        .expect(200);

      const b = await request(app.getHttpServer())
        .post('/blueprint')
        .send({ ownerId: 'u2' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/blueprint/${b.body.id}/step/1`)
        .send({ data: { headWidth: 0.7 } })
        .expect(200);

      const evalA = await request(app.getHttpServer())
        .post(`/blueprint/${a.body.id}/evaluate`)
        .expect(201);
      const evalB = await request(app.getHttpServer())
        .post(`/blueprint/${b.body.id}/evaluate`)
        .expect(201);

      expect(evalB.body.scores).toEqual(evalA.body.scores);
    });

    it('returns 404 for unknown blueprint', async () => {
      await request(app.getHttpServer())
        .post('/blueprint/fb_does_not_exist/evaluate')
        .expect(404);
    });
  });
});