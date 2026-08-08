// Blueprint context — BlueprintWizard provides, Step1~8 inject
//
// 单一来源原则:
// - blueprint ref 由 BlueprintWizard 拥有,只 fetch 一次
// - updateLayer() 走 PATCH + 自动更新 ref(乐观更新,失败回滚)
// - refresh() 强制重新 fetch(草稿恢复/外部改动场景)
//
// 为什么不用 Pinia:这个状态只在 Blueprint 向导路由使用,scope 跟路由生命周期对齐,
// provide/inject 比 Pinia 更精准,且不污染全局 store。

import type { InjectionKey, Ref } from 'vue';
import type { Blueprint } from '@/api/blueprint';

export type LayerStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface BlueprintContext {
  /** 当前 blueprint 全量数据,8 个 layer 都包含 */
  blueprint: Ref<Blueprint | null>;
  /** 加载状态 */
  loading: Ref<boolean>;
  /** 业务错误(创建/加载失败时) */
  error: Ref<string | null>;
  /** PATCH 单层,服务端响应后自动更新 ref */
  updateLayer: (step: LayerStep, data: Record<string, unknown>) => Promise<void>;
  /** 强制刷新整个 blueprint(草稿恢复后用) */
  refresh: () => Promise<void>;
}

export const BlueprintKey: InjectionKey<BlueprintContext> = Symbol('Blueprint');