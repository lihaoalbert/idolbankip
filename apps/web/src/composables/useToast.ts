/**
 * 轻量 Toast 系统 — provide/inject, 不引第三方。
 *
 * 用法 (在 main.ts 或 App.vue):
 *   app.provide('toasts', useToast())  // 直接 import 调用即可拿到 reactive 状态
 *
 * 组件内:
 *   const toast = useToast()
 *   toast.success('已保存')
 *   toast.error('上传失败: ' + e.message)
 *
 * ToastContainer.vue 自动响应 toasts.value 渲染队列。
 */
import { ref, readonly } from 'vue';

export type ToastVariant = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  /** ms, 默认 3500 */
  duration: number;
}

const toasts = ref<Toast[]>([]);
let seq = 0;

function push(message: string, variant: ToastVariant, duration: number) {
  const id = ++seq;
  toasts.value = [...toasts.value, { id, message, variant, duration }];
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }
  return id;
}

function dismiss(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    success: (msg: string, duration = 3500) => push(msg, 'success', duration),
    error: (msg: string, duration = 5000) => push(msg, 'error', duration),
    info: (msg: string, duration = 3500) => push(msg, 'info', duration),
    dismiss,
  };
}
