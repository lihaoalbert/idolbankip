// Blueprint 草稿 composable — 按 blueprintId 分 key 持久化每层 form data
//
// 设计:
// - localStorage key: `ibi:blueprint:draft:<blueprintId>:<step>`
// - 值:JSON 序列化的 layer data
// - 写入时机:form 任意 input 变化时(debounced 由调用方控制)
// - 读取时机:Step 组件 mount 时,优先用草稿值,没有再从 Blueprint.layers 取
// - 清除时机:后端 PATCH 成功后清除该层草稿
// - 冲突提示:PATCH 失败保留草稿(网络错误可恢复)
//
// R4 范围:每层独立草稿;Phase 2 引入跨层 conflict detection

import { ref, watch, type Ref } from 'vue';

const STORAGE_PREFIX = 'ibi:blueprint:draft';

function key(blueprintId: string, step: number): string {
  return `${STORAGE_PREFIX}:${blueprintId}:${step}`;
}

// T 必须能被 JSON.stringify,这里用 object 而非 Record<string, unknown>
// (interface 默认不继承 Record 的 index signature,会卡 TS2344)
export interface UseBlueprintDraftOptions<T extends object> {
  blueprintId: string;
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** server 数据,后端权威值 */
  serverData: Ref<T | null>;
  /** 表单状态(双向绑定) */
  formData: Ref<T>;
  /** PATCH 成功回调 */
  onPersistSuccess?: () => void;
}

export function useBlueprintDraft<T extends object>(
  options: UseBlueprintDraftOptions<T>,
) {
  const { blueprintId, step, serverData, formData, onPersistSuccess } = options;

  const draftRestored = ref(false);

  // 1. mount 时:有草稿就用草稿,否则用 server 数据,否则保留 formData 现状
  function load() {
    try {
      const raw = localStorage.getItem(key(blueprintId, step));
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        formData.value = { ...formData.value, ...parsed };
        draftRestored.value = true;
        return;
      }
    } catch {
      // 损坏的 JSON 静默忽略
    }
    if (serverData.value) {
      formData.value = { ...formData.value, ...serverData.value };
    }
  }

  // 2. form 变化 → 写草稿(同步,无 debounce — 草稿大小 < 1KB)
  watch(
    formData,
    (next) => {
      try {
        localStorage.setItem(key(blueprintId, step), JSON.stringify(next));
      } catch {
        // localStorage 满了,忽略 — 后端 PATCH 仍是兜底
      }
    },
    { deep: true },
  );

  // 3. PATCH 成功后清除草稿
  function clearDraft() {
    try {
      localStorage.removeItem(key(blueprintId, step));
      draftRestored.value = false;
    } catch {
      // 忽略
    }
    onPersistSuccess?.();
  }

  // 4. 主动清除草稿(用户点 "丢弃草稿,改用 server")
  function discardDraft() {
    if (serverData.value) {
      formData.value = { ...formData.value, ...serverData.value };
    }
    clearDraft();
  }

  return {
    load,
    clearDraft,
    discardDraft,
    draftRestored,
  };
}