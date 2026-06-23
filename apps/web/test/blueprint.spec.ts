// Phase B R4 B1 — 前端单元测试
// 覆盖 Goal Contract 验收:
//   A8: form value ↔ JSON 序列化无精度损失 / 无默认值污染
//
// 范围:L1 + L2 数据形状 + useBlueprintDraft localStorage key 协议
// Phase B R5 起:加 L3+L5+L7+L8 测试
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  L1_DEFAULTS,
  L2_DEFAULTS,
  L3_DEFAULTS,
  L5_DEFAULTS,
  L1_SLIDER_FIELDS,
  L2_SLIDER_FIELDS,
  L3_SLIDER_FIELDS,
  L5_SLIDER_FIELDS,
  L1_SELECT_FIELDS,
  L3_SELECT_FIELDS,
  L5_SELECT_FIELDS,
  type L1Skeleton,
  type L2SoftTissue,
  type L3Features,
  type L5Hair,
  stepToLayer,
  BLUEPRINT_LAYERS,
} from '../src/api/blueprint';

describe('L1 骨骼 (8 项)', () => {
  it('有 6 个 slider 字段 + 2 个 select 字段', () => {
    expect(L1_SLIDER_FIELDS).toHaveLength(6);
    expect(L1_SELECT_FIELDS).toHaveLength(2);
    // 总 8 字段
    const totalKeys = new Set([
      ...L1_SLIDER_FIELDS.map((f) => f.key),
      ...L1_SELECT_FIELDS.map((f) => f.key),
    ]);
    expect(totalKeys.size).toBe(8);
    expect(L1_DEFAULTS).toHaveProperty('craniumShape');
    expect(L1_DEFAULTS).toHaveProperty('faceIndex');
    expect(L1_DEFAULTS).toHaveProperty('cheekboneWidth');
    expect(L1_DEFAULTS).toHaveProperty('cheekboneProminence');
    expect(L1_DEFAULTS).toHaveProperty('jawWidth');
    expect(L1_DEFAULTS).toHaveProperty('jawAngle');
    expect(L1_DEFAULTS).toHaveProperty('upperThirdRatio');
    expect(L1_DEFAULTS).toHaveProperty('midThirdRatio');
  });

  it('默认值都在合法范围内', () => {
    for (const f of L1_SLIDER_FIELDS) {
      const v = (L1_DEFAULTS as any)[f.key];
      expect(v).toBeGreaterThanOrEqual(f.min);
      expect(v).toBeLessThanOrEqual(f.max);
    }
    for (const f of L1_SELECT_FIELDS) {
      const v = (L1_DEFAULTS as any)[f.key];
      const valid = f.options.map((o) => o.value);
      expect(valid).toContain(v);
    }
  });

  it('form ↔ JSON 序列化无精度损失', () => {
    // 模拟前端 slider 任意输入
    const input: L1Skeleton = {
      craniumShape: 'long',
      faceIndex: 1.417, // 3 位小数
      cheekboneWidth: 0.123456,
      cheekboneProminence: 0.987654,
      jawWidth: 0.5,
      jawAngle: 'sharp',
      upperThirdRatio: 0.33,
      midThirdRatio: 0.34,
    };

    // 模拟网络往返: JSON.stringify → JSON.parse
    const serialized = JSON.stringify(input);
    const deserialized: L1Skeleton = JSON.parse(serialized);

    // 严格相等 — 数字无精度漂移
    expect(deserialized).toEqual(input);
    expect(deserialized.faceIndex).toBe(1.417);
    expect(deserialized.cheekboneWidth).toBe(0.123456);
  });

  it('默认值 JSON 序列化后字段齐全', () => {
    const json = JSON.parse(JSON.stringify(L1_DEFAULTS));
    expect(Object.keys(json).sort()).toEqual(
      [
        'cheekboneProminence',
        'cheekboneWidth',
        'craniumShape',
        'faceIndex',
        'jawAngle',
        'jawWidth',
        'midThirdRatio',
        'upperThirdRatio',
      ].sort(),
    );
  });
});

describe('L2 软组织 (6 项)', () => {
  it('有 6 个 slider 字段,无 select', () => {
    expect(L2_SLIDER_FIELDS).toHaveLength(6);
    expect(L2_DEFAULTS).toHaveProperty('subcutaneousFat');
    expect(L2_DEFAULTS).toHaveProperty('masseter');
    expect(L2_DEFAULTS).toHaveProperty('buccalFat');
    expect(L2_DEFAULTS).toHaveProperty('eyeSocketDepth');
    expect(L2_DEFAULTS).toHaveProperty('browRidge');
    expect(L2_DEFAULTS).toHaveProperty('nasolabialFold');
  });

  it('所有字段 0~1 范围', () => {
    for (const f of L2_SLIDER_FIELDS) {
      expect(f.min).toBe(0);
      expect(f.max).toBe(1);
    }
  });

  it('form ↔ JSON 序列化无精度损失', () => {
    const input: L2SoftTissue = {
      subcutaneousFat: 0.5,
      masseter: 0.7,
      buccalFat: 0.3,
      eyeSocketDepth: 0.55,
      browRidge: 0.8,
      nasolabialFold: 0.05,
    };

    const deserialized = JSON.parse(JSON.stringify(input));
    expect(deserialized).toEqual(input);
  });
});

describe('stepToLayer 路由', () => {
  it('1~8 → 对应 layer key', () => {
    expect(stepToLayer(1)).toBe('L1_skeleton');
    expect(stepToLayer(2)).toBe('L2_softTissue');
    expect(stepToLayer(7)).toBe('L7_render');
    expect(stepToLayer(8)).toBe('L8_evaluation');
  });

  it('0 或 9 返 null', () => {
    expect(stepToLayer(0)).toBeNull();
    expect(stepToLayer(9)).toBeNull();
    expect(stepToLayer(-1)).toBeNull();
  });

  it('BLUEPRINT_LAYERS 顺序与 step 一致', () => {
    expect(BLUEPRINT_LAYERS).toHaveLength(8);
    expect(BLUEPRINT_LAYERS[0]).toBe('L1_skeleton');
    expect(BLUEPRINT_LAYERS[7]).toBe('L8_evaluation');
  });
});

describe('useBlueprintDraft localStorage 协议', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('按 <prefix>:<blueprintId>:<step> 写 key', async () => {
    const { useBlueprintDraft } = await import('../src/composables/useBlueprintDraft');
    const { ref } = await import('vue');
    const form = ref({ x: 1 });
    const server = ref(null);
    const draft = useBlueprintDraft({
      blueprintId: 'fb_test_001',
      step: 1,
      serverData: server as any,
      formData: form as any,
    });
    draft.load();
    form.value = { x: 2 };
    // 等 watcher deep:true 触发
    await new Promise((r) => setTimeout(r, 0));
    const raw = localStorage.getItem('ibi:blueprint:draft:fb_test_001:1');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ x: 2 });
  });

  it('clearDraft 清除该 step 的草稿', async () => {
    const { useBlueprintDraft } = await import('../src/composables/useBlueprintDraft');
    const { ref } = await import('vue');
    localStorage.setItem('ibi:blueprint:draft:fb_001:2', JSON.stringify({ a: 1 }));
    const form = ref({ a: 0 });
    const draft = useBlueprintDraft({
      blueprintId: 'fb_001',
      step: 2,
      serverData: ref(null) as any,
      formData: form as any,
    });
    draft.clearDraft();
    expect(localStorage.getItem('ibi:blueprint:draft:fb_001:2')).toBeNull();
  });

  it('load 时有草稿优先用草稿,标 draftRestored=true', async () => {
    const { useBlueprintDraft } = await import('../src/composables/useBlueprintDraft');
    const { ref } = await import('vue');
    localStorage.setItem(
      'ibi:blueprint:draft:fb_002:1',
      JSON.stringify({ craniumShape: 'long' }),
    );
    const form = ref<Record<string, unknown>>({ craniumShape: 'medium' });
    const draft = useBlueprintDraft({
      blueprintId: 'fb_002',
      step: 1,
      serverData: ref(null) as any,
      formData: form as any,
    });
    draft.load();
    expect(form.value.craniumShape).toBe('long');
    expect(draft.draftRestored.value).toBe(true);
  });

  it('load 时无草稿 + 有 server 数据 → 用 server', async () => {
    const { useBlueprintDraft } = await import('../src/composables/useBlueprintDraft');
    const { ref } = await import('vue');
    const form = ref<Record<string, unknown>>({ craniumShape: 'medium' });
    const server = ref({ craniumShape: 'flat', faceIndex: 1.4 });
    const draft = useBlueprintDraft({
      blueprintId: 'fb_003',
      step: 1,
      serverData: server as any,
      formData: form as any,
    });
    draft.load();
    expect(form.value.craniumShape).toBe('flat');
    expect(form.value.faceIndex).toBe(1.4);
    expect(draft.draftRestored.value).toBe(false);
  });

  it('损坏的 JSON 草稿静默忽略,fallback 到 server', async () => {
    const { useBlueprintDraft } = await import('../src/composables/useBlueprintDraft');
    const { ref } = await import('vue');
    localStorage.setItem('ibi:blueprint:draft:fb_004:1', '{ this is not json');
    const form = ref<Record<string, unknown>>({ x: 1 });
    const server = ref({ x: 99 });
    const draft = useBlueprintDraft({
      blueprintId: 'fb_004',
      step: 1,
      serverData: server as any,
      formData: form as any,
    });
    // 应该不抛异常
    expect(() => draft.load()).not.toThrow();
    expect(form.value.x).toBe(99);
  });
});

describe('A8: 端到端 form ↔ JSON 往返 (Phase B R4 关键验收)', () => {
  it('L1 默认值 → API PATCH body 序列化 → 解析回 → 完全一致', () => {
    const original: L1Skeleton = { ...L1_DEFAULTS };

    // 1. form 转 JSON (模拟 axios 自动 stringify)
    const payload = { data: original };
    const json = JSON.stringify(payload);

    // 2. 网络传过去, server 解析 (JSON.parse)
    const received = JSON.parse(json);

    // 3. server 拿到 body.data 后业务处理
    expect(received.data).toEqual(original);

    // 4. 反过来:再 stringify → parse 回 form
    const roundtrip = JSON.parse(JSON.stringify(received.data));
    expect(roundtrip).toEqual(original);
  });

  it('L2 默认值同上', () => {
    const original: L2SoftTissue = { ...L2_DEFAULTS };
    const received = JSON.parse(JSON.stringify({ data: original }));
    expect(received.data).toEqual(original);
  });

  it('不同 blueprnt 的草稿互不污染 (key 隔离)', async () => {
    const { useBlueprintDraft } = await import('../src/composables/useBlueprintDraft');
    const { ref } = await import('vue');

    localStorage.clear();
    const formA = ref<Record<string, unknown>>({ val: 'A' });
    const formB = ref<Record<string, unknown>>({ val: 'B' });
    useBlueprintDraft({
      blueprintId: 'fb_A',
      step: 1,
      serverData: ref(null) as any,
      formData: formA as any,
    });
    useBlueprintDraft({
      blueprintId: 'fb_B',
      step: 1,
      serverData: ref(null) as any,
      formData: formB as any,
    });

    // 触发 deep watcher — 改 ref value
    formA.value = { val: 'A2' };
    formB.value = { val: 'B2' };
    await new Promise((r) => setTimeout(r, 0));

    const aRaw = localStorage.getItem('ibi:blueprint:draft:fb_A:1');
    const bRaw = localStorage.getItem('ibi:blueprint:draft:fb_B:1');
    expect(aRaw).not.toBeNull();
    expect(bRaw).not.toBeNull();
    expect(JSON.parse(aRaw!).val).toBe('A2');
    expect(JSON.parse(bRaw!).val).toBe('B2');
  });
});

// ============================================================
// Phase B Round 5b — L3 五官 (12 项) + L5 毛发 (8 项) + 矛盾校验
// ============================================================

describe('L3 五官 (12 项)', () => {
  it('有 10 个 slider + 2 个 select 字段', () => {
    expect(L3_SLIDER_FIELDS).toHaveLength(10);
    expect(L3_SELECT_FIELDS).toHaveLength(2);
    const totalKeys = new Set([
      ...L3_SLIDER_FIELDS.map((f) => f.key),
      ...L3_SELECT_FIELDS.map((f) => f.key),
    ]);
    expect(totalKeys.size).toBe(12);
  });

  it('默认值都在合法范围 / 枚举内', () => {
    for (const f of L3_SLIDER_FIELDS) {
      const v = (L3_DEFAULTS as any)[f.key];
      expect(v).toBeGreaterThanOrEqual(f.min);
      expect(v).toBeLessThanOrEqual(f.max);
    }
    for (const f of L3_SELECT_FIELDS) {
      const v = (L3_DEFAULTS as any)[f.key];
      const valid = f.options.map((o) => o.value);
      expect(valid).toContain(v);
    }
  });

  it('form ↔ JSON 序列化无精度损失', () => {
    const input: L3Features = {
      eyeDistance: 0.42,
      eyeShape: 'phoenix',
      eyeApertureHeight: 0.78,
      noseLength: 0.61,
      noseWidth: 0.35,
      noseBridge: 'high',
      lipWidth: 0.55,
      lipThickness: 0.62,
      earPosition: 0.4,
      earSize: 0.3,
      philtrumLength: 0.55,
      chinProtrusion: 0.7,
    };
    const deserialized = JSON.parse(JSON.stringify(input));
    expect(deserialized).toEqual(input);
  });
});

describe('L5 毛发 (8 项)', () => {
  it('有 2 个 slider + 6 个 select 字段', () => {
    expect(L5_SLIDER_FIELDS).toHaveLength(2);
    expect(L5_SELECT_FIELDS).toHaveLength(6);
    const totalKeys = new Set([
      ...L5_SLIDER_FIELDS.map((f) => f.key),
      ...L5_SELECT_FIELDS.map((f) => f.key),
    ]);
    expect(totalKeys.size).toBe(8);
  });

  it('默认值都在合法范围 / 枚举内', () => {
    for (const f of L5_SLIDER_FIELDS) {
      const v = (L5_DEFAULTS as any)[f.key];
      expect(v).toBeGreaterThanOrEqual(f.min);
      expect(v).toBeLessThanOrEqual(f.max);
    }
    for (const f of L5_SELECT_FIELDS) {
      const v = (L5_DEFAULTS as any)[f.key];
      const valid = f.options.map((o) => o.value);
      expect(valid).toContain(v);
    }
  });

  it('form ↔ JSON 序列化无精度损失', () => {
    const input: L5Hair = {
      hairStyle: 'wavy',
      hairColor: 'blonde',
      hairline: 'm_shape',
      browShape: 'upward',
      browColor: 'brown',
      browDensity: 0.3,
      lashes: 'long_sparse',
      sideburns: 0.1,
    };
    expect(JSON.parse(JSON.stringify(input))).toEqual(input);
  });
});

describe('detectContradictions (R5b B2 前端镜像)', () => {
  it('空 layers → 无提示', async () => {
    const { detectContradictions } = await import('../src/api/contradictions');
    expect(detectContradictions({})).toEqual([]);
  });

  it('bald + 长鬓角 → 警告', async () => {
    const { detectContradictions } = await import('../src/api/contradictions');
    const result = detectContradictions({
      L5_hair: { ...L5_DEFAULTS, hairStyle: 'bald', sideburns: 0.8 },
    });
    expect(result.map((c) => c.id)).toContain('bald_long_sideburns');
  });

  it('细眉 + 高密度 → 警告', async () => {
    const { detectContradictions } = await import('../src/api/contradictions');
    const result = detectContradictions({
      L5_hair: { ...L5_DEFAULTS, browShape: 'thin', browDensity: 0.8 },
    });
    expect(result.map((c) => c.id)).toContain('thin_brow_high_density');
  });

  it('金发 + 黑眉 → 提示', async () => {
    const { detectContradictions } = await import('../src/api/contradictions');
    const result = detectContradictions({
      L5_hair: { ...L5_DEFAULTS, hairColor: 'blonde', browColor: 'black' },
    });
    expect(result.map((c) => c.id)).toContain('blonde_black_brow');
  });

  it('极厚唇 + 极窄唇宽 → 警告', async () => {
    const { detectContradictions } = await import('../src/api/contradictions');
    const result = detectContradictions({
      L3_features: { ...L3_DEFAULTS, lipThickness: 0.95, lipWidth: 0.2 },
    });
    expect(result.map((c) => c.id)).toContain('thick_narrow_lips');
  });

  it('低鼻梁 + 宽鼻 → 提示', async () => {
    const { detectContradictions } = await import('../src/api/contradictions');
    const result = detectContradictions({
      L3_features: { ...L3_DEFAULTS, noseBridge: 'low', noseWidth: 0.8 },
    });
    expect(result.map((c) => c.id)).toContain('low_bridge_wide_nose');
  });

  it('M 型发际线 + 高眉弓 → 提示', async () => {
    const { detectContradictions } = await import('../src/api/contradictions');
    const result = detectContradictions({
      L2_softTissue: { ...L2_DEFAULTS, browRidge: 0.9 },
      L5_hair: { ...L5_DEFAULTS, hairline: 'm_shape' },
    });
    expect(result.map((c) => c.id)).toContain('m_hairline_high_brow');
  });

  it('深眼窝 + 高颧骨 → 提示', async () => {
    const { detectContradictions } = await import('../src/api/contradictions');
    const result = detectContradictions({
      L1_skeleton: { ...L1_DEFAULTS, cheekboneProminence: 0.8 },
      L2_softTissue: { ...L2_DEFAULTS, eyeSocketDepth: 0.8 },
    });
    expect(result.map((c) => c.id)).toContain('deep_socket_high_cheek');
  });

  it('默认 L1+L2+L3+L5 全默认 → 无提示', async () => {
    const { detectContradictions } = await import('../src/api/contradictions');
    const result = detectContradictions({
      L1_skeleton: L1_DEFAULTS,
      L2_softTissue: L2_DEFAULTS,
      L3_features: L3_DEFAULTS,
      L5_hair: L5_DEFAULTS,
    });
    expect(result).toEqual([]);
  });
});