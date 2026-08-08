// Phase B R4 B1 — 前端单元测试
// 覆盖 Goal Contract 验收:
//   A8: form value ↔ JSON 序列化无精度损失 / 无默认值污染
//
// 范围:L1 + L2 数据形状 + useBlueprintDraft localStorage key 协议
// Phase B R5 起:加 L3+L5+L7+L8 测试
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import {
  L1_DEFAULTS,
  L2_DEFAULTS,
  L3_DEFAULTS,
  L4_DEFAULTS,
  L5_DEFAULTS,
  L6_DEFAULTS,
  L1_SLIDER_FIELDS,
  L2_SLIDER_FIELDS,
  L3_SLIDER_FIELDS,
  L4_SLIDER_FIELDS,
  L5_SLIDER_FIELDS,
  L6_SLIDER_FIELDS,
  L1_SELECT_FIELDS,
  L3_SELECT_FIELDS,
  L4_SELECT_FIELDS,
  L5_SELECT_FIELDS,
  L6_SELECT_FIELDS,
  type L1Skeleton,
  type L2SoftTissue,
  type L3Features,
  type L4Skin,
  type L5Hair,
  type L6Decoration,
  stepToLayer,
  BLUEPRINT_LAYERS,
} from '../src/api/blueprint';

describe('L1 骨骼 (9 项: 8 字段 + gender)', () => {
  it('有 6 个 slider 字段 + 3 个 select 字段(cranium + jawAngle + gender)', () => {
    expect(L1_SLIDER_FIELDS).toHaveLength(6);
    expect(L1_SELECT_FIELDS).toHaveLength(3);
    // 总 9 字段 (Phase C Beta Q3 加 gender)
    const totalKeys = new Set([
      ...L1_SLIDER_FIELDS.map((f) => f.key),
      ...L1_SELECT_FIELDS.map((f) => f.key),
    ]);
    expect(totalKeys.size).toBe(9);
    expect(L1_DEFAULTS).toHaveProperty('gender');
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
        'gender',
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
// ============================================================
// Phase B Round 6 — L4 皮肤 + L6 修饰 + L7 prompt 生成器
// ============================================================

describe('L4 皮肤 (6 项)', () => {
  it('有 4 个 slider + 2 个 select 字段', () => {
    expect(L4_SLIDER_FIELDS).toHaveLength(4);
    expect(L4_SELECT_FIELDS).toHaveLength(2);
    const totalKeys = new Set([
      ...L4_SLIDER_FIELDS.map((f) => f.key),
      ...L4_SELECT_FIELDS.map((f) => f.key),
    ]);
    expect(totalKeys.size).toBe(6);
  });

  it('默认值都在合法范围 / 枚举内', () => {
    for (const f of L4_SLIDER_FIELDS) {
      const v = (L4_DEFAULTS as any)[f.key];
      expect(v).toBeGreaterThanOrEqual(f.min);
      expect(v).toBeLessThanOrEqual(f.max);
    }
    for (const f of L4_SELECT_FIELDS) {
      const v = (L4_DEFAULTS as any)[f.key];
      const valid = f.options.map((o) => o.value);
      expect(valid).toContain(v);
    }
  });

  it('form ↔ JSON 序列化无精度损失', () => {
    const input: L4Skin = {
      skinTone: 'olive',
      skinTexture: 'matte',
      freckles: 0.35,
      moles: 0.12,
      wrinkles: 0.08,
      pores: 0.55,
    };
    expect(JSON.parse(JSON.stringify(input))).toEqual(input);
  });
});

describe('L6 修饰 (6 项)', () => {
  it('有 3 个 slider + 3 个 select 字段', () => {
    expect(L6_SLIDER_FIELDS).toHaveLength(3);
    expect(L6_SELECT_FIELDS).toHaveLength(3);
    const totalKeys = new Set([
      ...L6_SLIDER_FIELDS.map((f) => f.key),
      ...L6_SELECT_FIELDS.map((f) => f.key),
    ]);
    expect(totalKeys.size).toBe(6);
  });

  it('默认值都在合法范围 / 枚举内', () => {
    for (const f of L6_SLIDER_FIELDS) {
      const v = (L6_DEFAULTS as any)[f.key];
      expect(v).toBeGreaterThanOrEqual(f.min);
      expect(v).toBeLessThanOrEqual(f.max);
    }
    for (const f of L6_SELECT_FIELDS) {
      const v = (L6_DEFAULTS as any)[f.key];
      const valid = f.options.map((o) => o.value);
      expect(valid).toContain(v);
    }
  });

  it('form ↔ JSON 序列化无精度损失', () => {
    const input: L6Decoration = {
      makeup: 'heavy',
      lipColor: 'dark',
      blush: 0.7,
      eyeshadow: 0.55,
      accessory: 'glasses',
      facePaint: 0.0,
    };
    expect(JSON.parse(JSON.stringify(input))).toEqual(input);
  });
});

describe('buildPrompts (R6 B2 前端镜像)', () => {
  it('空 layers 仍返回基础 prompt', async () => {
    const { buildPrompts } = await import('../src/api/prompt-builder');
    const r = buildPrompts({});
    expect(r.promptZh).toMatch(/肖像/);
    expect(r.promptEn).toMatch(/portrait/);
    expect(r.variants).toHaveLength(4);
  });

  it('L1+L3+L4 拼出含肤色 + 眼型 + 颅型 的中文', async () => {
    const { buildPrompts } = await import('../src/api/prompt-builder');
    const r = buildPrompts({
      L1_skeleton: { ...L1_DEFAULTS, craniumShape: 'long' },
      L3_features: { ...L3_DEFAULTS, eyeShape: 'phoenix' },
      L4_skin: { ...L4_DEFAULTS, skinTone: 'tan' },
    });
    expect(r.promptZh).toMatch(/长颅/);
    expect(r.promptZh).toMatch(/丹凤眼/);
    expect(r.promptZh).toMatch(/小麦/);
  });

  it('英文 prompt 含 cinematic 风格后缀', async () => {
    const { buildPrompts } = await import('../src/api/prompt-builder');
    const r = buildPrompts({});
    expect(r.promptEn).toMatch(/cinematic/);
    expect(r.promptEn).toMatch(/85mm/);
  });

  it('MJ 变体含 --ar 标志', async () => {
    const { buildPrompts } = await import('../src/api/prompt-builder');
    const r = buildPrompts({}, ['mj']);
    expect(r.variants).toHaveLength(1);
    expect(r.variants[0].platform).toBe('mj');
    expect(r.variants[0].prompt).toMatch(/--ar/);
    expect(r.variants[0].prompt).toMatch(/--style raw/);
  });

  it('SD 变体含 Negative prompt', async () => {
    const { buildPrompts } = await import('../src/api/prompt-builder');
    const r = buildPrompts({}, ['sd']);
    expect(r.variants[0].prompt).toMatch(/Negative prompt/);
  });

  it('jimeng/doubao 用中文 prompt', async () => {
    const { buildPrompts } = await import('../src/api/prompt-builder');
    const r = buildPrompts({}, ['jimeng', 'doubao']);
    expect(r.variants[0].prompt).toMatch(/肖像/);
    expect(r.variants[1].prompt).toMatch(/肖像/);
  });

  it('确定性:相同输入 → 相同输出', async () => {
    const { buildPrompts } = await import('../src/api/prompt-builder');
    const layers = {
      L1_skeleton: L1_DEFAULTS,
      L3_features: L3_DEFAULTS,
      L4_skin: L4_DEFAULTS,
      L5_hair: L5_DEFAULTS,
    };
    const a = buildPrompts(layers, ['mj']);
    const b = buildPrompts(layers, ['mj']);
    expect(a.promptZh).toBe(b.promptZh);
    expect(a.promptEn).toBe(b.promptEn);
    expect(a.variants[0].prompt).toBe(b.variants[0].prompt);
  });
});

// ============================================================
// Phase B R7 — L8 Evaluation: 前端 RadarChart + L8 types
// ============================================================

import {
  computeAvgScore,
  computeAxisEnds,
  computeDataPath,
  computeDataPoints,
  computeGridCircles,
  computeLabelPositions,
  scoreColor,
  type RadarScore,
} from '../src/components/blueprint/radar-helpers';
import type { L8SubScores, EvaluationResult } from '../src/api/blueprint';

describe('RadarChart helpers (R7 纯函数单测)', () => {
  const threeScores: RadarScore[] = [
    { label: '原创度', value: 7.5 },
    { label: '一致性', value: 9.0 },
    { label: '美学', value: 6.0 },
  ];

  it('computeAvgScore 求平均分(7.5)', () => {
    expect(computeAvgScore(threeScores)).toBeCloseTo(7.5, 5);
  });

  it('computeAvgScore 空数组 → 0', () => {
    expect(computeAvgScore([])).toBe(0);
  });

  it('scoreColor: >=7 绿, 4-7 黄, <4 红', () => {
    expect(scoreColor(8)).toBe('#3f7d3f');
    expect(scoreColor(5)).toBe('#a87a2c');
    expect(scoreColor(2)).toBe('#a83232');
    expect(scoreColor(7)).toBe('#3f7d3f'); // 边界 = 7 = 绿
    expect(scoreColor(4)).toBe('#a87a2c'); // 边界 = 4 = 黄
  });

  it('computeGridCircles: 3 圈(33%/67%/100% 半径)', () => {
    const circles = computeGridCircles(240, 10);
    expect(circles).toHaveLength(3);
    expect(circles[0].label).toBe('3.3');
    expect(circles[1].label).toBe('6.7');
    expect(circles[2].label).toBe('10.0');
  });

  it('computeAxisEnds: 3 个轴端点(120° 间隔,12 点钟起)', () => {
    const ends = computeAxisEnds(240, threeScores);
    expect(ends).toHaveLength(3);
    // 第一个轴应当指向上方 (12 点钟)
    const first = ends[0];
    expect(first.y).toBeLessThan(120); // y < cy (向上)
  });

  it('computeDataPoints: 归一化到 max(0~1 半径)', () => {
    const points = computeDataPoints(240, 10, threeScores);
    expect(points).toHaveLength(3);
    expect(points[0].score.label).toBe('原创度');
    // 7.5/10 = 0.75 半径
    const first = points[0];
    const cx = 120, cy = 120;
    const dx = first.x - cx, dy = first.y - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    const expected = (120 * 0.65) * 0.75;
    expect(r).toBeCloseTo(expected, 1);
  });

  it('computeDataPath: 闭合多边形', () => {
    const points = computeDataPoints(240, 10, threeScores);
    const path = computeDataPath(points);
    expect(path).toMatch(/^M /);
    expect(path).toMatch(/ L /);
    expect(path).toMatch(/ Z$/);
  });

  it('computeDataPath: 空数组 → 空字符串', () => {
    expect(computeDataPath([])).toBe('');
  });

  it('computeLabelPositions: 比轴端再外推 22px', () => {
    const labels = computeLabelPositions(240, threeScores);
    const axes = computeAxisEnds(240, threeScores);
    expect(labels).toHaveLength(3);
    for (let i = 0; i < 3; i += 1) {
      const d = Math.sqrt(
        (labels[i].x - axes[i].x) ** 2 + (labels[i].y - axes[i].y) ** 2,
      );
      expect(d).toBeCloseTo(22, 0);
    }
  });
});

describe('L8 types + EvaluationResult 形状 (R7)', () => {
  it('L8SubScores 有 8 个 0~1 字段', () => {
    const sub: L8SubScores = {
      L1_complexity: 0.5,
      L2_expressiveness: 0.5,
      L3_distinctiveness: 0.5,
      L4_skin_realism: 0.4,
      L5_hair_coverage: 0.4,
      L6_decoration_completeness: 0.3,
      L7_prompt_quality: 0,
      L8_contradiction_bonus: 0,
    };
    const keys = Object.keys(sub);
    expect(keys).toHaveLength(8);
    for (const k of keys) {
      const v = (sub as any)[k];
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('EvaluationResult 含 3 主分 + 8 sub + 矛盾 + 时间戳', () => {
    const r: EvaluationResult = {
      id: 'fb_test_001',
      scores: { originality: 6.5, consistency: 9.0, aesthetics: 7.0 },
      evaluated_at: '2026-06-23T00:00:00.000Z',
      contradictions: [
        {
          id: 'bald_long_sideburns',
          layer: 'L5',
          title: '光头 + 长鬓角',
          description: '建议 sideburns ≤ 0.3',
          severity: 'warning',
        },
      ],
      sub_scores: {
        L1_complexity: 0.5,
        L2_expressiveness: 0.5,
        L3_distinctiveness: 0.5,
        L4_skin_realism: 0.4,
        L5_hair_coverage: 0.4,
        L6_decoration_completeness: 0.3,
        L7_prompt_quality: 0,
        L8_contradiction_bonus: 0.5,
      },
    };
    expect(r.scores.originality).toBe(6.5);
    expect(r.sub_scores?.L8_contradiction_bonus).toBe(0.5);
    expect(r.contradictions).toHaveLength(1);
    expect(r.contradictions[0].severity).toBe('warning');
  });
});

// Phase C Beta 反馈回归:completedSteps 按 layers 数据真填充判完成
// (不是按当前 step 之前的全部标完成 — 那个旧逻辑会导致 step 2 永远 disabled)
//
// StepperProgress 进一步加了"顺序解锁"规则:step N 可点 ⇔ step N-1 已完成
// (用户的心理模型 — 填完 step 1 就想点 step 2)
describe('Wizard step unlock(Phase C Beta 第二轮修)', () => {
  const LAYER_KEYS = ['L1_skeleton', 'L2_softTissue', 'L3_features', 'L4_skin', 'L5_hair', 'L6_decoration', 'L7_render'] as const;

  function completedSteps(layers: Record<string, unknown>): number[] {
    const list: number[] = [];
    for (let i = 0; i < LAYER_KEYS.length; i += 1) {
      if (layers[LAYER_KEYS[i]] !== null) list.push(i + 1);
    }
    return list;
  }

  function isClickable(num: number, current: number, completedSet: Set<number>): boolean {
    if (num === current) return true;
    if (completedSet.has(num)) return true;
    if (num > 1 && completedSet.has(num - 1)) return true;
    return false;
  }

  it('空 Blueprint:只有当前步可点', () => {
    const layers = Object.fromEntries(LAYER_KEYS.map((k) => [k, null]));
    const completed = completedSteps(layers);
    const set = new Set(completed);
    expect(set.size).toBe(0);
    // 用户在 step 1
    expect(isClickable(1, 1, set)).toBe(true);
    expect(isClickable(2, 1, set)).toBe(false);  // 没填 step 1,不能跳
    expect(isClickable(3, 1, set)).toBe(false);
  });

  it('只填 L1,用户在 step 1:step 1 + step 2 可点(顺序解锁)', () => {
    const layers: Record<string, unknown> = Object.fromEntries(LAYER_KEYS.map((k) => [k, null]));
    layers.L1_skeleton = { faceIndex: 1.4 };
    const completed = completedSteps(layers);
    const set = new Set(completed);
    expect(set).toEqual(new Set([1]));
    // step 2 应该可点 — 因为 step 1 已完成(顺序解锁)
    expect(isClickable(1, 1, set)).toBe(true);
    expect(isClickable(2, 1, set)).toBe(true);
    expect(isClickable(3, 1, set)).toBe(false);  // step 2 没填,不能跳
  });

  it('填 L1+L2+L7,用户在 step 4:step 1,2,4,7 可点', () => {
    const layers: Record<string, unknown> = Object.fromEntries(LAYER_KEYS.map((k) => [k, null]));
    layers.L1_skeleton = { faceIndex: 1.4 };
    layers.L2_softTissue = { subcutaneousFat: 0.5 };
    layers.L7_render = { promptZh: '脸' };
    const completed = completedSteps(layers);
    const set = new Set(completed);
    expect(set).toEqual(new Set([1, 2, 7]));
    // step 3 应该可点 — step 2 完成 → 顺序解锁
    expect(isClickable(3, 4, set)).toBe(true);
    // step 4 是当前
    expect(isClickable(4, 4, set)).toBe(true);
    // step 5 没填 → 不该可点
    expect(isClickable(5, 4, set)).toBe(false);
    // step 7 已完成 → 可点(回访)
    expect(isClickable(7, 4, set)).toBe(true);
  });
});

// ===================== Phase 2 Blueprint 2.0 Track A =====================
// SchematicFace + 5 预设 + L1 gender — 见 docs/blueprint-schematic-face.md
import { PRESETS } from '../src/api/blueprint';
import { computeGeom } from '../src/components/blueprint/schematicGeom';

describe('Blueprint 2.0 · L1 gender 字段', () => {
  it('L1_DEFAULTS 默认女性', () => {
    expect(L1_DEFAULTS.gender).toBe('female');
  });

  it('L1_SELECT_FIELDS 含性别', () => {
    const genderField = L1_SELECT_FIELDS.find((f) => f.key === 'gender');
    expect(genderField).toBeDefined();
    const opts = genderField?.options.map((o) => o.value) ?? [];
    expect(opts).toContain('female');
    expect(opts).toContain('male');
  });

  it('L1_SELECT_FIELDS 字段总数 = 3(cranium + jawAngle + gender)', () => {
    expect(L1_SELECT_FIELDS).toHaveLength(3);
  });
});

describe('Blueprint 2.0 · PRESETS 5 个快速预设 (Q4)', () => {
  it('总数 = 5', () => {
    expect(PRESETS).toHaveLength(5);
  });

  it('每个预设都有 id / label / description / 6 层', () => {
    for (const p of PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.layers).toHaveProperty('L1_skeleton');
      expect(p.layers).toHaveProperty('L2_softTissue');
      expect(p.layers).toHaveProperty('L3_features');
      expect(p.layers).toHaveProperty('L4_skin');
      expect(p.layers).toHaveProperty('L5_hair');
      expect(p.layers).toHaveProperty('L6_decoration');
    }
  });

  it('每个预设的 L1~L6 字段数 = 9+6+12+6+8+6 = 45(原 spec 46 含 gender,Q3 后变 45+gender=46)', () => {
    // L1 = 9(gender + cranium + faceIndex + cheekboneWidth + cheekboneProminence + jawWidth + jawAngle + upper + mid)
    // L2 = 6, L3 = 12, L4 = 6, L5 = 8, L6 = 6
    const expectedCount: Record<string, number> = {
      L1_skeleton: 9,
      L2_softTissue: 6,
      L3_features: 12,
      L4_skin: 6,
      L5_hair: 8,
      L6_decoration: 6,
    };
    for (const p of PRESETS) {
      for (const [layerKey, count] of Object.entries(expectedCount)) {
        const layer = (p.layers as any)[layerKey];
        expect(Object.keys(layer).length, `${p.id}/${layerKey}`).toBe(count);
      }
    }
  });

  it('5 个预设 id 唯一', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('欧洲男性 / 拉丁男性预设 gender=male', () => {
    const males = PRESETS.filter((p) => p.layers.L1_skeleton.gender === 'male');
    expect(males.map((p) => p.id).sort()).toEqual(['european_male', 'latino_male']);
  });

  it('亚洲 / 中性少年 / 非洲女性预设 gender=female', () => {
    const females = PRESETS.filter((p) => p.layers.L1_skeleton.gender === 'female');
    expect(females.map((p) => p.id).sort()).toEqual(['african_female', 'androgynous_youth', 'asian_female']);
  });

  it('数值字段都在 [0,1] 或 [1.0, 1.6] 范围内(faceIndex)', () => {
    for (const p of PRESETS) {
      const l1 = p.layers.L1_skeleton;
      expect(l1.faceIndex).toBeGreaterThanOrEqual(1.0);
      expect(l1.faceIndex).toBeLessThanOrEqual(1.6);
      for (const k of ['cheekboneWidth', 'cheekboneProminence', 'jawWidth', 'upperThirdRatio', 'midThirdRatio'] as const) {
        expect(l1[k], `${p.id}/${k}`).toBeGreaterThanOrEqual(0);
        expect(l1[k], `${p.id}/${k}`).toBeLessThanOrEqual(1);
      }
      for (const k of ['subcutaneousFat', 'masseter', 'buccalFat', 'eyeSocketDepth', 'browRidge', 'nasolabialFold'] as const) {
        const v = (p.layers.L2_softTissue as any)[k];
        expect(v, `${p.id}/${k}`).toBeGreaterThanOrEqual(0);
        expect(v, `${p.id}/${k}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('Blueprint 2.0 · SchematicFace computeGeom', () => {
  it('默认脸:女性 / 标准椭圆脸', () => {
    const l1: L1Skeleton = { ...L1_DEFAULTS };
    const l3: L3Features = { ...L3_DEFAULTS };
    const g = computeGeom(l1, l3);
    expect(g.isMale).toBe(false);
    expect(g.fw).toBe(240);
    expect(g.fh).toBe(240 * 1.35); // faceIndex default
    expect(g.cx).toBe(300);
    expect(g.cy).toBe(420);
    // 三停:上 0.33 + 中 0.34 + 下 0.33 (默认)
    expect(g.browY).toBeCloseTo(420 - (240 * 1.35) / 2 + (240 * 1.35) * 0.33, 1);
  });

  it('gender=male 时 jawX 比 female 大 8%(扣 cx 后比)', () => {
    const l1Female: L1Skeleton = { ...L1_DEFAULTS, gender: 'female' };
    const l1Male: L1Skeleton = { ...L1_DEFAULTS, gender: 'male' };
    const l3: L3Features = { ...L3_DEFAULTS };
    const gf = computeGeom(l1Female, l3);
    const gm = computeGeom(l1Male, l3);
    expect(gm.isMale).toBe(true);
    // male 用 1.08,female 用 0.95;扣 cx 后比 = 1.08/0.95 ≈ 1.137
    // 注:不扣 cx 比 = (cx + 87.48) / (cx + 76.95) ≈ 1.0279,差很多
    const maleHalf = gm.jawX - gm.cx;
    const femaleHalf = gf.jawX - gf.cx;
    expect(maleHalf / femaleHalf).toBeCloseTo(1.08 / 0.95, 3);
  });

  it('chinProtrusion 来自 L3,影响 chinX', () => {
    const l1: L1Skeleton = { ...L1_DEFAULTS };
    const l3Flat: L3Features = { ...L3_DEFAULTS, chinProtrusion: 0 };
    const l3Forward: L3Features = { ...L3_DEFAULTS, chinProtrusion: 1 };
    const g1 = computeGeom(l1, l3Flat);
    const g2 = computeGeom(l1, l3Forward);
    expect(g2.chinX - g1.chinX).toBeCloseTo(12, 5); // 0.0→1.0 chinX 加 12
  });

  it('craniumShape=long 让 topY 上移 15', () => {
    const l1: L1Skeleton = { ...L1_DEFAULTS, craniumShape: 'long' };
    const l3: L3Features = { ...L3_DEFAULTS };
    const g = computeGeom(l1, l3);
    // 长颅:face top 向上调 -15
    const baseTopY = 420 - (240 * l1.faceIndex) / 2;
    expect(g.topY - baseTopY).toBe(-15);
  });

  it('faceIndex 越大 face 越高', () => {
    const l1Short: L1Skeleton = { ...L1_DEFAULTS, faceIndex: 1.0 };
    const l1Long: L1Skeleton = { ...L1_DEFAULTS, faceIndex: 1.6 };
    const l3: L3Features = { ...L3_DEFAULTS };
    const gs = computeGeom(l1Short, l3);
    const gl = computeGeom(l1Long, l3);
    expect(gl.fh).toBeGreaterThan(gs.fh);
    expect(gl.chinY).toBeGreaterThan(gs.chinY); // 长脸下巴更靠下
  });
});
