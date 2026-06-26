// Track B Round 3 — AI 推断状态 composable
//
// Step1~6 都要判"本层是否由 AI 从参考图反推"。后端约定:layer 数据上挂
// `_inferred: true` 表示整层是 AI 推的,用户 PATCH 任一字段后,
// validateLayerData 走 class-validator whitelist 会把 _inferred 过滤掉 —
// 整层标记消失。
//
// 用法:
//   import { useStepInferred } from '@/composables/useStepInferred';
//   const isLayerInferred = useStepInferred(blueprintCtx, 'L1_skeleton');
//   <InferredChip v-if="isLayerInferred" />

import { computed, type ComputedRef } from 'vue';
import type { LayerKey } from '@/api/blueprint';
import type { BlueprintContext } from '@/pages/creator/blueprint/context';

export function useStepInferred(
  ctx: BlueprintContext,
  layerKey: LayerKey,
): ComputedRef<boolean> {
  return computed(() => ctx.blueprint.value?.layers[layerKey]?._inferred === true);
}
