/**
 * 暗色模式 — 通过给 <html> 加/删 .dark 类切换主题
 *
 * 偏好顺序: localStorage('theme') → 系统 prefers-color-scheme → 'light'
 *
 * 用法 (main.ts 在挂载前调用一次, 避免页面闪烁):
 *   useDarkMode().init()
 * 组件内:
 *   const { isDark, toggle } = useDarkMode()
 */
import { ref, watch } from 'vue';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'ibi.theme';

function detectInitial(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

const theme = ref<Theme>(detectInitial());

function apply(t: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (t === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.style.colorScheme = t;
}

function setTheme(t: Theme) {
  theme.value = t;
  apply(t);
  try { localStorage.setItem(STORAGE_KEY, t); } catch {}
}

function toggle() {
  setTheme(theme.value === 'dark' ? 'light' : 'dark');
}

function init() {
  apply(theme.value);
}

// 跨 tab 同步
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
      setTheme(e.newValue);
    }
  });
}

watch(theme, apply);

export function useDarkMode() {
  return {
    theme,
    isDark: theme.value === 'dark',
    setTheme,
    toggle,
    init,
  };
}