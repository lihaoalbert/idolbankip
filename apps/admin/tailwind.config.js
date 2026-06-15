/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts,js}'],
  theme: {
    extend: {
      colors: {
        cream: '#F8F5F0',
        ink: '#0F0F0F',
        gold: '#C8A36B',
        danger: '#C73E3A',
        success: '#2E7D5A',
        warn: '#D08C2B',
        line: '#E5E1DA',
      },
      fontFamily: {
        display: ['"Noto Serif SC"', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
