/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './pill.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        bg2: v('bg2'),
        surface: v('surface'),
        surface2: v('surface2'),
        line: v('line'),
        primary: v('primary'),
        'primary-ink': v('primary-ink'),
        accent: v('accent'),
        success: v('success'),
        warn: v('warn'),
        danger: v('danger'),
        text: v('text'),
        soft: v('soft'),
        muted: v('muted'),
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'sans-serif'],
        display: ['Poppins', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
