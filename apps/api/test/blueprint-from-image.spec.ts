// Track B E2E:POST /blueprint/from-image 参考图反向拆解
// 覆盖 Goal Contract B1~B6(3 个 test):
//   1. 成功路径 — 调 MiniMax M3 → 解析 JSON → 6 层写入 + _inferred 标记
//   2. JSON 解析失败 — Vision 返回非 JSON → 422
//   3. 缺关键字段 — Vision 返回 JSON 但少一层 → 422
//
// 设计:AiService 用 mock 注入(避免真实 API 调用 + 真实图片上传)
//       BlueprintModule 整体拉起,只 override AiService provider
//       (Stage A.5 改造:用 AiService 替代之前的 DashScopeProvider + UploadService)

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { BlueprintModule } from '../src/blueprint/blueprint.module';
import { AiService } from '../src/ai/ai.service';

// 1x1 透明 PNG base64(~70 字节)用于测试,够 service 解码过大小校验
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+XJ8H6QAAAABJRU5ErkJggg==';

const MOCK_VISION_JSON = {
  L1_skeleton: {
    gender: 'male',
    craniumShape: 'medium',
    faceIndex: 1.30,
    cheekboneWidth: 0.65,
    cheekboneProminence: 0.55,
    jawWidth: 0.70,
    jawAngle: 'sharp',
    upperThirdRatio: 0.32,
    midThirdRatio: 0.35,
  },
  L2_softTissue: {
    subcutaneousFat: 0.30,
    masseter: 0.70,
    buccalFat: 0.35,
    eyeSocketDepth: 0.75,
    browRidge: 0.80,
    nasolabialFold: 0.20,
  },
  L3_features: {
    eyeDistance: 0.50,
    eyeShape: 'double',
    eyeApertureHeight: 0.55,
    noseLength: 0.65,
    noseWidth: 0.45,
    noseBridge: 'high',
    lipWidth: 0.45,
    lipThickness: 0.50,
    earPosition: 0.55,
    earSize: 0.50,
    philtrumLength: 0.55,
    chinProtrusion: 0.60,
  },
  L4_skin: {
    skinTone: 'light',
    skinTexture: 'normal',
    freckles: 0.20,
    moles: 0.05,
    wrinkles: 0.10,
    pores: 0.30,
  },
  L5_hair: {
    hairStyle: 'straight_short',
    hairColor: 'brown',
    hairline: 'medium',
    browShape: 'straight',
    browColor: 'same_as_hair',
    browDensity: 0.80,
    lashes: 'short_dense',
    sideburns: 0.40,
  },
  L6_decoration: {
    makeup: 'none',
    lipColor: 'natural',
    blush: 0.0,
    eyeshadow: 0.0,
    accessory: 'none',
    facePaint: 0.0,
  },
};

function buildApp(
  visionReturn: string,
  visionShouldThrow: Error | null = null,
): Promise<INestApplication> {
  const aiMock: Partial<AiService> = {
    analyzeBlueprintFace: jest.fn(async () => {
      if (visionShouldThrow) throw visionShouldThrow;
      return visionReturn;
    }),
  };

  const builder: TestingModuleBuilder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [() => ({ BLUEPRINT_WIZARD_ENABLED: true })],
      }),
      BlueprintModule,
    ],
  })
    .overrideProvider(AiService)
    .useValue(aiMock);

  return builder.compile().then(async (moduleRef) => {
    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    return app;
  });
}

describe('Track B POST /blueprint/from-image', () => {
  it('成功路径:反推 6 层 + 标记 _inferred', async () => {
    const app = await buildApp(JSON.stringify(MOCK_VISION_JSON));
    try {
      const res = await request(app.getHttpServer())
        .post('/blueprint/from-image')
        .send({ imageBase64: TINY_PNG_BASE64, title: 'test from image' })
        .expect(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.inferredFields).toBe(6);
      // L1~L6 都写入了 + _inferred
      for (const key of ['L1_skeleton', 'L2_softTissue', 'L3_features', 'L4_skin', 'L5_hair', 'L6_decoration']) {
        expect(res.body.layers[key]).not.toBeNull();
        expect(res.body.layers[key]._inferred).toBe(true);
      }
      // L7/L8 仍 null(不预先评估)
      expect(res.body.layers.L7_render).toBeNull();
      expect(res.body.layers.L8_evaluation).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('JSON 解析失败 → 422 vision_json_parse_failed', async () => {
    const app = await buildApp('这不是 JSON,只是普通文本 {');
    try {
      const res = await request(app.getHttpServer())
        .post('/blueprint/from-image')
        .send({ imageBase64: TINY_PNG_BASE64 })
        .expect(422);
      expect(res.body.error.code).toBe('vision_json_parse_failed');
    } finally {
      await app.close();
    }
  });

  it('缺关键字段 → 422 vision_missing_layer', async () => {
    const partial = { ...MOCK_VISION_JSON };
    delete (partial as any).L3_features; // 故意缺 L3
    const app = await buildApp(JSON.stringify(partial));
    try {
      const res = await request(app.getHttpServer())
        .post('/blueprint/from-image')
        .send({ imageBase64: TINY_PNG_BASE64 })
        .expect(422);
      expect(res.body.error.code).toBe('vision_missing_layer');
      expect(res.body.error.message).toContain('L3_features');
    } finally {
      await app.close();
    }
  });
});
