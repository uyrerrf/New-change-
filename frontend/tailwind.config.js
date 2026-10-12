/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        ui:   ['IBM Plex Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        accent: {
          DEFAULT: '#00B8FF',
          dim:     '#005880',
        },
      },
    },
  },
  plugins: [],
};
