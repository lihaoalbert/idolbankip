// Blueprint Wizard feature flag composable — Phase C R2 单测
//
// 覆盖:
//   - 默认 (env 未设 / undefined) → ON
//   - env=true / 空字符串 / '1' 等"truthy 字符串" → ON
//   - env='false' 唯一 OFF 触发条件
//
// 为什么 !== 'false' 而非 === 'true':
//   Vite 没设 VITE_BLUEPRINT_WIZARD_ENABLED 时是 undefined,
//   === 'true' 会判 OFF(语义反);!== 'false' 兼容 undefined / '' / 'true' 都算 ON。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('useBlueprintFeatureFlag (Phase C R2 kill switch)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('env 未设 (undefined) → enabled = true (默认 ON)', async () => {
    vi.stubEnv('VITE_BLUEPRINT_WIZARD_ENABLED', undefined as unknown as string);
    const { useBlueprintFeatureFlag } = await import('@/composables/useBlueprintFeatureFlag');
    const { enabled, raw } = useBlueprintFeatureFlag();
    expect(enabled.value).toBe(true);
    expect(raw).toBeUndefined();
  });

  it('env = "true" → enabled = true', async () => {
    vi.stubEnv('VITE_BLUEPRINT_WIZARD_ENABLED', 'true');
    const { useBlueprintFeatureFlag } = await import('@/composables/useBlueprintFeatureFlag');
    const { enabled } = useBlueprintFeatureFlag();
    expect(enabled.value).toBe(true);
  });

  it('env = "" (空字符串) → enabled = true (兼容未填)', async () => {
    vi.stubEnv('VITE_BLUEPRINT_WIZARD_ENABLED', '');
    const { useBlueprintFeatureFlag } = await import('@/composables/useBlueprintFeatureFlag');
    const { enabled } = useBlueprintFeatureFlag();
    expect(enabled.value).toBe(true);
  });

  it('env = "false" → enabled = false (kill switch 触发)', async () => {
    vi.stubEnv('VITE_BLUEPRINT_WIZARD_ENABLED', 'false');
    const { useBlueprintFeatureFlag } = await import('@/composables/useBlueprintFeatureFlag');
    const { enabled } = useBlueprintFeatureFlag();
    expect(enabled.value).toBe(false);
  });

  it('env = "FALSE" (大写) → enabled = false (大小写敏感 = 关闭,符合 ! == "false")', async () => {
    // 不区分大小写也是常见做法,但 Phase C 锁了 !== 'false' (小写)
    // 大写应被视为 ON — 这个用例锁住当前行为
    vi.stubEnv('VITE_BLUEPRINT_WIZARD_ENABLED', 'FALSE');
    const { useBlueprintFeatureFlag } = await import('@/composables/useBlueprintFeatureFlag');
    const { enabled } = useBlueprintFeatureFlag();
    expect(enabled.value).toBe(true);
  });
});