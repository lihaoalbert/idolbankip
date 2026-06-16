/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 调色板用 CSS 变量, .dark 类切换 (composables/useDarkMode.ts 控制)
        cream: 'var(--color-cream)',
        ink: 'var(--color-ink)',
        gold: 'var(--color-gold)',
        line: 'var(--color-line)',
        danger: 'var(--color-danger)',
        success: 'var(--color-success)',
        // 暗色模式专用: 与 cream/ink 解耦, 因为部分组件 bg-white 在暗色需切换
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
      },
      fontFamily: {
        display: ['"Noto Serif SC"', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        glow: 'var(--shadow-glow)',
      },
    },
  },
  plugins: [],
};