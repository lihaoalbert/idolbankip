/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F8F5F0',
        ink: '#0F0F0F',
        gold: '#C8A36B',
        line: '#E5E0D6',
        danger: '#D14343',
        success: '#3F9F65',
      },
      fontFamily: {
        display: ['"Noto Serif SC"', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 12px rgba(15,15,15,0.06)',
        glow: '0 0 0 4px rgba(200,163,107,0.18)',
      },
    },
  },
  plugins: [],
};