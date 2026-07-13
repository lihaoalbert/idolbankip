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
        // Phase C Beta 加:印章红 — 选中态/当前步/立即保存按钮/危险强调
        'stamp-red': 'var(--color-stamp-red)',
        // 暗色模式专用: 与 cream/ink 解耦, 因为部分组件 bg-white 在暗色需切换
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
      },
      fontFamily: {
        // 主标题: 古典衬线 Cormorant Garamond (swash / italic 极有辨识度), 中文 fallback 到 Noto Serif SC
        display: ['"Cormorant Garamond"', '"Noto Serif SC"', 'serif'],
        // 中文衬线标题场景
        serif: ['"Noto Serif SC"', '"Cormorant Garamond"', 'serif'],
        // 正文: Inter Tight 比 Inter 更紧凑, 时尚编辑感
        body: ['"Inter Tight"', '"Inter"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        // 中文正文
        sans: ['"Noto Sans SC"', '"Inter Tight"', 'system-ui', 'sans-serif'],
        // 元数据 / 编号 / 罗马数字
        mono: ['"JetBrains Mono"', '"Inter Tight"', 'monospace'],
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        glow: 'var(--shadow-glow)',
        archive: 'var(--shadow-archive)',
      },
      letterSpacing: {
        catalog: '0.32em',
        archive: '0.42em',
      },
      borderWidth: {
        DEFAULT: '1px',
        '0': '0',
        '0.5': '0.5px',
        '1': '1px',
        '2': '2px',
      },
      // R8.0: 圆角 token 新增, 不覆盖 Tailwind 默认 rounded-* 类 (老代码继续用默认)
      // 新代码用 r8-radius-* 别名 (0/2/4/8) — R8.1/2/3 commit 逐步替换 rounded-full/xl/2xl
      borderRadius: {
        'r8-none': '0',
        'r8-sm': '2px',
        'r8-md': '4px',
        'r8-lg': '8px',
      },
      // R8.0: z-index token 统一, 避免散用 z-10/20/30/40/50
      zIndex: {
        base: '0',
        float: '10',
        sticky: '20',
        overlay: '30',
        modal: '40',
        toast: '50',
      },
      // R8.0: 过渡时长统一, hover fast / 默认 base / 慢动效 slow
      transitionDuration: {
        DEFAULT: '200ms',
        fast: '120ms',
        base: '200ms',
        slow: '400ms',
      },
      animation: {
        'reveal-up': 'revealUp 1.1s cubic-bezier(0.22, 1, 0.36, 1) both',
        'reveal-fade': 'revealFade 1.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        'ticker': 'ticker 40s linear infinite',
        'pulse-slow': 'pulseSlow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        revealUp: {
          '0%': { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        revealFade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pulseSlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
    },
  },
  plugins: [],
};