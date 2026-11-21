/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 50: '#eff6ff', 100: '#dbeafe', 600: '#1d4ed8', 800: '#1e3a8a', 900: '#0f172a', 950: '#020617' },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      keyframes: { 'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } } },
      animation: { 'fade-in': 'fade-in .18s ease-out' }
    }
  },
  plugins: []
};
