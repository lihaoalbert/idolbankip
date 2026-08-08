/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // R8 调色板用 CSS 变量, .dark 类切换 (composables/useDarkMode.ts 控制)
        cream: 'var(--color-cream)',
        ink: 'var(--color-ink)',
        gold: 'var(--color-gold)',
        line: 'var(--color-line)',
        danger: 'var(--color-danger)',
        success: 'var(--color-success)',
        // 印章红 — 选中态/当前步/立即保存按钮/危险强调
        'stamp-red': 'var(--color-stamp-red)',
        // 暗色模式专用: 与 cream/ink 解耦, 因为部分组件 bg-white 在暗色需切换
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',

        // === R12 Studio Tech Console (additive; 静态 hex, 暂不与暗色模式联动) ===
        //    docs/design-system.md §2 — R12 visual baseline (R12.0 token commit)
        'r12-canvas': '#FAFAFA',
        'r12-surface': '#FFFFFF',
        'r12-ink-primary': '#09090B',
        'r12-ink-secondary': '#52525B',
        'r12-ink-tertiary': '#A1A1AA',
        'r12-line': '#E4E4E7',
        'r12-line-strong': '#D4D4D8',
        'r12-cobalt': '#2563EB',
        'r12-cobalt-hover': '#1D4ED8',
        'r12-cobalt-soft': '#DBEAFE',
        'r12-success': '#16A34A',
        'r12-success-soft': '#DCFCE7',
        'r12-warning': '#D97706',
        'r12-warning-soft': '#FEF3C7',
        'r12-danger': '#DC2626',
        'r12-danger-soft': '#FEE2E2',
      },
      fontFamily: {
        // R8 字体族 (保留, R8 页面继续使用)
        display: ['"Cormorant Garamond"', '"Noto Serif SC"', 'serif'],
        // 中文衬线标题场景
        serif: ['"Noto Serif SC"', '"Cormorant Garamond"', 'serif'],
        // 正文: Inter Tight 比 Inter 更紧凑, 时尚编辑感
        body: ['"Inter Tight"', '"Inter"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        // 中文正文
        sans: ['"Noto Sans SC"', '"Inter Tight"', 'system-ui', 'sans-serif'],
        // 元数据 / 编号 / 罗马数字
        mono: ['"JetBrains Mono"', '"Inter Tight"', 'monospace'],

        // R12 Studio Tech Console (additive) — docs/design-system.md §3
        'r12-sans': ['"Geist"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        'r12-mono': ['"Geist Mono"', '"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        // R12 Studio Tech Console — docs/design-system.md §3
        //   权重用单独类 font-medium / font-semibold, 此处只锁 size + lineHeight + tracking
        'r12-display': ['48px', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'r12-h1': ['32px', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'r12-h2': ['24px', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
        'r12-h3': ['20px', { lineHeight: '1.30' }],
        'r12-body': ['15px', { lineHeight: '1.60' }],
        'r12-caption': ['13px', { lineHeight: '1.45' }],
        'r12-micro': ['12px', { lineHeight: '1.30', letterSpacing: '0.04em' }],
        'r12-mono-body': ['13px', { lineHeight: '1.50' }],
        'r12-mono-num': ['14px', { lineHeight: '1.40' }],
        'r12-mono-num-lg': ['32px', { lineHeight: '1.40' }],
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
