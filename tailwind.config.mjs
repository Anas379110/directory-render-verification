/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        arabic: ['var(--font-plex)', '"IBM Plex Sans Arabic"', 'sans-serif'],
        display: ['var(--font-tajawal)', 'Tajawal', 'sans-serif'],
      },
      colors: {
        // هوية الدليل المعتمدة 2026-11-21: بترولي عميق + ذهبي دافئ + رملي فاتح
        brand: { DEFAULT: '#0D5C55', dark: '#093F3B', light: '#E6F2F0' },
        gold: { DEFAULT: '#C9A227', soft: '#F6ECCB' },
        sand: '#F7F4EF',
        ink: { DEFAULT: '#2A2622', soft: '#6B635B' },
        line: '#EAE3D8',
      },
    },
  },
  plugins: [],
};

export default config;
