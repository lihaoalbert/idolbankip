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
          data: {
            craniumShape: 'medium',
            faceIndex: 1.35,
            cheekboneWidth: 0.6,
            cheekboneProminence: 0.55,
            jawWidth: 0.5,
            jawAngle: 'medium',
            upperThirdRatio: 0.33,
            midThirdRatio: 0.34,
          },
        })
        .expect(200);

      expect(res.body.layers.L1_skeleton).toMatchObject({
        craniumShape: 'medium',
        faceIndex: 1.35,
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
        .send({
          data: {
            originality: 9.2,
            consistency: 8.5,
            aesthetics: 8.0,
          },
        })
        .expect(200);

      expect(res.body.layers.L8_evaluation).toMatchObject({ originality: 9.2 });
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
      // 填同样的完整 L1 让 hash 一致
      const sameL1 = {
        craniumShape: 'medium',
        faceIndex: 1.35,
        cheekboneWidth: 0.7,
        cheekboneProminence: 0.4,
        jawWidth: 0.5,
        jawAngle: 'medium',
        upperThirdRatio: 0.33,
        midThirdRatio: 0.34,
      };
      await request(app.getHttpServer())
        .patch(`/blueprint/${a.body.id}/step/1`)
        .send({ data: sameL1 })
        .expect(200);

      const b = await request(app.getHttpServer())
        .post('/blueprint')
        .send({ ownerId: 'u2' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/blueprint/${b.body.id}/step/1`)
        .send({ data: sameL1 })
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

  // ============================================================
  // Phase B Round 4 — L1 骨骼 (8 项) + L2 软组织 (6 项) 校验
  // ============================================================

  const validL1 = {
    craniumShape: 'medium',
    faceIndex: 1.35,
    cheekboneWidth: 0.55,
    cheekboneProminence: 0.4,
    jawWidth: 0.5,
    jawAngle: 'medium',
    upperThirdRatio: 0.33,
    midThirdRatio: 0.34,
  };

  const validL2 = {
    subcutaneousFat: 0.45,
    masseter: 0.5,
    buccalFat: 0.55,
    eyeSocketDepth: 0.3,
    browRidge: 0.6,
    nasolabialFold: 0.1,
  };

  describe('PATCH L1 skeleton (Phase B R4 B1)', () => {
    it('accepts a complete valid L1 payload (200)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/1`)
        .send({ data: validL1 })
        .expect(200);

      expect(res.body.layers.L1_skeleton).toMatchObject(validL1);
      // version 自增
      expect(res.body.version).toBe(2);
    });

    it('round-trips through JSON without precision loss', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      // 序列化往返 — 模拟前端 form data → JSON.stringify → 网络 → JSON.parse → zod
      const serialized = JSON.stringify({ data: validL1 });
      const reparsed = JSON.parse(serialized);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/1`)
        .send(reparsed)
        .expect(200);

      expect(res.body.layers.L1_skeleton).toEqual(validL1);
    });

    it('rejects L1 with missing fields (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const { craniumShape: _omit, ...partial } = validL1;
      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/1`)
        .send({ data: partial })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
      expect(res.body.error.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'craniumShape' })]),
      );
    });

    it('rejects L1 with out-of-range faceIndex (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/1`)
        .send({ data: { ...validL1, faceIndex: 2.5 } }) // > 1.6
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
      expect(res.body.error.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'faceIndex' }),
        ]),
      );
    });

    it('rejects L1 with invalid enum value (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/1`)
        .send({ data: { ...validL1, craniumShape: 'squid' } })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
    });

    it('does not regress other layers on L1 update', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      // 先填完整 L2
      await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/2`)
        .send({ data: validL2 })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/1`)
        .send({ data: validL1 })
        .expect(200);

      // L2 还在
      expect(res.body.layers.L2_softTissue).toEqual(validL2);
      // L1 写好
      expect(res.body.layers.L1_skeleton).toMatchObject(validL1);
      // 其他 6 层还是 null
      for (const k of ['L3_features', 'L4_skin', 'L5_hair', 'L6_decoration', 'L7_render', 'L8_evaluation']) {
        expect(res.body.layers[k]).toBeNull();
      }
    });
  });

  describe('PATCH L2 soft tissue (Phase B R4 B1)', () => {
    it('accepts a complete valid L2 payload (200)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/2`)
        .send({ data: validL2 })
        .expect(200);

      expect(res.body.layers.L2_softTissue).toEqual(validL2);
    });

    it('rejects L2 with negative number (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/2`)
        .send({ data: { ...validL2, subcutaneousFat: -0.1 } })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
    });

    it('rejects L2 with all-zero defaults (whitelist rejects)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      // 缺 6 个字段
      await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/2`)
        .send({ data: {} })
        .expect(400);
    });
  });

  describe('L3~L6 passthrough (no zod yet)', () => {
    it('accepts arbitrary data for L3 (no validator)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/3`)
        .send({ data: { anyField: 'any value' } })
        .expect(200);

      expect(res.body.layers.L3_features).toEqual({ anyField: 'any value' });
    });
  });

  describe('L7 render (R6 placeholder) + L8 evaluation (R7 placeholder)', () => {
    it('accepts L7 with promptZh string (200)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/7`)
        .send({ data: { promptZh: '青衣少女', promptEn: 'a girl in cyan', platforms: ['mj', 'sd'] } })
        .expect(200);

      expect(res.body.layers.L7_render).toMatchObject({
        promptZh: '青衣少女',
        promptEn: 'a girl in cyan',
        platforms: ['mj', 'sd'],
      });
    });

    it('rejects L8 with out-of-range score (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/8`)
        .send({ data: { originality: 15 } }) // > 10
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
    });
  });
});