/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0B1020',
        surface: '#141B34',
        surface2: '#1C2547',
        primary: '#7C5CFF',
        accent: '#22D3EE',
        success: '#34D399',
        warn: '#FBBF24',
        danger: '#FB7185',
        text: '#E8ECFF',
        muted: '#8B94B8',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Poppins', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

