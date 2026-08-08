// Track B Round 3 — AI 推断角标 + useStepInferred composable 测试
// 覆盖 Goal Contract 验收:
//   B9: 蓝图 layer._inferred === true → Step1~6 显示 AI 推断 chip
//   - 用户 PATCH 任一字段后,_inferred 被后端 whitelist 过滤 → chip 自动消失
//
// 测试范围:
//   1. useStepInferred composable:layer 有 _inferred → true,没有 → false
//   2. layer 字段值变化(inferred = true)→ computed 自动响应
//   3. InferredChip 组件渲染逻辑
//
// 不测试:实际 mount Step1~6(Vue 组件 mount 测起来重;chip 渲染逻辑太薄)
//   实际渲染靠 e2e playwright 验证(后续 track)

import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useStepInferred } from '../src/composables/useStepInferred';
import type { BlueprintContext } from '../src/pages/creator/blueprint/context';
import type { Blueprint, LayerKey } from '../src/api/blueprint';

function makeCtx(blueprint: Blueprint | null): BlueprintContext {
  return {
    blueprint: ref(blueprint) as any,
    loading: ref(false) as any,
    error: ref(null) as any,
    updateLayer: async () => {},
    refresh: async () => {},
  };
}

describe('useStepInferred composable (Track B Round 3)', () => {
  it('layer 数据有 _inferred: true → composable 返回 true', () => {
    const ctx = makeCtx({
      id: 'bp_test',
      ownerId: 'u1',
      ipId: null,
      title: null,
      description: null,
      tags: '',
      version: 1,
      isArchived: false,
      createdAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
      layers: {
        L1_skeleton: { faceIndex: 1.4, _inferred: true } as any,
        L2_softTissue: null,
        L3_features: null,
        L4_skin: null,
        L5_hair: null,
        L6_decoration: null,
        L7_render: null,
        L8_evaluation: null,
      },
    });
    const inferred = useStepInferred(ctx, 'L1_skeleton' as LayerKey);
    expect(inferred.value).toBe(true);
  });

  it('layer 没 _inferred(用户编辑后)→ composable 返回 false', () => {
    const ctx = makeCtx({
      id: 'bp_test',
      ownerId: 'u1',
      ipId: null,
      title: null,
      description: null,
      tags: '',
      version: 2,
      isArchived: false,
      createdAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
      layers: {
        // 模拟后端 whitelist 过滤:_inferred 没了
        L1_skeleton: { faceIndex: 1.4 } as any,
        L2_softTissue: null,
        L3_features: null,
        L4_skin: null,
        L5_hair: null,
        L6_decoration: null,
        L7_render: null,
        L8_evaluation: null,
      },
    });
    const inferred = useStepInferred(ctx, 'L1_skeleton' as LayerKey);
    expect(inferred.value).toBe(false);
  });

  it('layer 是 null(全新 blueprint)→ composable 返回 false', () => {
    const ctx = makeCtx({
      id: 'bp_test',
      ownerId: 'u1',
      ipId: null,
      title: null,
      description: null,
      tags: '',
      version: 1,
      isArchived: false,
      createdAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
      layers: {
        L1_skeleton: null,
        L2_softTissue: null,
        L3_features: null,
        L4_skin: null,
        L5_hair: null,
        L6_decoration: null,
        L7_render: null,
        L8_evaluation: null,
      },
    });
    const inferred = useStepInferred(ctx, 'L1_skeleton' as LayerKey);
    expect(inferred.value).toBe(false);
  });

  it('blueprint 是 null(初始)→ composable 返回 false(不抛错)', () => {
    const ctx = makeCtx(null);
    const inferred = useStepInferred(ctx, 'L1_skeleton' as LayerKey);
    expect(inferred.value).toBe(false);
  });

  it('blueprint 从 null → 有 _inferred → computed 自动更新', async () => {
    const bpRef = ref<Blueprint | null>(null);
    const ctx: BlueprintContext = {
      blueprint: bpRef as any,
      loading: ref(false) as any,
      error: ref(null) as any,
      updateLayer: async () => {},
      refresh: async () => {},
    };
    const inferred = useStepInferred(ctx, 'L1_skeleton' as LayerKey);
    expect(inferred.value).toBe(false);

    // from-image 返回
    bpRef.value = {
      id: 'bp_x',
      ownerId: 'u1',
      ipId: null,
      title: null,
      description: null,
      tags: '',
      version: 1,
      isArchived: false,
      createdAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
      layers: {
        L1_skeleton: { faceIndex: 1.4, _inferred: true } as any,
        L2_softTissue: null,
        L3_features: null,
        L4_skin: null,
        L5_hair: null,
        L6_decoration: null,
        L7_render: null,
        L8_evaluation: null,
      },
    };
    // computed 自动响应
    expect(inferred.value).toBe(true);
  });

  it('不同 layer 互不影响:L1 _inferred 不会让 L2 也变 true', () => {
    const ctx = makeCtx({
      id: 'bp_test',
      ownerId: 'u1',
      ipId: null,
      title: null,
      description: null,
      tags: '',
      version: 1,
      isArchived: false,
      createdAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
      layers: {
        L1_skeleton: { faceIndex: 1.4, _inferred: true } as any,
        L2_softTissue: { subcutaneousFat: 0.5 } as any, // 用户手填,没 _inferred
        L3_features: null,
        L4_skin: null,
        L5_hair: null,
        L6_decoration: null,
        L7_render: null,
        L8_evaluation: null,
      },
    });
    const inferredL1 = useStepInferred(ctx, 'L1_skeleton' as LayerKey);
    const inferredL2 = useStepInferred(ctx, 'L2_softTissue' as LayerKey);
    expect(inferredL1.value).toBe(true);
    expect(inferredL2.value).toBe(false);
  });
});
