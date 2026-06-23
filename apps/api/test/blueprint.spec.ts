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
      // 范围 0.0 ~ 10.0 (R7 改 mock 公式,空 blueprint 评估 originality~4.5,consistency=10,aesthetics~4.8)
      for (const k of ['originality', 'consistency', 'aesthetics']) {
        expect(res.body.scores[k]).toBeGreaterThanOrEqual(0);
        expect(res.body.scores[k]).toBeLessThanOrEqual(10);
      }
      expect(res.body.evaluated_at).toEqual(expect.any(String));
      // R7: response 多了 sub_scores 字段
      expect(res.body.sub_scores).toBeDefined();
      expect(res.body.sub_scores.L1_complexity).toEqual(expect.any(Number));
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
    // L4/L6 R6 起接入校验,移除了"passthrough" 测试 — 现在 L4/L6 都会 400
  });

  // ============================================================
  // Phase B Round 5b — L3 五官 (12 项) + L5 毛发 (8 项) 校验
  // ============================================================

  const validL3 = {
    eyeDistance: 0.5,
    eyeShape: 'double',
    eyeApertureHeight: 0.6,
    noseLength: 0.5,
    noseWidth: 0.4,
    noseBridge: 'medium',
    lipWidth: 0.5,
    lipThickness: 0.45,
    earPosition: 0.5,
    earSize: 0.4,
    philtrumLength: 0.5,
    chinProtrusion: 0.5,
  };

  const validL5 = {
    hairStyle: 'straight_long',
    hairColor: 'black',
    hairline: 'medium',
    browShape: 'arched',
    browColor: 'same_as_hair',
    browDensity: 0.7,
    lashes: 'long_dense',
    sideburns: 0.2,
  };

  describe('PATCH L3 features (Phase B R5b B1)', () => {
    it('accepts a complete valid L3 payload (200)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/3`)
        .send({ data: validL3 })
        .expect(200);

      expect(res.body.layers.L3_features).toEqual(validL3);
      expect(res.body.version).toBe(2);
    });

    it('rejects L3 with missing fields (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const { eyeDistance: _omit, ...partial } = validL3;
      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/3`)
        .send({ data: partial })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
      expect(res.body.error.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'eyeDistance' })]),
      );
    });

    it('rejects L3 with invalid enum eyeShape (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/3`)
        .send({ data: { ...validL3, eyeShape: 'square_eye' } })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
    });

    it('rejects L3 with out-of-range lipThickness (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/3`)
        .send({ data: { ...validL3, lipThickness: 1.5 } })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
    });

    it('does not regress L1/L2 on L3 update', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);
      const id = created.body.id;

      await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/1`)
        .send({ data: validL1 })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/2`)
        .send({ data: validL2 })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/3`)
        .send({ data: validL3 })
        .expect(200);

      expect(res.body.layers.L1_skeleton).toMatchObject(validL1);
      expect(res.body.layers.L2_softTissue).toEqual(validL2);
      expect(res.body.layers.L3_features).toEqual(validL3);
    });
  });

  describe('PATCH L5 hair (Phase B R5b B1)', () => {
    it('accepts a complete valid L5 payload (200)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/5`)
        .send({ data: validL5 })
        .expect(200);

      expect(res.body.layers.L5_hair).toEqual(validL5);
    });

    it('rejects L5 with invalid enum hairStyle (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/5`)
        .send({ data: { ...validL5, hairStyle: 'dreadlocks' } })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
    });

    it('rejects L5 with browDensity > 1 (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/5`)
        .send({ data: { ...validL5, browDensity: 1.5 } })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
    });

    it('rejects L5 with missing lashes (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const { lashes: _omit, ...partial } = validL5;
      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/5`)
        .send({ data: partial })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
    });
  });

  describe('Contradiction detection (Phase B R5b B2)', () => {
    it('returns empty array when no contradictions', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);
      const id = created.body.id;

      await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/1`)
        .send({ data: validL1 })
        .expect(200);
      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/2`)
        .send({ data: validL2 })
        .expect(200);

      expect(res.body.contradictions).toEqual([]);
    });

    it('flags bald + long sideburns', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);
      const id = created.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/5`)
        .send({
          data: { ...validL5, hairStyle: 'bald', sideburns: 0.8 },
        })
        .expect(200);

      expect(res.body.contradictions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'bald_long_sideburns', severity: 'warning' }),
        ]),
      );
    });

    it('flags thin brow + high density', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);
      const id = created.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/5`)
        .send({
          data: { ...validL5, browShape: 'thin', browDensity: 0.8 },
        })
        .expect(200);

      expect(res.body.contradictions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'thin_brow_high_density' }),
        ]),
      );
    });

    it('flags blonde + black brow', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);
      const id = created.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/5`)
        .send({
          data: { ...validL5, hairColor: 'blonde', browColor: 'black' },
        })
        .expect(200);

      expect(res.body.contradictions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'blonde_black_brow' }),
        ]),
      );
    });

    it('evaluate response includes contradictions', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);
      const id = created.body.id;

      await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/5`)
        .send({
          data: { ...validL5, hairStyle: 'bald', sideburns: 0.9 },
        })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/blueprint/${id}/evaluate`)
        .expect(201);

      expect(res.body.contradictions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'bald_long_sideburns' }),
        ]),
      );
    });
  });

  // ============================================================
  // Phase B Round 6 — L4 皮肤 (6 项) + L6 修饰 (6 项) + L7 prompt 整合
  // ============================================================

  const validL4 = {
    skinTone: 'medium',
    skinTexture: 'normal',
    freckles: 0.2,
    moles: 0.1,
    wrinkles: 0.05,
    pores: 0.3,
  };

  const validL6 = {
    makeup: 'light',
    lipColor: 'pink',
    blush: 0.4,
    eyeshadow: 0.3,
    accessory: 'earrings',
    facePaint: 0.0,
  };

  describe('PATCH L4 skin (Phase B R6 B1)', () => {
    it('accepts a complete valid L4 payload (200)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/4`)
        .send({ data: validL4 })
        .expect(200);

      expect(res.body.layers.L4_skin).toEqual(validL4);
    });

    it('rejects L4 with invalid skinTone enum (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/4`)
        .send({ data: { ...validL4, skinTone: 'ghostly' } })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
    });

    it('rejects L4 with wrinkles > 1 (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/4`)
        .send({ data: { ...validL4, wrinkles: 1.5 } })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
    });

    it('rejects L4 with missing fields (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const { freckles: _omit, ...partial } = validL4;
      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/4`)
        .send({ data: partial })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
    });
  });

  describe('PATCH L6 decoration (Phase B R6 B1)', () => {
    it('accepts a complete valid L6 payload (200)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/6`)
        .send({ data: validL6 })
        .expect(200);

      expect(res.body.layers.L6_decoration).toEqual(validL6);
    });

    it('rejects L6 with invalid makeup enum (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/6`)
        .send({ data: { ...validL6, makeup: 'cosplay' } })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
    });

    it('rejects L6 with eyeshadow > 1 (400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${created.body.id}/step/6`)
        .send({ data: { ...validL6, eyeshadow: 2.0 } })
        .expect(400);

      expect(res.body.error.code).toBe('invalid_layer_data');
    });
  });

  describe('L7 prompt generation (Phase B R6 B2)', () => {
    async function setupFullBlueprint(): Promise<string> {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({})
        .expect(201);
      const id = created.body.id;

      // 填 L1~L6 完整数据,触发 L7 prompt 计算
      const fullL1 = {
        craniumShape: 'medium',
        faceIndex: 1.35,
        cheekboneWidth: 0.55,
        cheekboneProminence: 0.4,
        jawWidth: 0.5,
        jawAngle: 'medium',
        upperThirdRatio: 0.33,
        midThirdRatio: 0.34,
      };
      await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/1`)
        .send({ data: fullL1 })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/4`)
        .send({ data: validL4 })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/6`)
        .send({ data: validL6 })
        .expect(200);
      return id;
    }

    it('auto-generates promptZh and promptEn from L1~L6', async () => {
      const id = await setupFullBlueprint();
      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/7`)
        .send({ data: { platforms: ['mj', 'sd'] } })
        .expect(200);

      const l7 = res.body.layers.L7_render;
      expect(l7.promptZh).toEqual(expect.any(String));
      expect(l7.promptEn).toEqual(expect.any(String));
      expect(l7.promptZh.length).toBeGreaterThan(10);
      expect(l7.promptEn.length).toBeGreaterThan(10);
      // 平台选择
      expect(l7.platforms).toEqual(['mj', 'sd']);
    });

    it('prompt is deterministic for same input', async () => {
      const id = await setupFullBlueprint();
      const a = await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/7`)
        .send({ data: { platforms: ['mj'] } })
        .expect(200);

      // 再发一次同样请求
      const b = await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/7`)
        .send({ data: { platforms: ['mj'] } })
        .expect(200);

      expect(b.body.layers.L7_render.promptZh).toBe(a.body.layers.L7_render.promptZh);
      expect(b.body.layers.L7_render.promptEn).toBe(a.body.layers.L7_render.promptEn);
    });

    it('MJ variant includes Midjourney flags', async () => {
      const id = await setupFullBlueprint();
      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/7`)
        .send({ data: { platforms: ['mj'] } })
        .expect(200);

      const mjVariant = res.body.layers.L7_render.variants.find((v: string) => v.startsWith('mj:'));
      expect(mjVariant).toBeDefined();
      expect(mjVariant).toMatch(/--ar/);
      expect(mjVariant).toMatch(/--style raw/);
    });

    it('jimeng/doubao variants use Chinese prompt', async () => {
      const id = await setupFullBlueprint();
      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/7`)
        .send({ data: { platforms: ['jimeng', 'doubao'] } })
        .expect(200);

      const jimeng = res.body.layers.L7_render.variants.find((v: string) => v.startsWith('jimeng:'));
      const doubao = res.body.layers.L7_render.variants.find((v: string) => v.startsWith('doubao:'));
      expect(jimeng).toBeDefined();
      expect(doubao).toBeDefined();
      // 中文字符检测 — 含"肖像"或"半身"
      expect(jimeng).toMatch(/肖像|半身|中/);
      expect(doubao).toMatch(/肖像|半身|中/);
    });

    it('SD variant includes negative prompt', async () => {
      const id = await setupFullBlueprint();
      const res = await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/7`)
        .send({ data: { platforms: ['sd'] } })
        .expect(200);

      const sd = res.body.layers.L7_render.variants.find((v: string) => v.startsWith('sd:'));
      expect(sd).toBeDefined();
      expect(sd).toMatch(/Negative prompt/);
    });
  });

  describe('L8 evaluation (R7 placeholder)', () => {
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

  // ============================================================
  // Phase B Round 7 — L8 mock 评估公式 (8 维 → 3 维)
  // ============================================================

  describe('POST /blueprint/:id/evaluate (R7 详: 8 维 sub-score + 矛盾 bonus)', () => {
    it('returns 8-dim subScores alongside 3 main scores', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({ ownerId: 'u_sub' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/blueprint/${created.body.id}/evaluate`)
        .expect(201);

      // 8 个 sub-score 全部存在,范围 0~1
      for (const k of [
        'L1_complexity',
        'L2_expressiveness',
        'L3_distinctiveness',
        'L4_skin_realism',
        'L5_hair_coverage',
        'L6_decoration_completeness',
        'L7_prompt_quality',
        'L8_contradiction_bonus',
      ]) {
        expect(res.body.sub_scores[k]).toEqual(expect.any(Number));
        expect(res.body.sub_scores[k]).toBeGreaterThanOrEqual(0);
        expect(res.body.sub_scores[k]).toBeLessThanOrEqual(1);
      }
    });

    it('persists evaluation result into L8_evaluation layer (GET 返回)', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({ ownerId: 'u_persist' })
        .expect(201);
      const id = created.body.id;

      await request(app.getHttpServer())
        .post(`/blueprint/${id}/evaluate`)
        .expect(201);

      const get = await request(app.getHttpServer())
        .get(`/blueprint/${id}`)
        .expect(200);

      expect(get.body.layers.L8_evaluation).toBeDefined();
      expect(get.body.layers.L8_evaluation.originality).toEqual(expect.any(Number));
      expect(get.body.layers.L8_evaluation.subScores).toBeDefined();
      expect(get.body.layers.L8_evaluation.evaluatedAt).toEqual(expect.any(String));
    });

    it('contradiction-rich layers boost originality via L8_contradiction_bonus', async () => {
      // 故意构造一个矛盾组合 (光头+长鬓角 + M 型发际线+高眉弓)
      // 让 sub.L8_contradiction_bonus 上升,originality 应当 >= 无矛盾 baseline
      const withContradiction = await request(app.getHttpServer())
        .post('/blueprint')
        .send({ ownerId: 'u_contra' })
        .expect(201);
      const wcId = withContradiction.body.id;

      // 填 L1
      await request(app.getHttpServer())
        .patch(`/blueprint/${wcId}/step/1`)
        .send({
          data: {
            craniumShape: 'medium',
            faceIndex: 1.35,
            cheekboneWidth: 0.55,
            cheekboneProminence: 0.4,
            jawWidth: 0.5,
            jawAngle: 'medium',
            upperThirdRatio: 0.33,
            midThirdRatio: 0.34,
          },
        })
        .expect(200);
      // 填 L2 (高眉弓 0.8, 触发 m_hairline_high_brow)
      await request(app.getHttpServer())
        .patch(`/blueprint/${wcId}/step/2`)
        .send({
          data: {
            subcutaneousFat: 0.5,
            masseter: 0.5,
            buccalFat: 0.5,
            eyeSocketDepth: 0.3,
            browRidge: 0.8,
            nasolabialFold: 0.1,
          },
        })
        .expect(200);
      // 填 L5 (bald + sideburns=0.9 + m_shape)
      await request(app.getHttpServer())
        .patch(`/blueprint/${wcId}/step/5`)
        .send({
          data: {
            hairStyle: 'bald',
            hairColor: 'black',
            hairline: 'm_shape',
            browShape: 'arched',
            browColor: 'black',
            browDensity: 0.5,
            lashes: 'long_dense',
            sideburns: 0.9,
          },
        })
        .expect(200);

      const evalWc = await request(app.getHttpServer())
        .post(`/blueprint/${wcId}/evaluate`)
        .expect(201);

      // 至少有 2 条矛盾
      expect(evalWc.body.contradictions.length).toBeGreaterThanOrEqual(2);
      // 矛盾 bonus 应当 > 0
      expect(evalWc.body.sub_scores.L8_contradiction_bonus).toBeGreaterThan(0);
      // consistency 应当因矛盾扣分 (< 10)
      expect(evalWc.body.scores.consistency).toBeLessThan(10);
    });

    it('is deterministic: same L1+L2 layers → same sub_scores', async () => {
      const a = await request(app.getHttpServer())
        .post('/blueprint')
        .send({ ownerId: 'det_a' })
        .expect(201);
      const b = await request(app.getHttpServer())
        .post('/blueprint')
        .send({ ownerId: 'det_b' })
        .expect(201);

      // 同样的 L1 + L2
      const payload = {
        L1: {
          craniumShape: 'long',
          faceIndex: 1.5,
          cheekboneWidth: 0.7,
          cheekboneProminence: 0.6,
          jawWidth: 0.3,
          jawAngle: 'sharp',
          upperThirdRatio: 0.35,
          midThirdRatio: 0.32,
        },
        L2: {
          subcutaneousFat: 0.2,
          masseter: 0.7,
          buccalFat: 0.3,
          eyeSocketDepth: 0.8,
          browRidge: 0.7,
          nasolabialFold: 0.4,
        },
      };
      for (const id of [a.body.id, b.body.id]) {
        await request(app.getHttpServer())
          .patch(`/blueprint/${id}/step/1`)
          .send({ data: payload.L1 })
          .expect(200);
        await request(app.getHttpServer())
          .patch(`/blueprint/${id}/step/2`)
          .send({ data: payload.L2 })
          .expect(200);
      }

      const evalA = await request(app.getHttpServer())
        .post(`/blueprint/${a.body.id}/evaluate`)
        .expect(201);
      const evalB = await request(app.getHttpServer())
        .post(`/blueprint/${b.body.id}/evaluate`)
        .expect(201);

      expect(evalB.body.sub_scores).toEqual(evalA.body.sub_scores);
      expect(evalB.body.scores).toEqual(evalA.body.scores);
    });

    it('main scores are 0~10 with 1-decimal precision', async () => {
      const created = await request(app.getHttpServer())
        .post('/blueprint')
        .send({ ownerId: 'u_range' })
        .expect(201);
      const id = created.body.id;
      // 极端参数: 脸型极长, 各项极值
      await request(app.getHttpServer())
        .patch(`/blueprint/${id}/step/1`)
        .send({
          data: {
            craniumShape: 'long',
            faceIndex: 1.6,
            cheekboneWidth: 0.1,
            cheekboneProminence: 1.0,
            jawWidth: 0.1,
            jawAngle: 'sharp',
            upperThirdRatio: 0.5,
            midThirdRatio: 0.2,
          },
        })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/blueprint/${id}/evaluate`)
        .expect(201);

      for (const k of ['originality', 'consistency', 'aesthetics']) {
        const v = res.body.scores[k];
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(10);
        // 1 位小数 — v*10 应当是整数
        expect(v * 10).toBe(Math.round(v * 10));
      }
    });
  });

  // ============================================================
  // mock-evaluator 单元测试(直接调函数,不走 HTTP)
  // ============================================================

  describe('mock-evaluator unit (R7 公式直测)', () => {
    it('empty layers give reasonable defaults (4-10 range)', async () => {
      const { evaluate } = await import('../src/blueprint/evaluator/mock-evaluator');
      const result = evaluate({
        L1_skeleton: null,
        L2_softTissue: null,
        L3_features: null,
        L4_skin: null,
        L5_hair: null,
        L6_decoration: null,
        L7_render: null,
      });
      // 空 layers: sub-scores 0~0.5, 主分约 4-10
      expect(result.scores.originality).toBeGreaterThan(0);
      expect(result.scores.consistency).toBe(10); // 无矛盾
      expect(result.scores.aesthetics).toBeGreaterThan(0);
      expect(result.contradictions).toEqual([]);
    });

    it('extreme L1 (long + 1.6 faceIndex) boosts L1_complexity sub-score', async () => {
      const { evaluate } = await import('../src/blueprint/evaluator/mock-evaluator');
      const typical = evaluate({
        L1_skeleton: {
          craniumShape: 'medium',
          faceIndex: 1.35,
          cheekboneWidth: 0.55,
          cheekboneProminence: 0.4,
          jawWidth: 0.5,
          jawAngle: 'medium',
          upperThirdRatio: 0.33,
          midThirdRatio: 0.34,
        } as any,
        L2_softTissue: null,
        L3_features: null,
        L4_skin: null,
        L5_hair: null,
        L6_decoration: null,
        L7_render: null,
      });
      const extreme = evaluate({
        L1_skeleton: {
          craniumShape: 'long',
          faceIndex: 1.6,
          cheekboneWidth: 0.1,
          cheekboneProminence: 1.0,
          jawWidth: 0.1,
          jawAngle: 'sharp',
          upperThirdRatio: 0.5,
          midThirdRatio: 0.2,
        } as any,
        L2_softTissue: null,
        L3_features: null,
        L4_skin: null,
        L5_hair: null,
        L6_decoration: null,
        L7_render: null,
      });
      expect(extreme.subScores.L1_complexity).toBeGreaterThan(typical.subScores.L1_complexity);
    });

    it('L7 prompt quality increases with prompt length', async () => {
      const { evaluate } = await import('../src/blueprint/evaluator/mock-evaluator');
      const short = evaluate({
        L1_skeleton: null,
        L2_softTissue: null,
        L3_features: null,
        L4_skin: null,
        L5_hair: null,
        L6_decoration: null,
        L7_render: { promptZh: '脸', promptEn: 'face' },
      });
      const long = evaluate({
        L1_skeleton: null,
        L2_softTissue: null,
        L3_features: null,
        L4_skin: null,
        L5_hair: null,
        L6_decoration: null,
        L7_render: {
          promptZh: '长颅型脸庞,中颅指数,锐角下颌,皮肤白皙,黑发,双眼皮,高鼻梁,丰唇,戴眼镜,妆容淡雅,精致五官,清晰轮廓,五庭比例均匀,真人人像',
          promptEn: 'a long cranium face shape, medium face index, sharp jawline, fair skin, black hair, double eyelids, high nose bridge, full lips, glasses, natural makeup, refined features, clear contours, balanced facial thirds, photorealistic portrait',
        },
      });
      expect(long.subScores.L7_prompt_quality).toBeGreaterThan(short.subScores.L7_prompt_quality);
    });
  });
});