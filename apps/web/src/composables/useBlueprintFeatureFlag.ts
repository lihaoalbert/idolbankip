/**
 * Blueprint Wizard feature flag (Phase C kill switch)
 *
 * 读取 Vite build-time env var `VITE_BLUEPRINT_WIZARD_ENABLED`。
 * 默认 ON — 任何非 'false' 字符串都视为启用(undefined / '' / 'true' 都算 ON)。
 *
 * 为什么 !== 'false' 而非 === 'true':
 *   - Vite 没设该 env 时是 undefined,=== 'true' 会判为 OFF,语义反了
 *   - Joi backend 用 default(true),前端用 !== 'false' 保持一致
 *
 * 用法:
 *   const { enabled } = useBlueprintFeatureFlag();
 *   if (enabled.value) { ... }
 *
 * Build-time 注入,所以路由守卫直接读这个值不会有时序问题。
 */
import { computed } from 'vue';

export function useBlueprintFeatureFlag() {
  const raw = import.meta.env.VITE_BLUEPRINT_WIZARD_ENABLED;
  const enabled = computed(() => raw !== 'false');
  return { enabled, raw };
}